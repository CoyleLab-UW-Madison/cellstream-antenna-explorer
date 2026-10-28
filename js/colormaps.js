/**
 * colormaps.js
 * Scientific colormaps (matching matplotlib viridis, magma, plasma, coolwarm, RdBu_r, BrBG)
 * and the canonical Metric Registry for 2D Phase Portraits and 4-Quadrant Dose-Response Curves.
 */

window.COLORMAPS = {
  viridis: [
    [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141], [41, 120, 142],
    [32, 144, 140], [34, 167, 132], [68, 190, 112], [121, 209, 81], [189, 222, 38], [253, 231, 37]
  ],
  viridis_r: [
    [253, 231, 37], [189, 222, 38], [121, 209, 81], [68, 190, 112], [34, 167, 132],
    [32, 144, 140], [41, 120, 142], [52, 94, 141], [64, 67, 135], [72, 35, 116], [68, 1, 84]
  ],
  magma: [
    [0, 0, 4], [24, 15, 62], [69, 16, 119], [114, 31, 129], [159, 47, 127],
    [205, 64, 113], [241, 96, 93], [253, 149, 103], [254, 201, 141], [252, 253, 191]
  ],
  plasma: [
    [13, 8, 135], [65, 4, 157], [106, 0, 168], [143, 13, 164], [177, 42, 144],
    [204, 71, 120], [225, 100, 98], [242, 132, 75], [252, 166, 54], [252, 206, 37], [240, 249, 33]
  ],
  coolwarm: [
    [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
    [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38]
  ],
  RdBu_r: [
    [5, 48, 97], [33, 102, 172], [67, 147, 195], [146, 197, 222], [209, 229, 240],
    [247, 247, 247], [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31]
  ],
  BrBG: [
    [84, 48, 5], [140, 81, 10], [191, 129, 45], [223, 194, 125], [246, 232, 195],
    [245, 245, 245], [199, 234, 229], [128, 205, 193], [53, 151, 143], [1, 102, 94], [0, 60, 48]
  ]
};

window.sampleColormap = function(cmapName, t) {
  const stops = window.COLORMAPS[cmapName] || window.COLORMAPS.viridis;
  const tc = Math.max(0.0, Math.min(1.0, t));
  const pos = tc * (stops.length - 1);
  const idx = Math.floor(pos);
  const frac = pos - idx;
  if (idx >= stops.length - 1) {
    return stops[stops.length - 1].slice();
  }
  const c0 = stops[idx];
  const c1 = stops[idx + 1];
  return [
    Math.round(c0[0] + frac * (c1[0] - c0[0])),
    Math.round(c0[1] + frac * (c1[1] - c0[1])),
    Math.round(c0[2] + frac * (c1[2] - c0[2]))
  ];
};

window.normalizeValue = function(val, vmin, vmax, vcenter) {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  if (vcenter !== null && vcenter !== undefined) {
    if (val <= vcenter) {
      return 0.5 * Math.max(0.0, Math.min(1.0, (val - vmin) / Math.max(1e-9, vcenter - vmin)));
    } else {
      return 0.5 + 0.5 * Math.max(0.0, Math.min(1.0, (val - vcenter) / Math.max(1e-9, vmax - vcenter)));
    }
  }
  return Math.max(0.0, Math.min(1.0, (val - vmin) / Math.max(1e-9, vmax - vmin)));
};

/**
 * Registry of all 2D Phase Portrait Metrics available across the explorer.
 */
window.PORTRAIT_METRICS = [
  {
    key: "coup_5mM",
    r2_key: "coup_r2",
    shortLabel: "Saturated Coupling (C₅ₘₘ)",
    title: "Saturated 5 mM Coupling Strength (C₅ₘₘ = Data_norm / D_norm)",
    cbarLabel: "Saturated 5 mM Coupling C₅ₘₘ (1.0 = 1:1 Wave Tracking)",
    cmap: "viridis",
    vmin: 0.10,
    vmax: 1.05,
    vcenter: null,
    neutralVal: 0.10,
    activeR2Thresh: 0.45,
    activeAmpThresh: 0.0,
    isEc50: false,
    unit: "",
    decimals: 2,
    quadCurveKey: "coupling",
    description: "Casey's dimensionless cargo-to-carrier wave coupling ceiling at 5 mM Bt₂cAMP. 1.00 indicates 100% 1:1 fractional modulation depth tracking of the MinD carrier wave."
  },
  {
    key: "coup_y0",
    r2_key: "coup_y0", // Basal 0 mM intercept is direct measurement
    shortLabel: "Basal 0 mM Coupling (C₀)",
    title: "Basal Tonic Coupling Floor at 0 mM Bt₂cAMP (C₀ = Data_norm / D_norm)",
    cbarLabel: "Basal 0 mM Coupling Strength C₀",
    cmap: "magma",
    vmin: 0.08,
    vmax: 0.36,
    vcenter: null,
    neutralVal: 0.10,
    activeR2Thresh: 0.18, // Contours enclose tonic basal coupling C0 >= 0.18
    activeAmpThresh: 0.0,
    isEc50: false,
    isBasalC0: true,
    unit: "",
    decimals: 2,
    quadCurveKey: "coupling",
    description: "Basal tonic wave coupling at 0 mM Bt₂cAMP before PKA activation. ~0.09–0.12 is the uncoupled spectral noise floor; ≥0.18 indicates pre-bound tonic coupling."
  },
  {
    key: "coup_dy",
    r2_key: "coup_r2",
    shortLabel: "Inducible Coupling Swing (ΔC)",
    title: "Net PKA-Inducible Coupling Gain (ΔC₅ₘₘ = C₅ₘₘ − C₀)",
    cbarLabel: "Net Inducible Coupling Swing ΔC₅ₘₘ",
    cmap: "plasma",
    vmin: 0.00,
    vmax: 0.85,
    vcenter: null,
    neutralVal: 0.00,
    activeR2Thresh: 0.45,
    activeAmpThresh: 0.0,
    isEc50: false,
    unit: "",
    decimals: 2,
    quadCurveKey: "coupling",
    description: "Net PKA-driven increase in dimensionless coupling efficiency from 0 mM to 5 mM Bt₂cAMP (C₅ₘₘ − C₀)."
  },
  {
    key: "coup_ec50",
    r2_key: "coup_r2",
    gain_key: "coup_dy",
    gain_min: 0.10,
    shortLabel: "Coupling Sensitivity (EC₅₀)",
    title: "Coupling Hill EC₅₀ Landscape (mM Bt₂cAMP)",
    cbarLabel: "Coupling Hill EC₅₀ (mM Bt₂cAMP)",
    cmap: "viridis_r",
    vmin: 0.05,
    vmax: 1.50,
    vcenter: null,
    neutralVal: 0.50,
    activeR2Thresh: 0.45,
    activeAmpThresh: 0.0,
    isEc50: true,
    unit: " mM",
    decimals: 2,
    quadCurveKey: "coupling",
    description: "Effective Bt₂cAMP concentration required to reach 50% of each bin's maximal inducible coupling gain (gated on ΔC ≥ 0.10 and R² ≥ 0.45)."
  },
  {
    key: "fm_5mM_pct",
    r2_key: "fm_r2",
    shortLabel: "Frequency Modulation (ΔF%)",
    title: "Driver Wave Frequency Shift Plateau at 5 mM (ΔF%)",
    cbarLabel: "Hill Fitted Frequency Shift ΔF₅ₘₘ (%)",
    cmap: "coolwarm",
    vmin: -32.0,
    vmax: 32.0,
    vcenter: 0.0,
    neutralVal: 0.0,
    activeR2Thresh: 0.45,
    activeAmpThresh: 6.5,
    isEc50: false,
    unit: "%",
    decimals: 1,
    quadCurveKey: "fm_pct",
    description: "Percentage shift in MinDE wave oscillation frequency (F_vocoder) from 0 mM to 5 mM Bt₂cAMP. Red (+ΔF%) = wave acceleration; Blue (−ΔF%) = wave braking; White = frequency-buffered."
  },
  {
    key: "cr_5mM_pct",
    r2_key: "cr_r2",
    shortLabel: "MinD Carrier Amp Shift (ΔD%)",
    title: "MinD Carrier Wave Amplitude Perturbation at 5 mM (ΔD_amp %)",
    cbarLabel: "Hill Fitted Carrier Amplitude Shift ΔD₅ₘₘ (%)",
    cmap: "RdBu_r",
    vmin: -45.0,
    vmax: 45.0,
    vcenter: 0.0,
    neutralVal: 0.0,
    activeR2Thresh: 0.45,
    activeAmpThresh: 8.0,
    isEc50: false,
    unit: "%",
    decimals: 1,
    quadCurveKey: "carrier_fold",
    description: "Percentage change in the underlying mCherry-MinD carrier wave amplitude from 0 mM to 5 mM. Red (+ΔD%) = carrier wave power gain; Blue (−ΔD%) = high-load carrier wave damping."
  },
  {
    key: "load_5mM_fold",
    r2_key: "load_r2",
    shortLabel: "Per-Carrier Loading Fold (Data/D)",
    title: "Per-Carrier Biochemical Loading Fold at 5 mM (Data_amp / D_amp vs 0 mM)",
    cbarLabel: "Fitted Per-Carrier Loading Fold (vs 0 mM)",
    cmap: "plasma",
    vmin: 1.0,
    vmax: 8.8,
    vcenter: null,
    neutralVal: 1.0,
    activeR2Thresh: 0.50,
    activeAmpThresh: 0.0,
    isEc50: false,
    unit: "×",
    decimals: 2,
    quadCurveKey: "loading_fold",
    description: "Fold increase in cargo-to-carrier amplitude ratio relative to each bin's 0 mM baseline. Highlights high fold-switches with quiet 0 mM baselines."
  },
  {
    key: "am_5mM_fold",
    r2_key: "am_r2",
    shortLabel: "Total Cargo AM Fold (Data_norm)",
    title: "Total Spectral Client Cargo AM Fold at 5 mM (Data_norm_amp vs 0 mM)",
    cbarLabel: "Fitted Client Cargo AM Fold (vs 0 mM)",
    cmap: "viridis",
    vmin: 1.0,
    vmax: 8.0,
    vcenter: null,
    neutralVal: 1.0,
    activeR2Thresh: 0.50,
    activeAmpThresh: 0.0,
    isEc50: false,
    unit: "×",
    decimals: 2,
    quadCurveKey: "cargo_am_fold",
    description: "Fold increase in normalized cargo oscillation amplitude relative to 0 mM. Reflects the product of per-carrier biochemical loading and MinD carrier wave amplitude."
  },
  {
    key: "osc_dy_pct",
    r2_key: "osc_r2",
    shortLabel: "Wave Awakening / Quenching (ΔOsc%)",
    title: "Wave Awakening vs. Wave Quenching Landscape (ΔOscillating Penetrance %)",
    cbarLabel: "Hill Fitted ΔOscillating Penetrance (%, 0→5 mM)",
    cmap: "BrBG",
    vmin: -28.0,
    vmax: 28.0,
    vcenter: 0.0,
    neutralVal: 0.0,
    activeR2Thresh: 0.45,
    activeAmpThresh: 3.5,
    isEc50: false,
    unit: "%",
    decimals: 1,
    quadCurveKey: "cell_territory_pct",
    description: "Net shift in oscillating pixel penetrance from 0 mM to 5 mM Bt₂cAMP. Teal (+ΔOsc%) = cAMP-induced Wave Awakening (e.g. 3x3 WT Inverse); Brown (−ΔOsc%) = High-Load Wave Quenching."
  }
];

window.PORTRAIT_METRIC_MAP = {};
window.PORTRAIT_METRICS.forEach(m => { window.PORTRAIT_METRIC_MAP[m.key] = m; });

/**
 * Registry of 4-Quadrant Dose-Response Metrics (supported in both Pixel-Voxel and ultrack Cell-Mask modes).
 */
window.QUADRANT_METRICS = [
  {
    key: "coupling",
    shortLabel: "Dimensionless Coupling C(c)",
    yLabel: "Coupling C = Data_norm / D_norm",
    ymin: 0.0,
    ymax: 1.18,
    yticks: [0.0, 0.25, 0.50, 0.75, 1.00],
    refLine: 1.0,
    refLabel: "C = 1.0 (1:1 Wave Tracking)",
    floorBand: [0.0, 0.12],
    unit: "",
    decimals: 2
  },
  {
    key: "fm_pct",
    shortLabel: "Driver Frequency Shift ΔF(c)%",
    yLabel: "Frequency Shift ΔF (% vs 0 mM)",
    ymin: -38.0,
    ymax: 42.0,
    yticks: [-30, -15, 0, 15, 30],
    refLine: 0.0,
    refLabel: "0% (Buffered Baseline Frequency)",
    floorBand: [-6.0, 6.0],
    unit: "%",
    decimals: 1
  },
  {
    key: "carrier_fold",
    shortLabel: "MinD Carrier Amplitude Fold",
    yLabel: "MinD Carrier Amplitude Fold (vs 0 mM)",
    ymin: 0.45,
    ymax: 1.65,
    yticks: [0.50, 0.75, 1.00, 1.25, 1.50],
    refLine: 1.0,
    refLabel: "1.0× (Unperturbed Carrier Wave)",
    floorBand: null,
    unit: "×",
    decimals: 2
  },
  {
    key: "loading_fold",
    shortLabel: "Per-Carrier Loading Fold (Data/D)",
    yLabel: "Per-Carrier Loading Fold (vs 0 mM)",
    ymin: 0.8,
    ymax: 9.2,
    yticks: [1, 3, 5, 7, 9],
    refLine: 1.0,
    refLabel: "1.0× (0 mM Baseline)",
    floorBand: null,
    unit: "×",
    decimals: 2
  },
  {
    key: "cargo_am_fold",
    shortLabel: "Client Cargo Spectral AM Fold",
    yLabel: "Client Cargo AM Fold (vs 0 mM)",
    ymin: 0.8,
    ymax: 8.5,
    yticks: [1, 3, 5, 7],
    refLine: 1.0,
    refLabel: "1.0× (0 mM Baseline)",
    floorBand: null,
    unit: "×",
    decimals: 2
  },
  {
    key: "cell_territory_pct",
    shortLabel: "Subcellular Wave Territory f_osc (%)",
    yLabel: "Intracellular Wave Territory f_osc (%)",
    ymin: 0.0,
    ymax: 75.0,
    yticks: [0, 15, 30, 45, 60],
    refLine: null,
    refLabel: null,
    floorBand: null,
    unit: "%",
    decimals: 1,
    cellOnlyNote: true
  }
];

window.QUADRANT_METRIC_MAP = {};
window.QUADRANT_METRICS.forEach(m => { window.QUADRANT_METRIC_MAP[m.key] = m; });
