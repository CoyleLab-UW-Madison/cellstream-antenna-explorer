"""
build_z_slices_bundle.py

Compiles the 3rd-Variable ("Core Sample") Z-Slice data for every 2D bin `(bx, by)`
across all 38 constructs and all 8 coordinate projections (4 Self-Centered + 4 Global Shared).

Crucially, every projection's 3rd variable `Z` uses the EXACT 10-bin axis (`nz = 10`, `11` edges)
that the normal 2D Phase Portrait uses when plotting that variable:
  - Global Shared (`log₁₀ AU`):
      * `d_vs_cargo_abs` & `damp_vs_cargo_abs` -> Z = `abs_log10_E`     in [3.95, 4.75] (10 bins, Mid 4.35, matching `d_vs_e_abs` Y-axis)
      * `d_vs_e_abs`                           -> Z = `abs_log10_Cargo` in [2.80, 4.28] (10 bins, Mid 3.54, matching `d_vs_cargo_abs` Y-axis)
      * `ed_vs_load_abs`                       -> Z = `abs_log10_D`     in [2.22, 3.62] (10 bins, Mid 2.92, matching `d_vs_cargo_abs` X-axis)
  - Self-Centered (`Δlog₁₀` relative to construct 0 mM median, with physical `med_z` offset stored):
      * `d_vs_cargo` & `damp_vs_cargo`         -> Z = `dlog10_E`        in [-0.28, +0.28] (10 bins, Mid 0.0, matching `d_vs_e` Y-axis)
      * `d_vs_e`                               -> Z = `dlog10_Cargo`    in [-0.45, +0.45] (10 bins, Mid 0.0, matching `d_vs_cargo` Y-axis)
      * `ed_vs_load`                           -> Z = `dlog10_D`        in [-0.36, +0.36] (10 bins, Mid 0.0, matching `d_vs_cargo` X-axis)

In addition to each 2D bin `(bx, by)`'s core sample slices (`s`) and Z-tertiles (`t`),
also stores `whole` (the whole construct's 10-bin 3rd-variable profile pooled across all `(bx, by)` bins)
so the inspector can render the clicked bin's core slice directly relative to the whole portrait on the full 10-bin axis.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
import numpy as np
import pandas as pd

from build_explorer_data_bundle import (
    PROJECTION_DEFS,
    STAGE1_DIR,
    WORK_DIR,
    DATA_OUT_DIR,
    clean_val,
    fit_generic_hill_0to5mM,
    prepare_construct_voxel_table,
)


Z_AXIS_SPECS = {
    # -------------------------------------------------------------------------
    # Self-Centered (Δlog₁₀) Projections — exact 10-bin axes from PROJECTION_DEFS
    # -------------------------------------------------------------------------
    "d_vs_cargo": {
        "z_col": "dlog10_E",
        "z_abs_col": "abs_log10_E",
        "z_med_key": "e",
        "is_global_abs": False,
        "z_edges": [round(float(x), 3) for x in np.linspace(-0.28, 0.28, 11)],
        "z_ticks": ["+0.25", "0.0", "-0.25"],
        "z_label": "MinE Regulator Expression Δlog₁₀(MinE) [Low MinE ← 0 → High MinE]",
        "z_short": "Δlog₁₀(MinE Expr)",
        "z_symbol": "MinE",
    },
    "damp_vs_cargo": {
        "z_col": "dlog10_E",
        "z_abs_col": "abs_log10_E",
        "z_med_key": "e",
        "is_global_abs": False,
        "z_edges": [round(float(x), 3) for x in np.linspace(-0.28, 0.28, 11)],
        "z_ticks": ["+0.25", "0.0", "-0.25"],
        "z_label": "MinE Regulator Expression Δlog₁₀(MinE) [Low MinE ← 0 → High MinE]",
        "z_short": "Δlog₁₀(MinE Expr)",
        "z_symbol": "MinE",
    },
    "d_vs_e": {
        "z_col": "dlog10_Cargo",
        "z_abs_col": "abs_log10_Cargo",
        "z_med_key": "cargo",
        "is_global_abs": False,
        "z_edges": [round(float(x), 3) for x in np.linspace(-0.45, 0.45, 11)],
        "z_ticks": ["+0.4", "0.0", "-0.4"],
        "z_label": "Client Cargo Expression Δlog₁₀(Cargo) [Low Cargo ← 0 → High Cargo]",
        "z_short": "Δlog₁₀(Cargo Expr)",
        "z_symbol": "Cargo",
    },
    "ed_vs_load": {
        "z_col": "dlog10_D",
        "z_abs_col": "abs_log10_D",
        "z_med_key": "d",
        "is_global_abs": False,
        "z_edges": [round(float(x), 3) for x in np.linspace(-0.36, 0.36, 11)],
        "z_ticks": ["+0.35", "0.0", "-0.35"],
        "z_label": "MinD Carrier Expression Δlog₁₀(MinD) [Low MinD ← 0 → High MinD]",
        "z_short": "Δlog₁₀(MinD Expr)",
        "z_symbol": "MinD",
    },
    # -------------------------------------------------------------------------
    # Global Shared (log₁₀ AU) Projections — exact 10-bin axes from PROJECTION_DEFS
    # -------------------------------------------------------------------------
    "d_vs_cargo_abs": {
        "z_col": "abs_log10_E",
        "z_abs_col": "abs_log10_E",
        "z_med_key": "e",
        "is_global_abs": True,
        "z_edges": [round(float(x), 3) for x in np.linspace(3.95, 4.75, 11)],
        "z_ticks": ["4.75", "4.35", "3.95"],
        "z_label": "Absolute MinE Expression log₁₀(MinE [AU]) [Global Mid = 4.35]",
        "z_short": "log₁₀(MinE AU) [Mid 4.35]",
        "z_symbol": "MinE",
    },
    "damp_vs_cargo_abs": {
        "z_col": "abs_log10_E",
        "z_abs_col": "abs_log10_E",
        "z_med_key": "e",
        "is_global_abs": True,
        "z_edges": [round(float(x), 3) for x in np.linspace(3.95, 4.75, 11)],
        "z_ticks": ["4.75", "4.35", "3.95"],
        "z_label": "Absolute MinE Expression log₁₀(MinE [AU]) [Global Mid = 4.35]",
        "z_short": "log₁₀(MinE AU) [Mid 4.35]",
        "z_symbol": "MinE",
    },
    "d_vs_e_abs": {
        "z_col": "abs_log10_Cargo",
        "z_abs_col": "abs_log10_Cargo",
        "z_med_key": "cargo",
        "is_global_abs": True,
        "z_edges": [round(float(x), 3) for x in np.linspace(2.80, 4.28, 11)],
        "z_ticks": ["4.28", "3.54", "2.80"],
        "z_label": "Absolute Client Cargo Expression log₁₀(Cargo [AU]) [Global Mid = 3.54]",
        "z_short": "log₁₀(Cargo AU) [Mid 3.54]",
        "z_symbol": "Cargo",
    },
    "ed_vs_load_abs": {
        "z_col": "abs_log10_D",
        "z_abs_col": "abs_log10_D",
        "z_med_key": "d",
        "is_global_abs": True,
        "z_edges": [round(float(x), 3) for x in np.linspace(2.22, 3.62, 11)],
        "z_ticks": ["3.62", "2.92", "2.22"],
        "z_label": "Absolute MinD Expression log₁₀(MinD [AU]) [Global Mid = 2.92]",
        "z_short": "log₁₀(MinD AU) [Mid 2.92]",
        "z_symbol": "MinD",
    },
}

METRIC_COLS = [
    ("coup_norm", "coup", 3, False, None),
    ("pct_F_vocoder", "fm_pct", 1, True, 0.0),
    ("fold_D_amp", "cr_fold", 2, True, 1.0),
    ("fold_Data_over_D_amp", "load_fold", 2, False, 1.0),
    ("fold_Data_norm_amp", "am_fold", 2, False, 1.0),
    ("osc_pct_col", "osc_pct", 1, True, None),
]


def _build_slices_from_grouped_df(z_bdf: pd.DataFrame, d_idx_map: dict[float, int], n_d: int, z_centers: np.ndarray) -> list[dict]:
    slices_list = []
    for bz, sgrp in z_bdf.groupby("bz", observed=True):
        bz_i = int(bz)
        sgrp = sgrp.sort_values("dose_mM")
        if len(sgrp) < 3:
            continue
        act_s = sgrp[sgrp["n_vox"] >= 1]
        idx_arr = [d_idx_map[float(d)] for d in sgrp["dose_mM"].to_numpy()]
        nv_med = float(act_s["n_vox"].median()) if not act_s.empty else 0.5
        if nv_med == int(nv_med):
            nv_med = int(nv_med)
        else:
            nv_med = round(nv_med, 1)

        s_metrics = {}
        has_any = False
        for col_name, out_key, dec, _, _ in METRIC_COLS:
            arr = [None] * n_d
            vals = sgrp[col_name].to_numpy()
            for i_pos, val in zip(idx_arr, vals):
                cv = clean_val(val, dec)
                arr[i_pos] = cv
                if cv is not None and (out_key != "osc_pct" or cv > 0):
                    has_any = True
            s_metrics[out_key] = arr

        if not has_any:
            continue

        slices_list.append({
            "bz": bz_i,
            "z": clean_val(z_centers[bz_i], 2),
            "nv": nv_med,
            "m": s_metrics,
        })
    return slices_list


def compute_z_slices_for_projection(sub_0to5: pd.DataFrame, proj_key: str) -> dict:
    pdef = PROJECTION_DEFS[proj_key]
    zspec = Z_AXIS_SPECS[proj_key]
    x_edges = np.asarray(pdef["x_edges"], dtype=np.float64)
    y_edges = np.asarray(pdef["y_edges"], dtype=np.float64)
    z_edges = np.asarray(zspec["z_edges"], dtype=np.float64)
    z_centers = 0.5 * (z_edges[:-1] + z_edges[1:])
    nz = len(z_centers)  # Always 10 bins (matching the 10x10 2D portraits!)

    col_map = {
        "ed_vs_load": ("dlog10_ED", "dlog10_Load"),
        "damp_vs_cargo": ("dlog10_Damp0", "dlog10_Cargo"),
        "d_vs_e": ("dlog10_D", "dlog10_E"),
        "d_vs_cargo": ("dlog10_D", "dlog10_Cargo"),
        "ed_vs_load_abs": ("abs_log10_ED", "abs_log10_Load"),
        "damp_vs_cargo_abs": ("abs_log10_Damp0", "abs_log10_Cargo"),
        "d_vs_e_abs": ("abs_log10_D", "abs_log10_E"),
        "d_vs_cargo_abs": ("abs_log10_D", "abs_log10_Cargo"),
    }
    x_col, y_col = col_map[proj_key]
    z_col = zspec["z_col"]
    z_abs_col = zspec["z_abs_col"]

    xv = sub_0to5[x_col].to_numpy()
    yv = sub_0to5[y_col].to_numpy()
    zv = sub_0to5[z_col].to_numpy()
    in_bounds = (
        (xv >= x_edges[0]) & (xv <= x_edges[-1])
        & (yv >= y_edges[0]) & (yv <= y_edges[-1])
        & (zv >= z_edges[0]) & (zv <= z_edges[-1])
    )
    sub_box = sub_0to5[in_bounds].copy()
    if sub_box.empty:
        return {}

    sub_box["bx"] = np.clip(np.digitize(sub_box[x_col].to_numpy(), x_edges) - 1, 0, 9)
    sub_box["by"] = np.clip(np.digitize(sub_box[y_col].to_numpy(), y_edges) - 1, 0, 9)
    sub_box["bz"] = np.clip(np.digitize(sub_box[z_col].to_numpy(), z_edges) - 1, 0, nz - 1)

    target_cols = [c[0] for c in METRIC_COLS]

    # 0. Whole-construct 10-bin Z profile (`_whole`) across all (bx, by) bins
    d_whole_all = np.sort(sub_box["dose_mM"].unique())
    d_whole_list = [clean_val(d, 3) for d in d_whole_all]
    d_whole_map = {float(d): i for i, d in enumerate(d_whole_all)}
    grp_w = sub_box.groupby(["bz", "dose_mM"], observed=True)
    w_counts = grp_w["coup_norm"].count().rename("n_vox")
    w_meds = grp_w[target_cols].median()
    w_comb = pd.concat([w_counts, w_meds], axis=1).reset_index()
    whole_slices = _build_slices_from_grouped_df(w_comb, d_whole_map, len(d_whole_all), z_centers)

    meds_0mM = sub_0to5.attrs.get("medians_0mM", {})
    med_z_val = meds_0mM.get(zspec["z_med_key"], None)

    # 1. Aggregate per (bx, by, bz, dose_mM)
    grp_z = sub_box.groupby(["bx", "by", "bz", "dose_mM"], observed=True)
    z_counts = grp_z["coup_norm"].count().rename("n_vox")
    z_meds = grp_z[target_cols].median()
    z_comb = pd.concat([z_counts, z_meds], axis=1).reset_index()
    z_by_bin = {k: g for k, g in z_comb.groupby(["bx", "by"], observed=True)}

    # 2. Assign Z-tertiles (0=Low, 1=Mid, 2=High) within each (bx, by) based on unique 3D voxels
    cols_u = list(dict.fromkeys(["bx", "by", "bin_D", "bin_E", "bin_Data", z_col, z_abs_col]))
    vox_unique = sub_box[cols_u].drop_duplicates(
        ["bx", "by", "bin_D", "bin_E", "bin_Data"]
    ).copy()

    def _assign_tertile_group(df_g: pd.DataFrame) -> pd.DataFrame:
        z_arr = df_g[z_col].to_numpy()
        u_z = np.unique(z_arr)
        if len(u_z) <= 1:
            df_g["zt"] = 1
        elif len(u_z) == 2:
            df_g["zt"] = np.where(z_arr <= u_z[0], 0, 2)
        else:
            q33, q67 = np.percentile(z_arr, [33.3, 66.7])
            if q33 == q67:
                df_g["zt"] = np.where(z_arr < q33, 0, np.where(z_arr > q67, 2, 1))
            else:
                df_g["zt"] = np.where(z_arr <= q33, 0, np.where(z_arr <= q67, 1, 2))
        return df_g

    vox_unique = vox_unique.groupby(["bx", "by"], group_keys=False, observed=True).apply(_assign_tertile_group)
    sub_box = sub_box.merge(
        vox_unique[["bx", "by", "bin_D", "bin_E", "bin_Data", "zt"]],
        on=["bx", "by", "bin_D", "bin_E", "bin_Data"],
        how="left",
    )

    t_zmeds = vox_unique.groupby(["bx", "by", "zt"], observed=True).agg(
        count=(z_col, "count"),
        med_z=(z_col, "median"),
        med_abs=(z_abs_col, "median"),
    ).reset_index()
    t_zmed_lookup = {
        (int(r["bx"]), int(r["by"]), int(r["zt"])): (
            int(r["count"]),
            round(float(r["med_z"]), 2),
            round(float(r["med_abs"]), 2),
        )
        for _, r in t_zmeds.iterrows()
    }

    grp_t = sub_box.groupby(["bx", "by", "zt", "dose_mM"], observed=True)
    t_counts = grp_t["coup_norm"].count().rename("n_vox")
    t_meds = grp_t[target_cols].median()
    t_comb = pd.concat([t_counts, t_meds], axis=1).reset_index()
    t_by_bin = {k: g for k, g in t_comb.groupby(["bx", "by"], observed=True)}

    bins_out = {
        "_meta": {
            "med_z": med_z_val,
            "d": d_whole_list,
            "whole_s": whole_slices,
        }
    }
    for (bx, by), z_bdf in z_by_bin.items():
        bx_i, by_i = int(bx), int(by)
        d_all = np.sort(z_bdf["dose_mM"].unique())
        if len(d_all) < 4:
            continue

        d_list = [clean_val(d, 3) for d in d_all]
        d_idx_map = {float(d): i for i, d in enumerate(d_all)}
        n_d = len(d_all)

        slices_list = _build_slices_from_grouped_df(z_bdf, d_idx_map, n_d, z_centers)
        if not slices_list:
            continue

        # Build Z-tertile curves (0=Low, 1=Mid, 2=High)
        tertiles_dict = {}
        t_bdf = t_by_bin.get((bx, by))
        if t_bdf is not None:
            for zt_id, t_key in [(0, "lo"), (1, "mid"), (2, "hi")]:
                tgrp = t_bdf[t_bdf["zt"] == zt_id].sort_values("dose_mM")
                if len(tgrp) < 4:
                    continue
                n_vox_t, z_med_t, z_abs_t = t_zmed_lookup.get((bx_i, by_i, zt_id), (1, 0.0, 0.0))
                td_arr = tgrp["dose_mM"].to_numpy()
                t_idx_arr = [d_idx_map[float(d)] for d in td_arr]

                t_metrics = {}
                for col_name, out_key, dec, signed, fix_y0 in METRIC_COLS:
                    vals = tgrp[col_name].to_numpy()
                    arr = [None] * n_d
                    for i_pos, val in zip(t_idx_arr, vals):
                        arr[i_pos] = clean_val(val, dec)
                    fit = fit_generic_hill_0to5mM(td_arr, vals, signed=signed, fixed_y0=fix_y0)
                    t_metrics[out_key] = {
                        "v": arr,
                        "f": [
                            clean_val(fit["y0"], dec),
                            clean_val(fit["y5mM"], dec),
                            clean_val(fit["ec50"], 2),
                            clean_val(fit["nhill"], 2),
                            clean_val(fit["r2"], 2),
                        ],
                    }

                tertiles_dict[t_key] = {
                    "z": z_med_t,
                    "za": z_abs_t,
                    "nv": n_vox_t,
                    "m": t_metrics,
                }

        bins_out[f"{bx_i}_{by_i}"] = {
            "d": d_list,
            "s": slices_list,
            "t": tertiles_dict,
        }

    return bins_out


def main() -> None:
    t0 = time.time()
    DATA_OUT_DIR.mkdir(parents=True, exist_ok=True)

    hill_sum_df = pd.read_csv(STAGE1_DIR / "master_library_construct_hill_summary.csv")
    hill_sum_df = hill_sum_df[~hill_sum_df["design_id"].astype(str).str.contains("rep2")].copy()

    runs_root = WORK_DIR / "library_runs"
    vox_cache: dict[str, pd.DataFrame] = {}

    bundle_abs = {
        "z_specs": {k: v for k, v in Z_AXIS_SPECS.items() if k.endswith("_abs")},
        "constructs": {},
    }
    bundle_self = {
        "z_specs": {k: v for k, v in Z_AXIS_SPECS.items() if not k.endswith("_abs")},
        "constructs": {},
    }

    for _, row in hill_sum_df.iterrows():
        cid = f"{row['valency']}_{row['mutation']}_{row['topology']}"
        did = str(row["design_id"])
        design = str(row["design"])
        folder_name = str(row["folder_name"])

        vox_pq = runs_root / folder_name / "titration_3d_voxels_unclipped.parquet"
        if not vox_pq.exists():
            vox_pq = runs_root / folder_name / "titration_3d_voxels_matched.parquet"

        cache_key = str(vox_pq)
        if vox_pq.exists():
            if cache_key not in vox_cache:
                vox_cache[cache_key] = pd.read_parquet(vox_pq)
            sub_0to5 = prepare_construct_voxel_table(vox_cache[cache_key], design, did)
        else:
            sub_0to5 = pd.DataFrame()

        bundle_abs["constructs"][cid] = {}
        bundle_self["constructs"][cid] = {}
        if sub_0to5.empty:
            continue

        for proj_key in Z_AXIS_SPECS:
            bins_z = compute_z_slices_for_projection(sub_0to5, proj_key)
            if proj_key.endswith("_abs"):
                bundle_abs["constructs"][cid][proj_key] = bins_z
            else:
                bundle_self["constructs"][cid][proj_key] = bins_z

    js_abs_path = DATA_OUT_DIR / "antenna_z_slices_abs.js"
    js_self_path = DATA_OUT_DIR / "antenna_z_slices_self.js"

    str_abs = json.dumps(bundle_abs, separators=(",", ":"))
    str_self = json.dumps(bundle_self, separators=(",", ":"))

    js_abs_path.write_text(f"window.ANTENNA_Z_SLICES_ABS = {str_abs};\n", encoding="utf-8")
    js_self_path.write_text(f"window.ANTENNA_Z_SLICES_SELF = {str_self};\n", encoding="utf-8")

    mb_abs = len(str_abs.encode("utf-8")) / (1024 * 1024)
    mb_self = len(str_self.encode("utf-8")) / (1024 * 1024)
    print(
        f"Built 10-bin Z-slice bundles in {time.time() - t0:.1f}s:\n"
        f"  - {js_abs_path.name}: {mb_abs:.2f} MB\n"
        f"  - {js_self_path.name}: {mb_self:.2f} MB"
    )


if __name__ == "__main__":
    main()
