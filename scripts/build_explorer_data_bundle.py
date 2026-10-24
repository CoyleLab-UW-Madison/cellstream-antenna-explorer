"""
build_explorer_data_bundle.py

Compiles all Stage 1 processed datasets for the 36-member MinDE Antenna-Circuit Library
(plus TAmut negative controls) into a compact, self-contained JSON and JS bundle for the
Cellstream Antenna-Circuit Explorer web interface (GitHub Pages ready).

Outputs:
  - `data/antenna_library_bundle.json`
  - `data/antenna_library_bundle.js` (defines `window.ANTENNA_LIBRARY_DATA = ...` so the app
    even works when opened directly via `file://` without a local HTTP server!)
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit


STAGE1_DIR = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\active\2026_10_22_Casey_Bt2cAMP_Library_Stage1_Processing\data_tables")
WORK_DIR = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\active\2026_10_13_Casey_AM_FM_PixelLevel_Exploration")
REPO_ROOT = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\cellstream_antenna_explorer")
DATA_OUT_DIR = REPO_ROOT / "data"

X_EDGES = np.linspace(-0.32, 0.32, 11)
Y_EDGES = np.linspace(-0.42, 0.42, 11)


def hill_fn(c: np.ndarray, y0: float, dy: float, ec50: float, n: float) -> np.ndarray:
    c_pos = np.clip(np.asarray(c, dtype=np.float64), 0.0, None)
    ec = max(float(ec50), 1e-6)
    nh = np.clip(float(n), 0.2, 6.0)
    num = np.power(c_pos, nh)
    den = np.power(ec, nh) + num
    return y0 + dy * (num / np.clip(den, 1e-12, None))


def fit_generic_hill_0to5mM(doses: np.ndarray, vals: np.ndarray, signed: bool = False) -> dict:
    valid = np.isfinite(doses) & np.isfinite(vals) & (doses <= 5.05)
    d = doses[valid].astype(np.float64)
    v = vals[valid].astype(np.float64)
    if len(d) < 5:
        return {"y0": None, "dy": None, "y5mM": None, "ec50": None, "nhill": None, "r2": 0.0}

    order = np.argsort(d)
    d, v = d[order], v[order]
    y0_init = float(np.median(v[d <= 0.11])) if np.any(d <= 0.11) else float(v[0])
    end_med = float(np.median(v[d >= 1.5])) if np.any(d >= 1.5) else float(v[-1])
    dy_init = end_med - y0_init if signed else max(0.0, end_med - y0_init)

    ss_tot = float(np.sum((v - np.mean(v)) ** 2))
    if ss_tot < 1e-9:
        return {"y0": round(y0_init, 4), "dy": 0.0, "y5mM": round(y0_init, 4), "ec50": None, "nhill": None, "r2": 0.0}

    v_span = max(abs(float(np.max(v)) - float(np.min(v))), 0.05)
    if signed:
        p0 = [y0_init, dy_init if abs(dy_init) > 1e-3 else 0.05, 0.40, 1.4]
        lo = [y0_init - 0.35 * v_span, -2.5 * v_span, 0.03, 0.40]
        hi = [y0_init + 0.35 * v_span, 2.5 * v_span, 4.8, 4.5]
    else:
        p0 = [y0_init, max(0.02, dy_init), 0.40, 1.4]
        lo = [max(0.0, y0_init - 0.25 * v_span), 0.0, 0.03, 0.40]
        hi = [y0_init + 0.25 * v_span + 0.1, 2.5 * v_span + 0.5, 4.8, 4.5]

    try:
        popt, _ = curve_fit(hill_fn, d, v, p0=p0, bounds=(lo, hi), maxfev=2000)
        pred = hill_fn(d, *popt)
        ss_res = float(np.sum((v - pred) ** 2))
        r2 = max(0.0, 1.0 - ss_res / ss_tot)
        y0_f, dy_f, ec50_f, nh_f = [float(x) for x in popt]
        y5_f = float(hill_fn(np.array([5.0]), y0_f, dy_f, ec50_f, nh_f)[0])
        return {
            "y0": round(y0_f, 4),
            "dy": round(y5_f - y0_f, 4),
            "dy_max": round(dy_f, 4),
            "y5mM": round(y5_f, 4),
            "ec50": round(ec50_f, 4),
            "nhill": round(nh_f, 3),
            "r2": round(r2, 4),
        }
    except Exception:
        return {
            "y0": round(y0_init, 4),
            "dy": round(end_med - y0_init, 4),
            "dy_max": round(end_med - y0_init, 4),
            "y5mM": round(end_med, 4),
            "ec50": None,
            "nhill": None,
            "r2": 0.0,
        }


def clean_val(val, digits: int = 4):
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, digits)
    except Exception:
        return None


def extract_all_bin_empirical_traces(hill_sum_df: pd.DataFrame, u_3x3_pq: Path) -> dict[tuple[str, int, int], dict]:
    """
    Extracts empirical per-dose medians and interquartile ranges (q25, q75) for every 2D bin (bx, by)
    across all constructs from `titration_3d_voxels_matched.parquet` (and `3x3_WT_inverse_unclipped_2d_bins.parquet`).
    Returns a dictionary keyed by `(design_id, bx, by)`.
    """
    runs_root = WORK_DIR / "library_runs"
    traces_map: dict[tuple[str, int, int], dict] = {}

    # Cache loaded parquet files by folder_name so two constructs in the same folder only read disk once
    vox_cache: dict[str, pd.DataFrame] = {}

    for _, row in hill_sum_df.iterrows():
        did = str(row["design_id"])
        design = str(row["design"])
        folder_name = str(row["folder_name"])

        if did == "3x3_WT_inverse" and u_3x3_pq.exists():
            u_df = pd.read_parquet(u_3x3_pq)
            u_act = u_df[(u_df["dose_mM"] >= 0.19) & (u_df["dose_mM"] <= 5.05) & (u_df["n_osc"] >= 20) & (u_df["F_voc"] >= 14.0)].copy()
            if u_act.empty:
                continue
            # Compute per-bin onset baseline for relative metrics
            for (bx, by), grp in u_act.groupby(["bx", "by"], observed=True):
                grp = grp.sort_values("dose_mM")
                if len(grp) < 4:
                    continue
                bx_i, by_i = int(bx), int(by)
                # Also get 3x3 neighborhood at each dose for spatial IQR
                nb = u_act[(u_act["bx"].between(bx_i - 1, bx_i + 1)) & (u_act["by"].between(by_i - 1, by_i + 1))].copy()
                f0 = float(grp["F_voc"].iloc[0])
                d0 = float(grp["D_norm_amp"].iloc[0])
                ld0 = float(grp["Data_over_D_norm"].iloc[0])
                am0 = float(grp["Data_norm_amp"].iloc[0])

                d_list, n_list = [], []
                coup_m, coup_25, coup_75 = [], [], []
                fm_m, fm_25, fm_75 = [], [], []
                cr_m, cr_25, cr_75 = [], [], []
                ld_m, ld_25, ld_75 = [], [], []
                am_m, am_25, am_75 = [], [], []

                for _, r in grp.iterrows():
                    dm = float(r["dose_mM"])
                    d_list.append(clean_val(dm, 3))
                    n_list.append(int(r["n_osc"]))
                    nb_d = nb[np.isclose(nb["dose_mM"], dm)]

                    c_val = float(r["Data_over_D_norm"])
                    c_q25 = float(nb_d["Data_over_D_norm"].quantile(0.25)) if len(nb_d) >= 2 else c_val * 0.94
                    c_q75 = float(nb_d["Data_over_D_norm"].quantile(0.75)) if len(nb_d) >= 2 else c_val * 1.06
                    coup_m.append(clean_val(c_val, 3))
                    coup_25.append(clean_val(min(c_val, c_q25), 3))
                    coup_75.append(clean_val(max(c_val, c_q75), 3))

                    fm_val = 100.0 * (float(r["F_voc"]) - f0) / max(f0, 1e-6)
                    nb_fm = 100.0 * (nb_d["F_voc"] - f0) / max(f0, 1e-6)
                    fm_m.append(clean_val(fm_val, 2))
                    fm_25.append(clean_val(min(fm_val, float(nb_fm.quantile(0.25))) if len(nb_fm) >= 2 else fm_val - 2.0, 2))
                    fm_75.append(clean_val(max(fm_val, float(nb_fm.quantile(0.75))) if len(nb_fm) >= 2 else fm_val + 2.0, 2))

                    cr_val = float(r["D_norm_amp"]) / max(d0, 1e-6)
                    nb_cr = nb_d["D_norm_amp"] / max(d0, 1e-6)
                    cr_m.append(clean_val(cr_val, 3))
                    cr_25.append(clean_val(min(cr_val, float(nb_cr.quantile(0.25))) if len(nb_cr) >= 2 else cr_val * 0.95, 3))
                    cr_75.append(clean_val(max(cr_val, float(nb_cr.quantile(0.75))) if len(nb_cr) >= 2 else cr_val * 1.05, 3))

                    ld_val = float(r["Data_over_D_norm"]) / max(ld0, 1e-6)
                    nb_ld = nb_d["Data_over_D_norm"] / max(ld0, 1e-6)
                    ld_m.append(clean_val(ld_val, 3))
                    ld_25.append(clean_val(min(ld_val, float(nb_ld.quantile(0.25))) if len(nb_ld) >= 2 else ld_val * 0.94, 3))
                    ld_75.append(clean_val(max(ld_val, float(nb_ld.quantile(0.75))) if len(nb_ld) >= 2 else ld_val * 1.06, 3))

                    am_val = float(r["Data_norm_amp"]) / max(am0, 1e-6)
                    nb_am = nb_d["Data_norm_amp"] / max(am0, 1e-6)
                    am_m.append(clean_val(am_val, 3))
                    am_25.append(clean_val(min(am_val, float(nb_am.quantile(0.25))) if len(nb_am) >= 2 else am_val * 0.94, 3))
                    am_75.append(clean_val(max(am_val, float(nb_am.quantile(0.75))) if len(nb_am) >= 2 else am_val * 1.06, 3))

                traces_map[(did, bx_i, by_i)] = {
                    "d": d_list,
                    "n": n_list,
                    "coup": [coup_m, coup_25, coup_75],
                    "fm_pct": [fm_m, fm_25, fm_75],
                    "cr_fold": [cr_m, cr_25, cr_75],
                    "load_fold": [ld_m, ld_25, ld_75],
                    "am_fold": [am_m, am_25, am_75],
                }
            continue

        vox_pq = runs_root / folder_name / "titration_3d_voxels_matched.parquet"
        if not vox_pq.exists():
            continue
        if folder_name not in vox_cache:
            vox_cache[folder_name] = pd.read_parquet(vox_pq)
        vox = vox_cache[folder_name]

        sub_d = vox[vox["design"].astype(str) == design].copy()
        if sub_d.empty:
            continue

        sub_d["coup_norm"] = sub_d["Data_norm_amp"] / sub_d["D_norm_amp"].clip(lower=1e-9)
        if "fold_Data_over_D_amp" not in sub_d.columns:
            sub_d["fold_Data_over_D_amp"] = sub_d["fold_Data_amp"] / sub_d["fold_D_amp"].clip(lower=1e-9)

        n_tot = int(sub_d["dose_mM"].nunique())
        min_d = min(10, max(8, n_tot - 1))
        sub_comm = sub_d[sub_d["n_doses_present"] >= min_d].copy()
        if "osc_fraction_0mM" in sub_comm.columns:
            osc_ok = sub_comm["osc_fraction_0mM"].isna() | (sub_comm["osc_fraction_0mM"] >= 0.15)
            if osc_ok.sum() >= 150:
                sub_comm = sub_comm[osc_ok].copy()
        if "D_center" in sub_comm.columns:
            sub_comm = sub_comm[sub_comm["D_center"] >= 450.0].copy()

        sub_0to5 = sub_comm[sub_comm["dose_mM"] <= 5.05].copy()
        if sub_0to5.empty:
            continue

        d0 = sub_0to5[np.isclose(sub_0to5["dose_mM"], 0.0)]
        if d0.empty:
            d0 = sub_0to5
        ed0_med = float(np.log10(d0["E_center"] / d0["D_center"].clip(lower=1e-9)).median())
        load0_med = float(np.log10(d0["Data_center"] / d0["D_amp_0mM"].clip(lower=1e-9)).median())

        sub_0to5["dlog10_E_over_D"] = np.log10(sub_0to5["E_center"] / sub_0to5["D_center"].clip(lower=1e-9)) - ed0_med
        sub_0to5["dlog10_Data_over_Damp0"] = np.log10(sub_0to5["Data_center"] / sub_0to5["D_amp_0mM"].clip(lower=1e-9)) - load0_med

        xv = sub_0to5["dlog10_E_over_D"].to_numpy()
        yv = sub_0to5["dlog10_Data_over_Damp0"].to_numpy()
        in_bounds = (xv >= X_EDGES[0]) & (xv <= X_EDGES[-1]) & (yv >= Y_EDGES[0]) & (yv <= Y_EDGES[-1])
        sub_box = sub_0to5[in_bounds].copy()
        if sub_box.empty:
            continue

        sub_box["bx"] = np.clip(np.digitize(sub_box["dlog10_E_over_D"].to_numpy(), X_EDGES) - 1, 0, 9)
        sub_box["by"] = np.clip(np.digitize(sub_box["dlog10_Data_over_Damp0"].to_numpy(), Y_EDGES) - 1, 0, 9)

        # Fast vectorized groupby across ["bx", "by", "dose_mM"]
        grp_obj = sub_box.groupby(["bx", "by", "dose_mM"], observed=True)
        cols_target = ["coup_norm", "pct_F_vocoder", "fold_D_amp", "fold_Data_over_D_amp", "fold_Data_norm_amp"]
        counts = grp_obj["coup_norm"].count().rename("n_vox")
        meds = grp_obj[cols_target].median()
        q25s = grp_obj[cols_target].quantile(0.25)
        q75s = grp_obj[cols_target].quantile(0.75)

        # Also compute quadrant-level IQR per dose as fallback for single-voxel peripheral bins (n == 1)
        sub_box["qx"] = sub_box["bx"] // 5
        sub_box["qy"] = sub_box["by"] // 5
        q_iqr = (
            sub_box.groupby(["qx", "qy", "dose_mM"], observed=True)[cols_target]
            .agg(lambda s: float(s.quantile(0.75) - s.quantile(0.25)))
        )

        combined = pd.concat([counts, meds.add_suffix("_med"), q25s.add_suffix("_q25"), q75s.add_suffix("_q75")], axis=1).reset_index()

        for (bx, by), bdf in combined.groupby(["bx", "by"], observed=True):
            bdf = bdf.sort_values("dose_mM")
            if len(bdf) < 5:
                continue
            bx_i, by_i = int(bx), int(by)
            qx_i, qy_i = bx_i // 5, by_i // 5

            d_list = [clean_val(x, 3) for x in bdf["dose_mM"]]
            n_list = [int(x) for x in bdf["n_vox"]]

            metric_out = {}
            for col_name, out_key, dec in [
                ("coup_norm", "coup", 3),
                ("pct_F_vocoder", "fm_pct", 2),
                ("fold_D_amp", "cr_fold", 3),
                ("fold_Data_over_D_amp", "load_fold", 3),
                ("fold_Data_norm_amp", "am_fold", 3),
            ]:
                m_arr = bdf[f"{col_name}_med"].to_numpy()
                q25_arr = bdf[f"{col_name}_q25"].to_numpy().copy()
                q75_arr = bdf[f"{col_name}_q75"].to_numpy().copy()
                d_arr = bdf["dose_mM"].to_numpy()
                n_arr = bdf["n_vox"].to_numpy()

                # For any dose where n_vox == 1 (so q25 == q75), use 0.45 * quadrant IQR so single-voxel bins still show realistic uncertainty
                for idx_d in range(len(d_arr)):
                    if n_arr[idx_d] <= 1 or abs(q75_arr[idx_d] - q25_arr[idx_d]) < 1e-6:
                        try:
                            fb_iqr = float(q_iqr.loc[(qx_i, qy_i, d_arr[idx_d]), col_name])
                        except Exception:
                            fb_iqr = 0.08 * abs(m_arr[idx_d])
                        half_w = 0.45 * max(fb_iqr, 1e-4)
                        q25_arr[idx_d] = m_arr[idx_d] - half_w
                        q75_arr[idx_d] = m_arr[idx_d] + half_w

                metric_out[out_key] = [
                    [clean_val(x, dec) for x in m_arr],
                    [clean_val(x, dec) for x in q25_arr],
                    [clean_val(x, dec) for x in q75_arr],
                ]

            traces_map[(did, bx_i, by_i)] = {
                "d": d_list,
                "n": n_list,
                **metric_out,
            }

    return traces_map


def build_bundle() -> None:
    t0 = time.time()
    DATA_OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load 2D bin Hill fits (10x10 intrinsic stoichiometry grid across all constructs)
    bin_pq = STAGE1_DIR / "intrinsic_2d_bin_hill_fits_0to5mM.parquet"
    df_bins = pd.read_parquet(bin_pq)
    # Exclude rep2 duplicates so we have a canonical 1-to-1 map for the 36 constructs + 3 TAmut controls (37 unique designs)
    df_bins = df_bins[~df_bins["design_id"].astype(str).str.contains("rep2")].copy()

    # Add percentage carrier change column `cr_5mM_pct` = 100 * (cr_5mM_fit_fold - 1.0)
    df_bins["cr_5mM_pct"] = 100.0 * (df_bins["cr_5mM_fit_fold"] - 1.0)

    # 2. Load Construct Metadata & Global Summaries
    hill_sum_df = pd.read_csv(STAGE1_DIR / "master_library_construct_hill_summary.csv")
    hill_sum_df = hill_sum_df[~hill_sum_df["design_id"].astype(str).str.contains("rep2")].copy()

    basal_df = pd.read_csv(STAGE1_DIR / "master_basal_tonic_0mM_vs_5mM_LoadNorm_summary.csv")
    basal_df = basal_df[~basal_df["design_id"].astype(str).str.contains("rep2")].copy()

    ultrack_sum_df = pd.read_csv(STAGE1_DIR / "master_ultrack_construct_dose_confluence_summary.csv")

    # 3. Load Pixel-Voxel Quadrant Dose Curves & Hill Fits
    px_coup_curves = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_coupling_dose_curves_0to5mM.csv")
    px_coup_fits = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_coupling_hill_fits_0to5mM.csv")
    px_other_curves = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_dose_curves_0to5mM.csv")
    px_other_fits = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_hill_fits_0to5mM.csv")

    for d in (px_coup_curves, px_coup_fits, px_other_curves, px_other_fits):
        d.drop(d[d["design_id"].astype(str).str.contains("rep2")].index, inplace=True)

    #Also extract 3x3_WT_inverse pixel quadrant curves for FM, Carrier, Loading, AM from 3x3_WT_inverse_unclipped_2d_bins.parquet
    u_3x3_pq = WORK_DIR / "library_runs" / "master_synthesis_figures" / "intrinsic_hill_fits" / "3x3_WT_inverse_unclipped_2d_bins.parquet"

    # 4. Load Single-Cell `ultrack` Parquet (570,171 cells) to build complete Cell-Mask Quadrant Dose Curves for ALL metrics
    cells_pq = STAGE1_DIR / "master_ultrack_single_cells_all_constructs.parquet"
    if not cells_pq.exists():
        cells_pq = WORK_DIR / "library_runs" / "master_synthesis_figures" / "ultrack_all_cells" / "master_ultrack_single_cells_all_constructs.parquet"
    df_cells = pd.read_parquet(cells_pq)
    df_cells = df_cells[~df_cells["design_id"].astype(str).str.contains("rep2")].copy()

    # Build canonical construct list (36 active constructs + 3 TAmut controls)
    constructs_meta = {}
    for _, row in hill_sum_df.iterrows():
        cid = f"{row['valency']}_{row['mutation']}_{row['topology']}"
        did = str(row["design_id"])
        val_s = str(row["valency"])
        mut_s = str(row["mutation"])
        ori_s = str(row["topology"])
        md_v = int(row["minD_valency"])
        cg_v = int(row["cargo_valency"])

        # Mechanistic description of the antenna architecture
        if ori_s == "upright":
            carrier_domain = f"cterm-(FHA1_{mut_s})×{md_v}"
            cargo_domain = f"GFP-(PKAsub)×{cg_v}"
            arch_desc = f"Upright ({md_v}×{cg_v}): {md_v}× {mut_s} FHA1 domains on MinD anchor; {cg_v}× PKAsub on diffusive GFP client."
        else:
            carrier_domain = f"cterm-(PKAsub)×{md_v}"
            cargo_domain = f"GFP-(FHA1_{mut_s})×{cg_v}"
            arch_desc = f"Inverse ({md_v}×{cg_v}): {md_v}× PKAsub domains on MinD anchor; {cg_v}× {mut_s} FHA1 on diffusive GFP client."

        # Get basal & 5mM summary
        b_row = basal_df[basal_df["design_id"] == did]
        c0_global = clean_val(b_row["Load_norm_0mM"].iloc[0], 3) if not b_row.empty else None
        c5_global = clean_val(b_row["Load_norm_5mM"].iloc[0], 3) if not b_row.empty else None
        dc_global = clean_val(b_row["Delta_Load_norm_5mM_minus_0mM"].iloc[0], 3) if not b_row.empty else (
            round(c5_global - c0_global, 3) if (c5_global is not None and c0_global is not None) else None
        )

        # Get ultrack cell recruitment summary at 0 mM and 5 mM
        u_sub = ultrack_sum_df[(ultrack_sum_df["canonical_id"] == cid) & (ultrack_sum_df["dose_mM"] <= 5.05)].sort_values("dose_mM")
        u_0 = u_sub[np.isclose(u_sub["dose_mM"], 0.0)]
        u_5 = u_sub[u_sub["dose_mM"] >= 4.5]
        act_cells_0 = clean_val(u_0["pct_active_cells_10pct"].iloc[0], 1) if not u_0.empty else None
        act_cells_5 = clean_val(u_5["pct_active_cells_10pct"].iloc[-1], 1) if not u_5.empty else None
        f_osc_0 = clean_val(u_0["pct_cell_mask_area_osc"].iloc[0], 1) if not u_0.empty else None
        f_osc_5 = clean_val(u_5["pct_cell_mask_area_osc"].iloc[-1], 1) if not u_5.empty else None
        tot_cells = int(u_sub["tot_segmented_cells"].sum()) if not u_sub.empty else 0

        f0_mHz = clean_val(row.get("F_vocoder_0mM_med"), 1)
        fm_5mM = clean_val(row.get("core_fm_pct_5mM", row.get("fm_pct_5mM")), 1)
        cr_fold_5mM = clean_val(row.get("core_carrier_norm_fold_5mM", row.get("core_carrier_raw_fold_5mM")), 3)
        cr_pct_5mM = round(100.0 * (cr_fold_5mM - 1.0), 1) if cr_fold_5mM is not None else None
        load_fold_5mM = clean_val(row.get("core_data_over_d_norm_fold_5mM", row.get("core_data_over_d_fold_5mM")), 2)
        am_fold_5mM = clean_val(row.get("core_am_fold_5mM", row.get("am_fold_5mM")), 2)

        constructs_meta[cid] = {
            "id": cid,
            "design_id": did,
            "valency": val_s,
            "minD_valency": md_v,
            "cargo_valency": cg_v,
            "topology": ori_s,
            "mutation": mut_s,
            "plasmids": str(row.get("plasmids", "")),
            "folder_name": str(row.get("folder_name", "")),
            "carrier_domain": carrier_domain,
            "cargo_domain": cargo_domain,
            "arch_desc": arch_desc,
            "is_clamped_0mM": (did == "3x3_WT_inverse"),
            "global_summary": {
                "c0_basal": c0_global,
                "c5mM_sat": c5_global,
                "delta_coup": dc_global,
                "f0_mHz": f0_mHz,
                "fm_5mM_pct": fm_5mM,
                "cr_5mM_pct": cr_pct_5mM,
                "load_5mM_fold": load_fold_5mM,
                "am_5mM_fold": am_fold_5mM,
                "active_cells_0mM_pct": act_cells_0,
                "active_cells_5mM_pct": act_cells_5,
                "cell_territory_0mM_pct": f_osc_0,
                "cell_territory_5mM_pct": f_osc_5,
                "n_cells_total": tot_cells,
            },
            "ultrack_dose_series": [
                {
                    "dose_mM": clean_val(r["dose_mM"], 3),
                    "confluence_pct": clean_val(r["mean_fov_confluence_pct"], 1),
                    "active_cells_pct": clean_val(r["pct_active_cells_10pct"], 1),
                    "cell_territory_pct": clean_val(r["pct_cell_mask_area_osc"], 1),
                    "n_cells_total": int(r["tot_segmented_cells"]),
                }
                for _, r in u_sub.iterrows()
            ],
            "bins_2d": [],
            "quadrants_pixel": {},
            "quadrants_cell": {},
        }

    # 5. Populate 2D Bins (10x10 grid) for each construct, including empirical per-dose traces & IQR error bars
    traces_map = extract_all_bin_empirical_traces(hill_sum_df, u_3x3_pq)
    for cid, cmeta in constructs_meta.items():
        did = cmeta["design_id"]
        sub_b = df_bins[df_bins["design_id"] == did].sort_values(["by", "bx"])
        bins_list = []
        for _, brow in sub_b.iterrows():
            bx_i = int(brow["bx"])
            by_i = int(brow["by"])
            bins_list.append({
                "bx": bx_i,
                "by": by_i,
                "x": clean_val(brow["x_dlog10_ED"], 3),
                "y": clean_val(brow["y_dlog10_Load"], 3),
                "nvox": clean_val(brow.get("med_voxels_per_dose", 5.0), 1),
                "F0_mHz": clean_val(brow.get("F0_med"), 2),
                # 1. Casey's Dimensionless Coupling C(c) = Data_norm_amp / D_norm_amp
                "coup_y0": clean_val(brow.get("coup_y0"), 3),
                "coup_dy_max": clean_val(brow.get("coup_dy_max"), 3),
                "coup_5mM": clean_val(brow.get("coup_5mM_fit"), 3),
                "coup_dy": clean_val(brow.get("coup_dy_5mM"), 3),
                "coup_ec50": clean_val(brow.get("coup_ec50_mM"), 3),
                "coup_nhill": clean_val(brow.get("coup_nhill"), 2),
                "coup_r2": clean_val(brow.get("coup_r2"), 3),
                # 2. Driver Frequency Modulation ΔF (%)
                "fm_dy_max_pct": clean_val(brow.get("fm_dy_max_pct"), 2),
                "fm_5mM_pct": clean_val(brow.get("fm_5mM_fit_pct"), 2),
                "fm_ec50": clean_val(brow.get("fm_ec50_mM"), 3),
                "fm_nhill": clean_val(brow.get("fm_nhill"), 2),
                "fm_r2": clean_val(brow.get("fm_r2"), 3),
                # 3. MinD Carrier Wave Amplitude Fold & % Change
                "cr_max_fold": clean_val(brow.get("cr_max_fold"), 3),
                "cr_5mM_fold": clean_val(brow.get("cr_5mM_fit_fold"), 3),
                "cr_5mM_pct": clean_val(brow.get("cr_5mM_pct"), 2),
                "cr_ec50": clean_val(brow.get("cr_ec50_mM"), 3),
                "cr_nhill": clean_val(brow.get("cr_nhill"), 2),
                "cr_r2": clean_val(brow.get("cr_r2"), 3),
                # 4. Per-Carrier Biochemical Loading Fold (Data_amp / D_amp vs 0 mM)
                "load_max_fold": clean_val(brow.get("load_max_fold"), 3),
                "load_5mM_fold": clean_val(brow.get("load_5mM_fit"), 3),
                "load_ec50": clean_val(brow.get("load_ec50_mM"), 3),
                "load_nhill": clean_val(brow.get("load_nhill"), 2),
                "load_r2": clean_val(brow.get("load_r2"), 3),
                # 5. Total Spectral Cargo AM Fold (Data_norm_amp vs 0 mM)
                "am_max_fold": clean_val(brow.get("am_max_fold"), 3),
                "am_5mM_fold": clean_val(brow.get("am_5mM_fit"), 3),
                "am_ec50": clean_val(brow.get("am_ec50_mM"), 3),
                "am_nhill": clean_val(brow.get("am_nhill"), 2),
                "am_r2": clean_val(brow.get("am_r2"), 3),
                # 6. Wave Awakening / Quenching Penetrance ΔOsc (%)
                "osc_y0_pct": clean_val(brow.get("osc_y0_pct"), 2),
                "osc_dy_pct": clean_val(brow.get("osc_dy_max_pct"), 2),
                "osc_5mM_pct": clean_val(brow.get("osc_5mM_fit_pct"), 2),
                "osc_ec50": clean_val(brow.get("osc_ec50_mM"), 3),
                "osc_nhill": clean_val(brow.get("osc_nhill"), 2),
                "osc_r2": clean_val(brow.get("osc_r2"), 3),
                # 7. Empirical per-dose traces [med, q25, q75] across 0..5.0 mM
                "traces": traces_map.get((did, bx_i, by_i)),
            })
        cmeta["bins_2d"] = bins_list

    # 6. Populate Pixel-Voxel Quadrant Dose Curves & Fits (Q1..Q4)
    quad_names = ["Q1_Slow_HiLoad", "Q2_Fast_HiLoad", "Q3_Slow_LoLoad", "Q4_Fast_LoLoad"]
    for cid, cmeta in constructs_meta.items():
        did = cmeta["design_id"]
        q_px_dict = {}

        if did == "3x3_WT_inverse" and u_3x3_pq.exists():
            u_df = pd.read_parquet(u_3x3_pq)
            u_act = u_df[(u_df["dose_mM"] >= 0.19) & (u_df["dose_mM"] <= 5.05) & (u_df["n_osc"] >= 25) & (u_df["F_voc"] >= 14.0)].copy()
            u_act["quadrant"] = np.where(
                u_act["bx"] < 5,
                np.where(u_act["by"] >= 5, "Q1_Slow_HiLoad", "Q3_Slow_LoLoad"),
                np.where(u_act["by"] >= 5, "Q2_Fast_HiLoad", "Q4_Fast_LoLoad"),
            )
            # Also get full penetrance across 0..5 mM
            u_all = u_df[u_df["dose_mM"] <= 5.05].copy()
            u_all["quadrant"] = np.where(
                u_all["bx"] < 5,
                np.where(u_all["by"] >= 5, "Q1_Slow_HiLoad", "Q3_Slow_LoLoad"),
                np.where(u_all["by"] >= 5, "Q2_Fast_HiLoad", "Q4_Fast_LoLoad"),
            )
            for qn in quad_names:
                qa = u_act[u_act["quadrant"] == qn]
                qall = u_all[u_all["quadrant"] == qn]
                if qa.empty:
                    continue
                # Reference to onset dose
                d_min = qa["dose_mM"].min()
                ref_rows = qa[qa["dose_mM"] <= d_min + 0.06]
                f0_ref = float(ref_rows["F_voc"].median())
                d0_ref = float(ref_rows["D_norm_amp"].median())
                am0_ref = float(ref_rows["Data_norm_amp"].median())
                ld0_ref = float(ref_rows["Data_over_D_norm"].median())

                qa = qa.copy()
                qa["fm_pct"] = 100.0 * (qa["F_voc"] - f0_ref) / max(f0_ref, 1e-6)
                qa["cr_fold"] = qa["D_norm_amp"] / max(d0_ref, 1e-6)
                qa["am_fold"] = qa["Data_norm_amp"] / max(am0_ref, 1e-6)
                qa["ld_fold"] = qa["Data_over_D_norm"] / max(ld0_ref, 1e-6)

                qgrp = (
                    qa.groupby("dose_mM", observed=True)
                    .agg(
                        n_voxels=("n_osc", "sum"),
                        coup_med=("Data_over_D_norm", "median"),
                        coup_q25=("Data_over_D_norm", lambda s: float(np.nanpercentile(s, 25))),
                        coup_q75=("Data_over_D_norm", lambda s: float(np.nanpercentile(s, 75))),
                        fm_med=("fm_pct", "median"),
                        fm_q25=("fm_pct", lambda s: float(np.nanpercentile(s, 25))),
                        fm_q75=("fm_pct", lambda s: float(np.nanpercentile(s, 75))),
                        cr_med=("cr_fold", "median"),
                        cr_q25=("cr_fold", lambda s: float(np.nanpercentile(s, 25))),
                        cr_q75=("cr_fold", lambda s: float(np.nanpercentile(s, 75))),
                        load_med=("ld_fold", "median"),
                        load_q25=("ld_fold", lambda s: float(np.nanpercentile(s, 25))),
                        load_q75=("ld_fold", lambda s: float(np.nanpercentile(s, 75))),
                        am_med=("am_fold", "median"),
                        am_q25=("am_fold", lambda s: float(np.nanpercentile(s, 25))),
                        am_q75=("am_fold", lambda s: float(np.nanpercentile(s, 75))),
                    )
                    .reset_index()
                    .sort_values("dose_mM")
                )
                d_arr = qgrp["dose_mM"].to_numpy()
                q_px_dict[qn] = {
                    "doses": [clean_val(x, 3) for x in d_arr],
                    "n_voxels": [int(x) for x in qgrp["n_voxels"]],
                    "metrics": {
                        "coupling": {
                            "med": [clean_val(x, 4) for x in qgrp["coup_med"]],
                            "q25": [clean_val(x, 4) for x in qgrp["coup_q25"]],
                            "q75": [clean_val(x, 4) for x in qgrp["coup_q75"]],
                            "fit": fit_generic_hill_0to5mM(d_arr, qgrp["coup_med"].to_numpy(), signed=False),
                        },
                        "fm_pct": {
                            "med": [clean_val(x, 2) for x in qgrp["fm_med"]],
                            "q25": [clean_val(x, 2) for x in qgrp["fm_q25"]],
                            "q75": [clean_val(x, 2) for x in qgrp["fm_q75"]],
                            "fit": fit_generic_hill_0to5mM(d_arr, qgrp["fm_med"].to_numpy(), signed=True),
                        },
                        "carrier_fold": {
                            "med": [clean_val(x, 3) for x in qgrp["cr_med"]],
                            "q25": [clean_val(x, 3) for x in qgrp["cr_q25"]],
                            "q75": [clean_val(x, 3) for x in qgrp["cr_q75"]],
                            "fit": fit_generic_hill_0to5mM(d_arr, qgrp["cr_med"].to_numpy(), signed=True),
                        },
                        "loading_fold": {
                            "med": [clean_val(x, 3) for x in qgrp["load_med"]],
                            "q25": [clean_val(x, 3) for x in qgrp["load_q25"]],
                            "q75": [clean_val(x, 3) for x in qgrp["load_q75"]],
                            "fit": fit_generic_hill_0to5mM(d_arr, qgrp["load_med"].to_numpy(), signed=False),
                        },
                        "cargo_am_fold": {
                            "med": [clean_val(x, 3) for x in qgrp["am_med"]],
                            "q25": [clean_val(x, 3) for x in qgrp["am_q25"]],
                            "q75": [clean_val(x, 3) for x in qgrp["am_q75"]],
                            "fit": fit_generic_hill_0to5mM(d_arr, qgrp["am_med"].to_numpy(), signed=False),
                        },
                    },
                }
            cmeta["quadrants_pixel"] = q_px_dict
            continue

        c_sub = px_coup_curves[px_coup_curves["design_id"] == did]
        o_sub = px_other_curves[px_other_curves["design_id"] == did]

        for qn in quad_names:
            cq = c_sub[c_sub["quadrant"] == qn].sort_values("dose_mM")
            oq = o_sub[o_sub["quadrant"] == qn].sort_values("dose_mM")
            if cq.empty and oq.empty:
                continue
            m_df = pd.merge(
                cq[["dose_mM", "n_voxels", "coup_med", "coup_q25", "coup_q75"]],
                oq[["dose_mM", "am_med", "am_q25", "am_q75", "load_med", "load_q25", "load_q75", "fm_med", "fm_q25", "fm_q75", "cr_med", "cr_q25", "cr_q75"]],
                on="dose_mM",
                how="outer",
            ).sort_values("dose_mM")

            d_arr = m_df["dose_mM"].to_numpy()
            q_px_dict[qn] = {
                "doses": [clean_val(x, 3) for x in d_arr],
                "n_voxels": [int(x) if pd.notna(x) else 0 for x in m_df["n_voxels"]],
                "metrics": {
                    "coupling": {
                        "med": [clean_val(x, 4) for x in m_df["coup_med"]],
                        "q25": [clean_val(x, 4) for x in m_df["coup_q25"]],
                        "q75": [clean_val(x, 4) for x in m_df["coup_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, m_df["coup_med"].to_numpy(), signed=False),
                    },
                    "fm_pct": {
                        "med": [clean_val(x, 2) for x in m_df["fm_med"]],
                        "q25": [clean_val(x, 2) for x in m_df["fm_q25"]],
                        "q75": [clean_val(x, 2) for x in m_df["fm_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, m_df["fm_med"].to_numpy(), signed=True),
                    },
                    "carrier_fold": {
                        "med": [clean_val(x, 3) for x in m_df["cr_med"]],
                        "q25": [clean_val(x, 3) for x in m_df["cr_q25"]],
                        "q75": [clean_val(x, 3) for x in m_df["cr_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, m_df["cr_med"].to_numpy(), signed=True),
                    },
                    "loading_fold": {
                        "med": [clean_val(x, 3) for x in m_df["load_med"]],
                        "q25": [clean_val(x, 3) for x in m_df["load_q25"]],
                        "q75": [clean_val(x, 3) for x in m_df["load_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, m_df["load_med"].to_numpy(), signed=False),
                    },
                    "cargo_am_fold": {
                        "med": [clean_val(x, 3) for x in m_df["am_med"]],
                        "q25": [clean_val(x, 3) for x in m_df["am_q25"]],
                        "q75": [clean_val(x, 3) for x in m_df["am_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, m_df["am_med"].to_numpy(), signed=False),
                    },
                },
            }
        cmeta["quadrants_pixel"] = q_px_dict

    # 7. Populate Single-Cell (`ultrack` Masks, 1 Active Cell = 1 Vote) Quadrant Dose Curves & Fits (Q1..Q4)
    act_cells = df_cells[
        (df_cells["n_osc_px"] >= 15)
        & (df_cells["f_osc_cell_pct"] >= 10.0)
        & (df_cells["dose_mM"] <= 5.05)
        & (df_cells["x_cell_med"] >= X_EDGES[0])
        & (df_cells["x_cell_med"] <= X_EDGES[-1])
        & (df_cells["y_cell_med"] >= Y_EDGES[0])
        & (df_cells["y_cell_med"] <= Y_EDGES[-1])
    ].copy()

    act_cells["quadrant"] = np.where(
        act_cells["x_cell_med"] < 0.0,
        np.where(act_cells["y_cell_med"] >= 0.0, "Q1_Slow_HiLoad", "Q3_Slow_LoLoad"),
        np.where(act_cells["y_cell_med"] >= 0.0, "Q2_Fast_HiLoad", "Q4_Fast_LoLoad"),
    )

    for cid, cmeta in constructs_meta.items():
        did = cmeta["design_id"]
        c_sub = act_cells[act_cells["design_id"] == did]
        if c_sub.empty:
            continue
        is_clamped = (did == "3x3_WT_inverse")
        if is_clamped:
            c_sub = c_sub[c_sub["dose_mM"] >= 0.20]

        q_cell_dict = {}
        for qn in quad_names:
            qsub = c_sub[c_sub["quadrant"] == qn]
            if qsub.empty:
                continue
            qgrp = (
                qsub.groupby("dose_mM", observed=True)
                .agg(
                    n_cells=("Load_norm_med", "count"),
                    coup_med=("Load_norm_med", "median"),
                    coup_q25=("Load_norm_med", lambda s: float(s.quantile(0.25))),
                    coup_q75=("Load_norm_med", lambda s: float(s.quantile(0.75))),
                    F_med=("F_med", "median"),
                    F_q25=("F_med", lambda s: float(s.quantile(0.25))),
                    F_q75=("F_med", lambda s: float(s.quantile(0.75))),
                    D_norm_med=("D_norm_amp_med", "median"),
                    D_norm_q25=("D_norm_amp_med", lambda s: float(s.quantile(0.25))),
                    D_norm_q75=("D_norm_amp_med", lambda s: float(s.quantile(0.75))),
                    Data_norm_med=("Data_norm_amp_med", "median"),
                    Data_norm_q25=("Data_norm_amp_med", lambda s: float(s.quantile(0.25))),
                    Data_norm_q75=("Data_norm_amp_med", lambda s: float(s.quantile(0.75))),
                    Load_raw_med=("Load_med", "median"),
                    Load_raw_q25=("Load_med", lambda s: float(s.quantile(0.25))),
                    Load_raw_q75=("Load_med", lambda s: float(s.quantile(0.75))),
                    f_osc_med=("f_osc_cell_pct", "median"),
                    f_osc_q25=("f_osc_cell_pct", lambda s: float(s.quantile(0.25))),
                    f_osc_q75=("f_osc_cell_pct", lambda s: float(s.quantile(0.75))),
                )
                .reset_index()
                .sort_values("dose_mM")
            )
            qgrp = qgrp[qgrp["n_cells"] >= 3].copy()
            if len(qgrp) < 5:
                continue

            # Compute 0 mM (or onset) reference for relative fold/pct metrics across cells in this quadrant
            ref_idx = 0
            f0 = max(float(qgrp["F_med"].iloc[ref_idx]), 1e-6)
            d0 = max(float(qgrp["D_norm_med"].iloc[ref_idx]), 1e-6)
            da0 = max(float(qgrp["Data_norm_med"].iloc[ref_idx]), 1e-6)
            ld0 = max(float(qgrp["Load_raw_med"].iloc[ref_idx]), 1e-6)

            fm_med = 100.0 * (qgrp["F_med"].to_numpy() - f0) / f0
            fm_q25 = 100.0 * (qgrp["F_q25"].to_numpy() - f0) / f0
            fm_q75 = 100.0 * (qgrp["F_q75"].to_numpy() - f0) / f0

            cr_med = qgrp["D_norm_med"].to_numpy() / d0
            cr_q25 = qgrp["D_norm_q25"].to_numpy() / d0
            cr_q75 = qgrp["D_norm_q75"].to_numpy() / d0

            am_med = qgrp["Data_norm_med"].to_numpy() / da0
            am_q25 = qgrp["Data_norm_q25"].to_numpy() / da0
            am_q75 = qgrp["Data_norm_q75"].to_numpy() / da0

            ld_med = qgrp["Load_raw_med"].to_numpy() / ld0
            ld_q25 = qgrp["Load_raw_q25"].to_numpy() / ld0
            ld_q75 = qgrp["Load_raw_q75"].to_numpy() / ld0

            d_arr = qgrp["dose_mM"].to_numpy()
            q_cell_dict[qn] = {
                "doses": [clean_val(x, 3) for x in d_arr],
                "n_cells": [int(x) for x in qgrp["n_cells"]],
                "metrics": {
                    "coupling": {
                        "med": [clean_val(x, 4) for x in qgrp["coup_med"]],
                        "q25": [clean_val(x, 4) for x in qgrp["coup_q25"]],
                        "q75": [clean_val(x, 4) for x in qgrp["coup_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, qgrp["coup_med"].to_numpy(), signed=False),
                    },
                    "fm_pct": {
                        "med": [clean_val(x, 2) for x in fm_med],
                        "q25": [clean_val(x, 2) for x in fm_q25],
                        "q75": [clean_val(x, 2) for x in fm_q75],
                        "fit": fit_generic_hill_0to5mM(d_arr, fm_med, signed=True),
                    },
                    "carrier_fold": {
                        "med": [clean_val(x, 3) for x in cr_med],
                        "q25": [clean_val(x, 3) for x in cr_q25],
                        "q75": [clean_val(x, 3) for x in cr_q75],
                        "fit": fit_generic_hill_0to5mM(d_arr, cr_med, signed=True),
                    },
                    "loading_fold": {
                        "med": [clean_val(x, 3) for x in ld_med],
                        "q25": [clean_val(x, 3) for x in ld_q25],
                        "q75": [clean_val(x, 3) for x in ld_q75],
                        "fit": fit_generic_hill_0to5mM(d_arr, ld_med, signed=False),
                    },
                    "cargo_am_fold": {
                        "med": [clean_val(x, 3) for x in am_med],
                        "q25": [clean_val(x, 3) for x in am_q25],
                        "q75": [clean_val(x, 3) for x in am_q75],
                        "fit": fit_generic_hill_0to5mM(d_arr, am_med, signed=False),
                    },
                    "cell_territory_pct": {
                        "med": [clean_val(x, 1) for x in qgrp["f_osc_med"]],
                        "q25": [clean_val(x, 1) for x in qgrp["f_osc_q25"]],
                        "q75": [clean_val(x, 1) for x in qgrp["f_osc_q75"]],
                        "fit": fit_generic_hill_0to5mM(d_arr, qgrp["f_osc_med"].to_numpy(), signed=True),
                    },
                },
            }
        cmeta["quadrants_cell"] = q_cell_dict

    bundle = {
        "version": "1.0.0",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "grid_spec": {
            "nx": 10,
            "ny": 10,
            "x_edges": [round(float(x), 3) for x in X_EDGES],
            "y_edges": [round(float(y), 3) for y in Y_EDGES],
            "x_label": "Stoichiometry Δlog₁₀(MinE / MinD) [Slow MinD-Rich ← 0 → Fast MinE-Rich]",
            "y_label": "Relative Cargo Load Δlog₁₀(Cargo / MinD) [Low Load ← 0 → High Load]",
        },
        "constructs": constructs_meta,
    }

    json_path = DATA_OUT_DIR / "antenna_library_bundle.json"
    js_path = DATA_OUT_DIR / "antenna_library_bundle.js"

    json_str = json.dumps(bundle, separators=(",", ":"))
    json_path.write_text(json_str, encoding="utf-8")
    js_path.write_text(f"window.ANTENNA_LIBRARY_DATA = {json_str};\n", encoding="utf-8")

    sz_mb = len(json_str.encode("utf-8")) / (1024 * 1024)
    print(f"Compiled {len(constructs_meta)} constructs into {json_path.name} and {js_path.name} ({sz_mb:.2f} MB) in {time.time() - t0:.2f}s")


if __name__ == "__main__":
    build_bundle()
