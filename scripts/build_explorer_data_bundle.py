"""
build_explorer_data_bundle.py

Compiles all Stage 1 processed datasets for the 36-member MinDE Antenna-Circuit Library
(plus TAmut negative controls) into a compact, self-contained JSON and JS bundle for the
Cellstream Antenna-Circuit Explorer web interface (GitHub Pages ready).

Supports 4 Interactive 2D Coordinate Projections across all 38 constructs:
  1. `ed_vs_load` (Default): Δlog₁₀(MinE/MinD) vs Δlog₁₀(Cargo/D_amp,0) [Stoichiometric Ratio Space]
  2. `damp_vs_cargo`:        Δlog₁₀(D_amp,0) vs Δlog₁₀(Cargo)           [Carrier Wave Power vs Client Abundance]
  3. `d_vs_e`:               Δlog₁₀(MinD) vs Δlog₁₀(MinE)               [Classic MinDE Driver Phase Plane]
  4. `d_vs_cargo`:           Δlog₁₀(MinD) vs Δlog₁₀(Cargo)              [Static Anchor vs Client Expression]

Outputs:
  - `data/antenna_library_bundle.json`
  - `data/antenna_library_bundle.js`
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
import numpy as np
import pandas as pd


STAGE1_DIR = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\active\2026_10_22_Casey_Bt2cAMP_Library_Stage1_Processing\data_tables")
WORK_DIR = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\active\2026_10_13_Casey_AM_FM_PixelLevel_Exploration")
REPO_ROOT = Path(r"C:\Users\smcoyle\Dropbox\CODEBASE\cellstream_antenna_explorer")
DATA_OUT_DIR = REPO_ROOT / "data"

X_EDGES = np.linspace(-0.32, 0.32, 11)
Y_EDGES = np.linspace(-0.42, 0.42, 11)

PROJECTION_DEFS = {
    "ed_vs_load": {
        "key": "ed_vs_load",
        "shortLabel": "1. Stoichiometry Ratios: Cargo/D_amp vs E/D (Default)",
        "name": "Stoichiometric Ratio Space — Δlog₁₀(Cargo/D_amp) vs Δlog₁₀(MinE/MinD)",
        "x_edges": [round(float(x), 3) for x in np.linspace(-0.32, 0.32, 11)],
        "y_edges": [round(float(y), 3) for y in np.linspace(-0.42, 0.42, 11)],
        "x_label": "Stoichiometry Δlog₁₀(MinE / MinD) [Slow MinD-Rich ← 0 → Fast MinE-Rich]",
        "y_label": "Relative Cargo Load Δlog₁₀(Cargo / D_amp,0) [Low Load ← 0 → High Load]",
        "x_canvas_label": "Δlog₁₀(MinE/MinD) [Slow → Fast]",
        "y_canvas_label": "Δlog₁₀(Cargo/D_amp)",
        "x_short": "Δlog₁₀(E/D)",
        "y_short": "Δlog₁₀(Cargo/D)",
        "x_ticks": ["-0.3", "0.0", "+0.3"],
        "y_ticks": ["+0.4", "0.0", "-0.4"],
        "quad_labels": {
            "Q1_Slow_HiLoad": "Q1: Slow (Hi D/E) + Hi Load",
            "Q2_Fast_HiLoad": "Q2: Fast (Hi E/D) + Hi Load",
            "Q3_Slow_LoLoad": "Q3: Slow (Hi D/E) + Lo Load",
            "Q4_Fast_LoLoad": "Q4: Fast (Hi E/D) + Lo Load",
        },
        "quad_short": {
            "Q1_Slow_HiLoad": "Q1: Slow+HiLoad",
            "Q2_Fast_HiLoad": "Q2: Fast+HiLoad",
            "Q3_Slow_LoLoad": "Q3: Slow+LoLoad",
            "Q4_Fast_LoLoad": "Q4: Fast+LoLoad",
        },
    },
    "damp_vs_cargo": {
        "key": "damp_vs_cargo",
        "shortLabel": "2. Carrier Power vs Client: Cargo vs D_amp (E float)",
        "name": "Carrier Wave Power vs Client Abundance — Δlog₁₀(Cargo) vs Δlog₁₀(D_amp,0)",
        "x_edges": [round(float(x), 3) for x in np.linspace(-0.36, 0.36, 11)],
        "y_edges": [round(float(y), 3) for y in np.linspace(-0.45, 0.45, 11)],
        "x_label": "Baseline Carrier Wave Amplitude Δlog₁₀(D_amp,0mM) [Weak Wave ← 0 → Strong Wave]",
        "y_label": "Client Cargo Expression Δlog₁₀(Cargo) [Low Cargo ← 0 → High Cargo]",
        "x_canvas_label": "Δlog₁₀(MinD Wave D_amp,0) [Weak → Strong]",
        "y_canvas_label": "Δlog₁₀(Cargo Expr)",
        "x_short": "Δlog₁₀(D_amp,0)",
        "y_short": "Δlog₁₀(Cargo)",
        "x_ticks": ["-0.35", "0.0", "+0.35"],
        "y_ticks": ["+0.4", "0.0", "-0.4"],
        "quad_labels": {
            "Q1_Slow_HiLoad": "Q1: Weak D_amp + Hi Cargo",
            "Q2_Fast_HiLoad": "Q2: Strong D_amp + Hi Cargo",
            "Q3_Slow_LoLoad": "Q3: Weak D_amp + Lo Cargo",
            "Q4_Fast_LoLoad": "Q4: Strong D_amp + Lo Cargo",
        },
        "quad_short": {
            "Q1_Slow_HiLoad": "Q1: WeakD+HiCargo",
            "Q2_Fast_HiLoad": "Q2: StrongD+HiCargo",
            "Q3_Slow_LoLoad": "Q3: WeakD+LoCargo",
            "Q4_Fast_LoLoad": "Q4: StrongD+LoCargo",
        },
    },
    "d_vs_e": {
        "key": "d_vs_e",
        "shortLabel": "3. MinDE Phase Plane: MinE vs MinD (Cargo float)",
        "name": "Classic MinDE Driver Phase Plane — Δlog₁₀(MinE) vs Δlog₁₀(MinD)",
        "x_edges": [round(float(x), 3) for x in np.linspace(-0.36, 0.36, 11)],
        "y_edges": [round(float(y), 3) for y in np.linspace(-0.28, 0.28, 11)],
        "x_label": "MinD Carrier Expression Δlog₁₀(MinD) [Low MinD ← 0 → High MinD]",
        "y_label": "MinE Regulator Expression Δlog₁₀(MinE) [Low MinE ← 0 → High MinE]",
        "x_canvas_label": "Δlog₁₀(MinD Expr) [Lo D → Hi D]",
        "y_canvas_label": "Δlog₁₀(MinE Expr)",
        "x_short": "Δlog₁₀(MinD)",
        "y_short": "Δlog₁₀(MinE)",
        "x_ticks": ["-0.35", "0.0", "+0.35"],
        "y_ticks": ["+0.25", "0.0", "-0.25"],
        "quad_labels": {
            "Q1_Slow_HiLoad": "Q1: Lo MinD + Hi MinE (Fast)",
            "Q2_Fast_HiLoad": "Q2: Hi MinD + Hi MinE (Dense)",
            "Q3_Slow_LoLoad": "Q3: Lo MinD + Lo MinE (Dilute)",
            "Q4_Fast_LoLoad": "Q4: Hi MinD + Lo MinE (Slow)",
        },
        "quad_short": {
            "Q1_Slow_HiLoad": "Q1: LoD+HiE (Fast)",
            "Q2_Fast_HiLoad": "Q2: HiD+HiE (Dense)",
            "Q3_Slow_LoLoad": "Q3: LoD+LoE (Dilute)",
            "Q4_Fast_LoLoad": "Q4: HiD+LoE (Slow)",
        },
    },
    "d_vs_cargo": {
        "key": "d_vs_cargo",
        "shortLabel": "4. Static Expression: Cargo vs MinD (E float)",
        "name": "Static Anchor vs Client Expression — Δlog₁₀(Cargo) vs Δlog₁₀(MinD)",
        "x_edges": [round(float(x), 3) for x in np.linspace(-0.36, 0.36, 11)],
        "y_edges": [round(float(y), 3) for y in np.linspace(-0.45, 0.45, 11)],
        "x_label": "Static MinD Anchor Expression Δlog₁₀(MinD) [Low MinD ← 0 → High MinD]",
        "y_label": "Client Cargo Expression Δlog₁₀(Cargo) [Low Cargo ← 0 → High Cargo]",
        "x_canvas_label": "Δlog₁₀(MinD Static) [Lo D → Hi D]",
        "y_canvas_label": "Δlog₁₀(Cargo Expr)",
        "x_short": "Δlog₁₀(MinD)",
        "y_short": "Δlog₁₀(Cargo)",
        "x_ticks": ["-0.35", "0.0", "+0.35"],
        "y_ticks": ["+0.4", "0.0", "-0.4"],
        "quad_labels": {
            "Q1_Slow_HiLoad": "Q1: Lo MinD + Hi Cargo",
            "Q2_Fast_HiLoad": "Q2: Hi MinD + Hi Cargo",
            "Q3_Slow_LoLoad": "Q3: Lo MinD + Lo Cargo",
            "Q4_Fast_LoLoad": "Q4: Hi MinD + Lo Cargo",
        },
        "quad_short": {
            "Q1_Slow_HiLoad": "Q1: LoD+HiCargo",
            "Q2_Fast_HiLoad": "Q2: HiD+HiCargo",
            "Q3_Slow_LoLoad": "Q3: LoD+LoCargo",
            "Q4_Fast_LoLoad": "Q4: HiD+LoCargo",
        },
    },
}

# Precomputed vectorized Hill basis grid over (EC50 in [0.03, 4.8] mM, n_H in [0.40, 4.5])
EC_GRID = np.geomspace(0.03, 4.8, 40)[:, None]
NH_GRID = np.linspace(0.40, 4.5, 16)[None, :]
EC_FLAT = np.broadcast_to(EC_GRID, (40, 16)).ravel()
NH_FLAT = np.broadcast_to(NH_GRID, (40, 16)).ravel()
H_BASIS_CACHE: dict[tuple[float, ...], np.ndarray] = {}


def get_hill_basis(d: np.ndarray) -> np.ndarray:
    key = tuple(np.round(d, 4))
    if key not in H_BASIS_CACHE:
        d_pos = np.clip(d, 0.0, None)[None, :]
        num = np.power(d_pos, NH_FLAT[:, None])
        den = np.power(EC_FLAT[:, None], NH_FLAT[:, None]) + num
        H_BASIS_CACHE[key] = num / np.clip(den, 1e-12, None)
    return H_BASIS_CACHE[key]


def hill_fn(c: np.ndarray, y0: float, dy: float, ec50: float, n: float) -> np.ndarray:
    c_pos = np.clip(np.asarray(c, dtype=np.float64), 0.0, None)
    ec = max(float(ec50), 1e-6)
    nh = np.clip(float(n), 0.2, 6.0)
    num = np.power(c_pos, nh)
    den = np.power(ec, nh) + num
    return y0 + dy * (num / np.clip(den, 1e-12, None))


def fit_generic_hill_0to5mM(doses: np.ndarray, vals: np.ndarray, signed: bool = False, fixed_y0: float | None = None) -> dict:
    """
    Fast, globally optimal vectorized Hill curve fitter over 0..5.0 mM Bt2cAMP.
    """
    valid = np.isfinite(doses) & np.isfinite(vals) & (doses <= 5.05)
    d = doses[valid].astype(np.float64)
    v = vals[valid].astype(np.float64)
    if len(d) < 5:
        return {"y0": None, "dy": None, "dy_max": None, "y5mM": None, "ec50": None, "nhill": None, "r2": 0.0}

    order = np.argsort(d)
    d, v = d[order], v[order]
    y0_init = float(np.median(v[d <= 0.11])) if np.any(d <= 0.11) else float(v[0])
    ss_tot = float(np.sum((v - np.mean(v)) ** 2))
    if ss_tot < 1e-9:
        y0_out = fixed_y0 if fixed_y0 is not None else y0_init
        return {"y0": round(y0_out, 4), "dy": 0.0, "dy_max": 0.0, "y5mM": round(y0_out, 4), "ec50": None, "nhill": None, "r2": 0.0}

    H = get_hill_basis(d)
    if fixed_y0 is not None:
        y0_vec = np.full(len(EC_FLAT), float(fixed_y0))
        dv = v[None, :] - y0_vec[:, None]
        hh = np.sum(H * H, axis=1)
        dy_vec = np.sum(dv * H, axis=1) / np.clip(hh, 1e-12, None)
    else:
        h_mean = np.mean(H, axis=1, keepdims=True)
        v_mean = float(np.mean(v))
        dh = H - h_mean
        dv = v[None, :] - v_mean
        dy_vec = np.sum(dh * dv, axis=1) / np.clip(np.sum(dh * dh, axis=1), 1e-12, None)
        y0_vec = v_mean - dy_vec * h_mean.ravel()
        v_span = max(abs(float(np.max(v)) - float(np.min(v))), 0.05)
        y0_lo = (y0_init - 0.35 * v_span) if signed else max(0.0, y0_init - 0.25 * v_span)
        y0_hi = y0_init + 0.35 * v_span + 0.05
        y0_vec = np.clip(y0_vec, y0_lo, y0_hi)

    if not signed:
        dy_vec = np.maximum(0.0, dy_vec)

    pred = y0_vec[:, None] + dy_vec[:, None] * H
    sse = np.sum((v[None, :] - pred) ** 2, axis=1)
    best = int(np.argmin(sse))
    r2 = max(0.0, 1.0 - float(sse[best]) / ss_tot)
    y0_f = float(y0_vec[best])
    dy_f = float(dy_vec[best])
    ec50_f = float(EC_FLAT[best])
    nh_f = float(NH_FLAT[best])
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


def prepare_construct_voxel_table(vox: pd.DataFrame, design: str, did: str) -> pd.DataFrame:
    """
    Filters and normalizes the matched 3D voxel table for a construct, computing all four
    0 mM reference coordinates (`dlog10_ED`, `dlog10_Load`, `dlog10_D`, `dlog10_E`, `dlog10_Cargo`, `dlog10_Damp0`).
    """
    sub_d = vox[vox["design"].astype(str) == design].copy()
    if sub_d.empty:
        return pd.DataFrame()

    is_clamped = (did == "3x3_WT_inverse")
    if is_clamped:
        sub_0to5 = sub_d[(sub_d["dose_mM"] >= 0.19) & (sub_d["dose_mM"] <= 5.05)].dropna(subset=["F_vocoder"]).copy()
        if sub_0to5.empty:
            return pd.DataFrame()
        # Populate onset reference values per (bin_D, bin_E, bin_Data)
        d_min = sub_0to5["dose_mM"].min()
        ref = sub_0to5[sub_0to5["dose_mM"] <= d_min + 0.06]
        if ref.empty:
            ref = sub_0to5
        f0_ref = float(ref["F_vocoder"].median())
        d0_ref = float(ref["D_amp"].median())
        dn0_ref = float(ref["D_norm_amp"].median())
        da0_ref = float(ref["Data_amp"].median())
        dan0_ref = float(ref["Data_norm_amp"].median())

        sub_0to5["D_amp_0mM"] = sub_0to5["D_amp_0mM"].fillna(sub_0to5["D_amp"])
        sub_0to5["F_vocoder_0mM"] = sub_0to5["F_vocoder_0mM"].fillna(f0_ref)
        sub_0to5["pct_F_vocoder"] = 100.0 * (sub_0to5["F_vocoder"] - f0_ref) / max(f0_ref, 1e-6)
        sub_0to5["fold_D_amp"] = sub_0to5["D_norm_amp"] / max(dn0_ref, 1e-6)
        sub_0to5["fold_Data_norm_amp"] = sub_0to5["Data_norm_amp"] / max(dan0_ref, 1e-6)
        sub_0to5["coup_norm"] = sub_0to5["Data_norm_amp"] / sub_0to5["D_norm_amp"].clip(lower=1e-9)
        ld0_ref = float(ref["Data_norm_amp"].median() / max(dn0_ref, 1e-6))
        sub_0to5["fold_Data_over_D_amp"] = sub_0to5["coup_norm"] / max(ld0_ref, 1e-6)
    else:
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
            return pd.DataFrame()

    d0 = sub_0to5[np.isclose(sub_0to5["dose_mM"], 0.0)]
    if d0.empty:
        d0 = sub_0to5

    log_d = np.log10(sub_0to5["D_center"].clip(lower=1e-9))
    log_e = np.log10(sub_0to5["E_center"].clip(lower=1e-9))
    log_c = np.log10(sub_0to5["Data_center"].clip(lower=1e-9))
    log_damp0 = np.log10(sub_0to5["D_amp_0mM"].clip(lower=1e-9))
    log_ed = log_e - log_d
    log_load = log_c - log_damp0

    d0_idx = d0.index
    sub_0to5["dlog10_ED"] = log_ed - float(log_ed.loc[d0_idx].median())
    sub_0to5["dlog10_Load"] = log_load - float(log_load.loc[d0_idx].median())
    sub_0to5["dlog10_D"] = log_d - float(log_d.loc[d0_idx].median())
    sub_0to5["dlog10_E"] = log_e - float(log_e.loc[d0_idx].median())
    sub_0to5["dlog10_Cargo"] = log_c - float(log_c.loc[d0_idx].median())
    sub_0to5["dlog10_Damp0"] = log_damp0 - float(log_damp0.loc[d0_idx].median())

    if "osc_fraction" in sub_0to5.columns:
        sub_0to5["osc_pct_col"] = 100.0 * sub_0to5["osc_fraction"]
    else:
        sub_0to5["osc_pct_col"] = 50.0

    return sub_0to5


def compute_projection_from_voxels(sub_0to5: pd.DataFrame, proj_key: str, is_clamped: bool = False) -> tuple[list[dict], dict]:
    """
    Given a prepared construct voxel dataframe `sub_0to5` and a `proj_key`
    (`ed_vs_load`, `damp_vs_cargo`, `d_vs_e`, `d_vs_cargo`), computes:
      1. `bins_list`: list of 2D bin objects (10x10 grid) with Hill fits AND empirical `traces` [med, q25, q75]
      2. `q_px_dict`: 4-Quadrant (`Q1..Q4`) pixel-voxel dose-response curves & Hill fits
    """
    pdef = PROJECTION_DEFS[proj_key]
    x_edges = np.asarray(pdef["x_edges"], dtype=np.float64)
    y_edges = np.asarray(pdef["y_edges"], dtype=np.float64)
    x_centers = 0.5 * (x_edges[:-1] + x_edges[1:])
    y_centers = 0.5 * (y_edges[:-1] + y_edges[1:])

    if proj_key == "ed_vs_load":
        x_col, y_col = "dlog10_ED", "dlog10_Load"
    elif proj_key == "damp_vs_cargo":
        x_col, y_col = "dlog10_Damp0", "dlog10_Cargo"
    elif proj_key == "d_vs_e":
        x_col, y_col = "dlog10_D", "dlog10_E"
    elif proj_key == "d_vs_cargo":
        x_col, y_col = "dlog10_D", "dlog10_Cargo"
    else:
        raise ValueError(f"Unknown projection: {proj_key}")

    xv = sub_0to5[x_col].to_numpy()
    yv = sub_0to5[y_col].to_numpy()
    in_bounds = (xv >= x_edges[0]) & (xv <= x_edges[-1]) & (yv >= y_edges[0]) & (yv <= y_edges[-1])
    sub_box = sub_0to5[in_bounds].copy()
    if sub_box.empty:
        return [], {}

    sub_box["bx"] = np.clip(np.digitize(sub_box[x_col].to_numpy(), x_edges) - 1, 0, 9)
    sub_box["by"] = np.clip(np.digitize(sub_box[y_col].to_numpy(), y_edges) - 1, 0, 9)
    sub_box["qx"] = sub_box["bx"] // 5
    sub_box["qy"] = sub_box["by"] // 5
    sub_box["quadrant"] = np.where(
        sub_box["bx"] < 5,
        np.where(sub_box["by"] >= 5, "Q1_Slow_HiLoad", "Q3_Slow_LoLoad"),
        np.where(sub_box["by"] >= 5, "Q2_Fast_HiLoad", "Q4_Fast_LoLoad"),
    )

    cols_target = ["coup_norm", "pct_F_vocoder", "fold_D_amp", "fold_Data_over_D_amp", "fold_Data_norm_amp", "osc_pct_col"]
    grp_obj = sub_box.groupby(["bx", "by", "dose_mM"], observed=True)
    counts = grp_obj["coup_norm"].count().rename("n_vox")
    f0_meds = grp_obj["F_vocoder_0mM"].median().rename("f0_med")
    meds = grp_obj[cols_target].median()
    q25s = grp_obj[cols_target].quantile(0.25)
    q75s = grp_obj[cols_target].quantile(0.75)

    q_iqr = (
        sub_box.groupby(["qx", "qy", "dose_mM"], observed=True)[cols_target[:5]]
        .agg(lambda s: float(s.quantile(0.75) - s.quantile(0.25)))
    )

    combined = pd.concat([counts, f0_meds, meds.add_suffix("_med"), q25s.add_suffix("_q25"), q75s.add_suffix("_q75")], axis=1).reset_index()

    bins_list = []
    min_doses_req = 4 if is_clamped else 6
    for (bx, by), bdf in combined.groupby(["bx", "by"], observed=True):
        bdf = bdf.sort_values("dose_mM")
        d_arr = bdf["dose_mM"].to_numpy()
        if len(d_arr) < min_doses_req or not np.any(d_arr >= 1.5):
            continue
        if not is_clamped and not np.any(d_arr <= 0.11):
            continue

        bx_i, by_i = int(bx), int(by)
        qx_i, qy_i = bx_i // 5, by_i // 5

        # Fit Hill curves for all 6 portrait metrics
        f_coup = fit_generic_hill_0to5mM(d_arr, bdf["coup_norm_med"].to_numpy(), signed=False, fixed_y0=None)
        f_fm = fit_generic_hill_0to5mM(d_arr, bdf["pct_F_vocoder_med"].to_numpy(), signed=True, fixed_y0=0.0)
        f_cr = fit_generic_hill_0to5mM(d_arr, bdf["fold_D_amp_med"].to_numpy(), signed=True, fixed_y0=1.0)
        f_ld = fit_generic_hill_0to5mM(d_arr, bdf["fold_Data_over_D_amp_med"].to_numpy(), signed=False, fixed_y0=1.0)
        f_am = fit_generic_hill_0to5mM(d_arr, bdf["fold_Data_norm_amp_med"].to_numpy(), signed=False, fixed_y0=1.0)
        f_osc = fit_generic_hill_0to5mM(d_arr, bdf["osc_pct_col_med"].to_numpy(), signed=True, fixed_y0=None)

        # Build empirical trace arrays [med, q25, q75]
        d_list = [clean_val(x, 3) for x in d_arr]
        n_arr = bdf["n_vox"].to_numpy()
        n_list = [int(x) for x in n_arr]
        metric_traces = {}
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
            for idx_d in range(len(d_arr)):
                if n_arr[idx_d] <= 1 or abs(q75_arr[idx_d] - q25_arr[idx_d]) < 1e-6:
                    try:
                        fb_iqr = float(q_iqr.loc[(qx_i, qy_i, d_arr[idx_d]), col_name])
                    except Exception:
                        fb_iqr = 0.08 * abs(m_arr[idx_d])
                    half_w = 0.45 * max(fb_iqr, 1e-4)
                    q25_arr[idx_d] = m_arr[idx_d] - half_w
                    q75_arr[idx_d] = m_arr[idx_d] + half_w

            metric_traces[out_key] = [
                [clean_val(x, dec) for x in m_arr],
                [clean_val(x, dec) for x in q25_arr],
                [clean_val(x, dec) for x in q75_arr],
            ]

        cr_5mM_fold = f_cr["y5mM"]
        cr_max_fold = (1.0 + f_cr["dy_max"]) if f_cr["dy_max"] is not None else cr_5mM_fold
        cr_5mM_pct = round(100.0 * (cr_5mM_fold - 1.0), 2) if cr_5mM_fold is not None else None

        bins_list.append({
            "bx": bx_i,
            "by": by_i,
            "x": clean_val(x_centers[bx_i], 3),
            "y": clean_val(y_centers[by_i], 3),
            "nvox": clean_val(float(np.median(n_arr)), 1),
            "F0_mHz": clean_val(float(bdf["f0_med"].median()), 2),
            # 1. Coupling C(c)
            "coup_y0": None if is_clamped else clean_val(f_coup["y0"], 3),
            "coup_dy_max": clean_val(f_coup["dy_max"], 3),
            "coup_5mM": clean_val(f_coup["y5mM"], 3),
            "coup_dy": clean_val(f_coup["dy"], 3),
            "coup_ec50": clean_val(f_coup["ec50"], 3),
            "coup_nhill": clean_val(f_coup["nhill"], 2),
            "coup_r2": clean_val(f_coup["r2"], 3),
            # 2. Frequency Shift ΔF (%)
            "fm_dy_max_pct": clean_val(f_fm["dy_max"], 2),
            "fm_5mM_pct": clean_val(f_fm["y5mM"], 2),
            "fm_ec50": clean_val(f_fm["ec50"], 3),
            "fm_nhill": clean_val(f_fm["nhill"], 2),
            "fm_r2": clean_val(f_fm["r2"], 3),
            # 3. Carrier Wave Amp Fold & %
            "cr_max_fold": clean_val(cr_max_fold, 3),
            "cr_5mM_fold": clean_val(cr_5mM_fold, 3),
            "cr_5mM_pct": cr_5mM_pct,
            "cr_ec50": clean_val(f_cr["ec50"], 3),
            "cr_nhill": clean_val(f_cr["nhill"], 2),
            "cr_r2": clean_val(f_cr["r2"], 3),
            # 4. Per-Carrier Loading Fold
            "load_max_fold": clean_val((1.0 + f_ld["dy_max"]) if f_ld["dy_max"] is not None else f_ld["y5mM"], 3),
            "load_5mM_fold": clean_val(f_ld["y5mM"], 3),
            "load_ec50": clean_val(f_ld["ec50"], 3),
            "load_nhill": clean_val(f_ld["nhill"], 2),
            "load_r2": clean_val(f_ld["r2"], 3),
            # 5. Total Cargo AM Fold
            "am_max_fold": clean_val((1.0 + f_am["dy_max"]) if f_am["dy_max"] is not None else f_am["y5mM"], 3),
            "am_5mM_fold": clean_val(f_am["y5mM"], 3),
            "am_ec50": clean_val(f_am["ec50"], 3),
            "am_nhill": clean_val(f_am["nhill"], 2),
            "am_r2": clean_val(f_am["r2"], 3),
            # 6. Wave Awakening / Quenching Penetrance ΔOsc (%)
            "osc_y0_pct": clean_val(f_osc["y0"], 2),
            "osc_dy_pct": clean_val(f_osc["dy"], 2),
            "osc_5mM_pct": clean_val(f_osc["y5mM"], 2),
            "osc_ec50": clean_val(f_osc["ec50"], 3),
            "osc_nhill": clean_val(f_osc["nhill"], 2),
            "osc_r2": clean_val(f_osc["r2"], 3),
            # 7. Empirical per-dose traces [med, q25, q75]
            "traces": {
                "d": d_list,
                "n": n_list,
                **metric_traces,
            },
        })

    # Compute 4-Quadrant (Q1..Q4) pixel-voxel dose curves & Hill fits for this projection
    q_px_dict = {}
    q_grp_obj = sub_box.groupby(["quadrant", "dose_mM"], observed=True)
    q_counts = q_grp_obj["coup_norm"].count().rename("n_voxels")
    q_meds = q_grp_obj[cols_target[:5]].median()
    q_q25s = q_grp_obj[cols_target[:5]].quantile(0.25)
    q_q75s = q_grp_obj[cols_target[:5]].quantile(0.75)
    q_comb = pd.concat([q_counts, q_meds.add_suffix("_med"), q_q25s.add_suffix("_q25"), q_q75s.add_suffix("_q75")], axis=1).reset_index()

    for qn in ["Q1_Slow_HiLoad", "Q2_Fast_HiLoad", "Q3_Slow_LoLoad", "Q4_Fast_LoLoad"]:
        qdf = q_comb[q_comb["quadrant"] == qn].sort_values("dose_mM")
        if len(qdf) < 4:
            continue
        d_arr = qdf["dose_mM"].to_numpy()
        q_px_dict[qn] = {
            "doses": [clean_val(x, 3) for x in d_arr],
            "n_voxels": [int(x) for x in qdf["n_voxels"]],
            "metrics": {
                "coupling": {
                    "med": [clean_val(x, 4) for x in qdf["coup_norm_med"]],
                    "q25": [clean_val(x, 4) for x in qdf["coup_norm_q25"]],
                    "q75": [clean_val(x, 4) for x in qdf["coup_norm_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qdf["coup_norm_med"].to_numpy(), signed=False),
                },
                "fm_pct": {
                    "med": [clean_val(x, 2) for x in qdf["pct_F_vocoder_med"]],
                    "q25": [clean_val(x, 2) for x in qdf["pct_F_vocoder_q25"]],
                    "q75": [clean_val(x, 2) for x in qdf["pct_F_vocoder_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qdf["pct_F_vocoder_med"].to_numpy(), signed=True),
                },
                "carrier_fold": {
                    "med": [clean_val(x, 3) for x in qdf["fold_D_amp_med"]],
                    "q25": [clean_val(x, 3) for x in qdf["fold_D_amp_q25"]],
                    "q75": [clean_val(x, 3) for x in qdf["fold_D_amp_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qdf["fold_D_amp_med"].to_numpy(), signed=True),
                },
                "loading_fold": {
                    "med": [clean_val(x, 3) for x in qdf["fold_Data_over_D_amp_med"]],
                    "q25": [clean_val(x, 3) for x in qdf["fold_Data_over_D_amp_q25"]],
                    "q75": [clean_val(x, 3) for x in qdf["fold_Data_over_D_amp_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qdf["fold_Data_over_D_amp_med"].to_numpy(), signed=False),
                },
                "cargo_am_fold": {
                    "med": [clean_val(x, 3) for x in qdf["fold_Data_norm_amp_med"]],
                    "q25": [clean_val(x, 3) for x in qdf["fold_Data_norm_amp_q25"]],
                    "q75": [clean_val(x, 3) for x in qdf["fold_Data_norm_amp_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qdf["fold_Data_norm_amp_med"].to_numpy(), signed=False),
                },
            },
        }

    return sorted(bins_list, key=lambda b: (b["by"], b["bx"])), q_px_dict


def compute_cell_quadrants_for_projection(c_sub: pd.DataFrame, proj_key: str) -> dict:
    """
    Computes single-cell `ultrack` 4-Quadrant dose-response curves (`Q1..Q4`) for a given construct's
    active cells `c_sub` and a given 2D coordinate projection `proj_key`.
    """
    if c_sub.empty:
        return {}
    pdef = PROJECTION_DEFS[proj_key]
    x_edges = pdef["x_edges"]
    y_edges = pdef["y_edges"]

    if proj_key == "ed_vs_load":
        xv = c_sub["x_cell_med"].to_numpy()
        yv = c_sub["y_cell_med"].to_numpy()
    elif proj_key == "damp_vs_cargo":
        xv = c_sub["dlog10_Damp_cell"].to_numpy()
        yv = c_sub["dlog10_Cargo_cell"].to_numpy()
    elif proj_key == "d_vs_e":
        xv = c_sub["dlog10_D_cell"].to_numpy()
        yv = c_sub["dlog10_E_cell"].to_numpy()
    elif proj_key == "d_vs_cargo":
        xv = c_sub["dlog10_D_cell"].to_numpy()
        yv = c_sub["dlog10_Cargo_cell"].to_numpy()
    else:
        return {}

    in_b = (xv >= x_edges[0]) & (xv <= x_edges[-1]) & (yv >= y_edges[0]) & (yv <= y_edges[-1])
    sub = c_sub[in_b].copy()
    if sub.empty:
        return {}

    sub["quadrant"] = np.where(
        xv[in_b] < 0.0,
        np.where(yv[in_b] >= 0.0, "Q1_Slow_HiLoad", "Q3_Slow_LoLoad"),
        np.where(yv[in_b] >= 0.0, "Q2_Fast_HiLoad", "Q4_Fast_LoLoad"),
    )

    cols_c = ["Load_norm_med", "F_med", "D_norm_amp_med", "Data_norm_amp_med", "Load_med", "f_osc_cell_pct"]
    g_obj = sub.groupby(["quadrant", "dose_mM"], observed=True)
    n_cells = g_obj["Load_norm_med"].count().rename("n_cells")
    meds = g_obj[cols_c].median()
    q25s = g_obj[cols_c].quantile(0.25)
    q75s = g_obj[cols_c].quantile(0.75)
    comb = pd.concat([n_cells, meds.add_suffix("_med"), q25s.add_suffix("_q25"), q75s.add_suffix("_q75")], axis=1).reset_index()

    q_cell_dict = {}
    for qn in ["Q1_Slow_HiLoad", "Q2_Fast_HiLoad", "Q3_Slow_LoLoad", "Q4_Fast_LoLoad"]:
        qgrp = comb[(comb["quadrant"] == qn) & (comb["n_cells"] >= 3)].sort_values("dose_mM")
        if len(qgrp) < 5:
            continue

        f0 = max(float(qgrp["F_med_med"].iloc[0]), 1e-6)
        d0 = max(float(qgrp["D_norm_amp_med_med"].iloc[0]), 1e-6)
        da0 = max(float(qgrp["Data_norm_amp_med_med"].iloc[0]), 1e-6)
        ld0 = max(float(qgrp["Load_med_med"].iloc[0]), 1e-6)

        fm_med = 100.0 * (qgrp["F_med_med"].to_numpy() - f0) / f0
        fm_q25 = 100.0 * (qgrp["F_med_q25"].to_numpy() - f0) / f0
        fm_q75 = 100.0 * (qgrp["F_med_q75"].to_numpy() - f0) / f0

        cr_med = qgrp["D_norm_amp_med_med"].to_numpy() / d0
        cr_q25 = qgrp["D_norm_amp_med_q25"].to_numpy() / d0
        cr_q75 = qgrp["D_norm_amp_med_q75"].to_numpy() / d0

        am_med = qgrp["Data_norm_amp_med_med"].to_numpy() / da0
        am_q25 = qgrp["Data_norm_amp_med_q25"].to_numpy() / da0
        am_q75 = qgrp["Data_norm_amp_med_q75"].to_numpy() / da0

        ld_med = qgrp["Load_med_med"].to_numpy() / ld0
        ld_q25 = qgrp["Load_med_q25"].to_numpy() / ld0
        ld_q75 = qgrp["Load_med_q75"].to_numpy() / ld0

        d_arr = qgrp["dose_mM"].to_numpy()
        q_cell_dict[qn] = {
            "doses": [clean_val(x, 3) for x in d_arr],
            "n_cells": [int(x) for x in qgrp["n_cells"]],
            "metrics": {
                "coupling": {
                    "med": [clean_val(x, 4) for x in qgrp["Load_norm_med_med"]],
                    "q25": [clean_val(x, 4) for x in qgrp["Load_norm_med_q25"]],
                    "q75": [clean_val(x, 4) for x in qgrp["Load_norm_med_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qgrp["Load_norm_med_med"].to_numpy(), signed=False),
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
                    "med": [clean_val(x, 1) for x in qgrp["f_osc_cell_pct_med"]],
                    "q25": [clean_val(x, 1) for x in qgrp["f_osc_cell_pct_q25"]],
                    "q75": [clean_val(x, 1) for x in qgrp["f_osc_cell_pct_q75"]],
                    "fit": fit_generic_hill_0to5mM(d_arr, qgrp["f_osc_cell_pct_med"].to_numpy(), signed=True),
                },
            },
        }
    return q_cell_dict


def build_bundle() -> None:
    t0 = time.time()
    DATA_OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load canonical Stage 1 2D bin Hill fits (`ed_vs_load` default projection)
    bin_pq = STAGE1_DIR / "intrinsic_2d_bin_hill_fits_0to5mM.parquet"
    df_bins = pd.read_parquet(bin_pq)
    df_bins = df_bins[~df_bins["design_id"].astype(str).str.contains("rep2")].copy()
    df_bins["cr_5mM_pct"] = 100.0 * (df_bins["cr_5mM_fit_fold"] - 1.0)

    # 2. Load Construct Metadata & Global Summaries
    hill_sum_df = pd.read_csv(STAGE1_DIR / "master_library_construct_hill_summary.csv")
    hill_sum_df = hill_sum_df[~hill_sum_df["design_id"].astype(str).str.contains("rep2")].copy()

    basal_df = pd.read_csv(STAGE1_DIR / "master_basal_tonic_0mM_vs_5mM_LoadNorm_summary.csv")
    basal_df = basal_df[~basal_df["design_id"].astype(str).str.contains("rep2")].copy()

    ultrack_sum_df = pd.read_csv(STAGE1_DIR / "master_ultrack_construct_dose_confluence_summary.csv")

    # 3. Load canonical Pixel-Voxel Quadrant Dose Curves & Hill Fits (`ed_vs_load`)
    px_coup_curves = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_coupling_dose_curves_0to5mM.csv")
    px_other_curves = pd.read_csv(STAGE1_DIR / "intrinsic_quadrant_dose_curves_0to5mM.csv")
    for d in (px_coup_curves, px_other_curves):
        d.drop(d[d["design_id"].astype(str).str.contains("rep2")].index, inplace=True)

    u_3x3_pq = WORK_DIR / "library_runs" / "master_synthesis_figures" / "intrinsic_hill_fits" / "3x3_WT_inverse_unclipped_2d_bins.parquet"

    # 4. Load Single-Cell `ultrack` Parquet (570,171 cells)
    cells_pq = STAGE1_DIR / "master_ultrack_single_cells_all_constructs.parquet"
    if not cells_pq.exists():
        cells_pq = WORK_DIR / "library_runs" / "master_synthesis_figures" / "ultrack_all_cells" / "master_ultrack_single_cells_all_constructs.parquet"
    df_cells = pd.read_parquet(cells_pq)
    df_cells = df_cells[~df_cells["design_id"].astype(str).str.contains("rep2")].copy()

    # Build canonical construct list
    constructs_meta = {}
    for _, row in hill_sum_df.iterrows():
        cid = f"{row['valency']}_{row['mutation']}_{row['topology']}"
        did = str(row["design_id"])
        val_s = str(row["valency"])
        mut_s = str(row["mutation"])
        ori_s = str(row["topology"])
        md_v = int(row["minD_valency"])
        cg_v = int(row["cargo_valency"])

        if ori_s == "upright":
            carrier_domain = f"cterm-(FHA1_{mut_s})×{md_v}"
            cargo_domain = f"GFP-(PKAsub)×{cg_v}"
            arch_desc = f"Upright ({md_v}×{cg_v}): {md_v}× {mut_s} FHA1 domains on MinD anchor; {cg_v}× PKAsub on diffusive GFP client."
        else:
            carrier_domain = f"cterm-(PKAsub)×{md_v}"
            cargo_domain = f"GFP-(FHA1_{mut_s})×{cg_v}"
            arch_desc = f"Inverse ({md_v}×{cg_v}): {md_v}× PKAsub domains on MinD anchor; {cg_v}× {mut_s} FHA1 on diffusive GFP client."

        b_row = basal_df[basal_df["design_id"] == did]
        c0_global = clean_val(b_row["Load_norm_0mM"].iloc[0], 3) if not b_row.empty else None
        c5_global = clean_val(b_row["Load_norm_5mM"].iloc[0], 3) if not b_row.empty else None
        dc_global = clean_val(b_row["Delta_Load_norm_5mM_minus_0mM"].iloc[0], 3) if not b_row.empty else (
            round(c5_global - c0_global, 3) if (c5_global is not None and c0_global is not None) else None
        )

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
            "design": str(row["design"]),
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
            "projections": {},
        }

    # 5. Prepare Single-Cell `ultrack` derived coordinates for all 4 projections
    act_cells = df_cells[
        (df_cells["n_osc_px"] >= 15)
        & (df_cells["f_osc_cell_pct"] >= 10.0)
        & (df_cells["dose_mM"] <= 5.05)
    ].copy()
    # Derive log10(D_static), log10(Cargo_static), log10(E_static), log10(D_amp) per cell
    act_cells["raw_log10_Damp"] = np.log10(act_cells["D_amp_med"].clip(lower=1e-6))
    act_cells["raw_log10_D"] = np.log10((act_cells["D_amp_med"] / act_cells["D_norm_amp_med"].clip(lower=1e-6)).clip(lower=1e-6))
    act_cells["raw_log10_Cargo"] = np.log10((act_cells["Data_amp_med"] / act_cells["Data_norm_amp_med"].clip(lower=1e-6)).clip(lower=1e-6))
    act_cells["raw_log10_E"] = act_cells["raw_log10_D"] + act_cells["x_cell_med"]

    # 6. Process all 38 constructs across all 4 projections
    runs_root = WORK_DIR / "library_runs"
    vox_cache: dict[str, pd.DataFrame] = {}

    for cid, cmeta in constructs_meta.items():
        did = cmeta["design_id"]
        design = cmeta["design"]
        folder_name = cmeta["folder_name"]
        is_clamped = cmeta["is_clamped_0mM"]

        vox_pq = runs_root / folder_name / "titration_3d_voxels_matched.parquet"
        if vox_pq.exists():
            if folder_name not in vox_cache:
                vox_cache[folder_name] = pd.read_parquet(vox_pq)
            sub_0to5 = prepare_construct_voxel_table(vox_cache[folder_name], design, did)
        else:
            sub_0to5 = pd.DataFrame()

        # Prepare construct's single cells with 0 mM centered coordinates
        c_cells = act_cells[act_cells["design_id"] == did].copy()
        if is_clamped:
            c_cells = c_cells[c_cells["dose_mM"] >= 0.20].copy()
        if not c_cells.empty:
            c0_cells = c_cells[np.isclose(c_cells["dose_mM"], 0.0)]
            if c0_cells.empty:
                c0_cells = c_cells
            c_cells["dlog10_Damp_cell"] = c_cells["raw_log10_Damp"] - float(c0_cells["raw_log10_Damp"].median())
            c_cells["dlog10_D_cell"] = c_cells["raw_log10_D"] - float(c0_cells["raw_log10_D"].median())
            c_cells["dlog10_Cargo_cell"] = c_cells["raw_log10_Cargo"] - float(c0_cells["raw_log10_Cargo"].median())
            c_cells["dlog10_E_cell"] = c_cells["raw_log10_E"] - float(c0_cells["raw_log10_E"].median())

        # Compute all 4 projections
        for proj_key in ("ed_vs_load", "damp_vs_cargo", "d_vs_e", "d_vs_cargo"):
            if not sub_0to5.empty:
                p_bins, p_q_px = compute_projection_from_voxels(sub_0to5, proj_key, is_clamped=is_clamped)
            else:
                p_bins, p_q_px = [], {}

            # For default `ed_vs_load`, overlay canonical Stage 1 `df_bins` Hill fits while keeping empirical traces
            if proj_key == "ed_vs_load":
                trace_lookup = {(b["bx"], b["by"]): b["traces"] for b in p_bins}
                sub_b = df_bins[df_bins["design_id"] == did].sort_values(["by", "bx"])
                canon_bins = []
                for _, brow in sub_b.iterrows():
                    bx_i = int(brow["bx"])
                    by_i = int(brow["by"])
                    canon_bins.append({
                        "bx": bx_i,
                        "by": by_i,
                        "x": clean_val(brow["x_dlog10_ED"], 3),
                        "y": clean_val(brow["y_dlog10_Load"], 3),
                        "nvox": clean_val(brow.get("med_voxels_per_dose", 5.0), 1),
                        "F0_mHz": clean_val(brow.get("F0_med"), 2),
                        "coup_y0": clean_val(brow.get("coup_y0"), 3),
                        "coup_dy_max": clean_val(brow.get("coup_dy_max"), 3),
                        "coup_5mM": clean_val(brow.get("coup_5mM_fit"), 3),
                        "coup_dy": clean_val(brow.get("coup_dy_5mM"), 3),
                        "coup_ec50": clean_val(brow.get("coup_ec50_mM"), 3),
                        "coup_nhill": clean_val(brow.get("coup_nhill"), 2),
                        "coup_r2": clean_val(brow.get("coup_r2"), 3),
                        "fm_dy_max_pct": clean_val(brow.get("fm_dy_max_pct"), 2),
                        "fm_5mM_pct": clean_val(brow.get("fm_5mM_fit_pct"), 2),
                        "fm_ec50": clean_val(brow.get("fm_ec50_mM"), 3),
                        "fm_nhill": clean_val(brow.get("fm_nhill"), 2),
                        "fm_r2": clean_val(brow.get("fm_r2"), 3),
                        "cr_max_fold": clean_val(brow.get("cr_max_fold"), 3),
                        "cr_5mM_fold": clean_val(brow.get("cr_5mM_fit_fold"), 3),
                        "cr_5mM_pct": clean_val(brow.get("cr_5mM_pct"), 2),
                        "cr_ec50": clean_val(brow.get("cr_ec50_mM"), 3),
                        "cr_nhill": clean_val(brow.get("cr_nhill"), 2),
                        "cr_r2": clean_val(brow.get("cr_r2"), 3),
                        "load_max_fold": clean_val(brow.get("load_max_fold"), 3),
                        "load_5mM_fold": clean_val(brow.get("load_5mM_fit"), 3),
                        "load_ec50": clean_val(brow.get("load_ec50_mM"), 3),
                        "load_nhill": clean_val(brow.get("load_nhill"), 2),
                        "load_r2": clean_val(brow.get("load_r2"), 3),
                        "am_max_fold": clean_val(brow.get("am_max_fold"), 3),
                        "am_5mM_fold": clean_val(brow.get("am_5mM_fit"), 3),
                        "am_ec50": clean_val(brow.get("am_ec50_mM"), 3),
                        "am_nhill": clean_val(brow.get("am_nhill"), 2),
                        "am_r2": clean_val(brow.get("am_r2"), 3),
                        "osc_y0_pct": clean_val(brow.get("osc_y0_pct"), 2),
                        "osc_dy_pct": clean_val(brow.get("osc_dy_max_pct"), 2),
                        "osc_5mM_pct": clean_val(brow.get("osc_5mM_fit_pct"), 2),
                        "osc_ec50": clean_val(brow.get("osc_ec50_mM"), 3),
                        "osc_nhill": clean_val(brow.get("osc_nhill"), 2),
                        "osc_r2": clean_val(brow.get("osc_r2"), 3),
                        "traces": trace_lookup.get((bx_i, by_i)),
                    })
                p_bins = canon_bins

            p_q_cell = compute_cell_quadrants_for_projection(c_cells, proj_key)
            cmeta["projections"][proj_key] = {
                "bins_2d": p_bins,
                "quadrants_pixel": p_q_px,
                "quadrants_cell": p_q_cell,
            }

    bundle = {
        "version": "1.2.0",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "grid_spec": {
            "nx": 10,
            "ny": 10,
            "x_edges": PROJECTION_DEFS["ed_vs_load"]["x_edges"],
            "y_edges": PROJECTION_DEFS["ed_vs_load"]["y_edges"],
            "x_label": PROJECTION_DEFS["ed_vs_load"]["x_label"],
            "y_label": PROJECTION_DEFS["ed_vs_load"]["y_label"],
        },
        "projection_defs": PROJECTION_DEFS,
        "constructs": constructs_meta,
    }

    json_path = DATA_OUT_DIR / "antenna_library_bundle.json"
    js_path = DATA_OUT_DIR / "antenna_library_bundle.js"

    json_str = json.dumps(bundle, separators=(",", ":"))
    json_path.write_text(json_str, encoding="utf-8")
    js_path.write_text(f"window.ANTENNA_LIBRARY_DATA = {json_str};\n", encoding="utf-8")

    sz_mb = len(json_str.encode("utf-8")) / (1024 * 1024)
    print(f"Compiled {len(constructs_meta)} constructs × 4 projections into {json_path.name} and {js_path.name} ({sz_mb:.2f} MB) in {time.time() - t0:.2f}s")


if __name__ == "__main__":
    build_bundle()
