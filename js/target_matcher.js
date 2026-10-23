/**
 * target_matcher.js
 * Interactive Inverse-Design / Target Response Finder for the 36-member Antenna-Circuit Library.
 * Allows users to click a stoichiometry bin (bx, by) or quadrant (Q1..Q4) on the 2D phase portrait
 * and specify target response values (or choose a biophysical archetype preset) to rank and retrieve
 * the closest matching circuit designs.
 */

window.TARGET_PRESETS = [
  {
    id: "all_quad_tracker",
    name: "1:1 All-Quadrant Wave Tracker",
    desc: "Maximal 1:1 cargo-to-carrier coupling (C₅ₘₘ ≥ 0.95) with fast EC₅₀ (≤ 0.25 mM) across both slow Q1 and fast Q4 waves.",
    regionMode: "quadrant",
    quadrant: "Q4_Fast_LoLoad",
    criteria: {
      coup_5mM: { enabled: true, target: 0.96, scale: 0.25 },
      coup_ec50: { enabled: true, target: 0.24, scale: 0.25 },
      coup_dy: { enabled: true, target: 0.72, scale: 0.25 }
    }
  },
  {
    id: "zero_leak_switch",
    name: "Ultra-Clean Zero-Leakage Switch",
    desc: "Quiet uncoupled 0 mM baseline (C₀ ≤ 0.11) combined with strong 5 mM coupling (C₅ₘₘ ≥ 0.88).",
    regionMode: "quadrant",
    quadrant: "Q1_Slow_HiLoad",
    criteria: {
      coup_y0: { enabled: true, target: 0.10, scale: 0.08 },
      coup_5mM: { enabled: true, target: 0.90, scale: 0.22 },
      coup_dy: { enabled: true, target: 0.78, scale: 0.22 }
    }
  },
  {
    id: "pos_fm_accelerator",
    name: "Positive-FM Wave Accelerator (+ΔF%)",
    desc: "Strong cAMP-induced wave frequency speedup (+20% to +30% ΔF) in High-Load Q1.",
    regionMode: "quadrant",
    quadrant: "Q1_Slow_HiLoad",
    criteria: {
      fm_5mM_pct: { enabled: true, target: 24.0, scale: 12.0 },
      coup_5mM: { enabled: true, target: 0.68, scale: 0.30 }
    }
  },
  {
    id: "neg_fm_carrier_gain",
    name: "Negative-FM Brake + Carrier Power Amplifier",
    desc: "Slows wave frequency (−18% ΔF) while amplifying MinD carrier wave amplitude (+22% ΔD_amp).",
    regionMode: "quadrant",
    quadrant: "Q1_Slow_HiLoad",
    criteria: {
      fm_5mM_pct: { enabled: true, target: -18.0, scale: 10.0 },
      cr_5mM_pct: { enabled: true, target: 22.0, scale: 15.0 },
      coup_5mM: { enabled: true, target: 0.88, scale: 0.25 }
    }
  },
  {
    id: "buffered_am_coupler",
    name: "Pure Frequency-Buffered AM Coupler",
    desc: "High inducible cargo coupling (C₅ₘₘ ≥ 0.88) with near-zero perturbation to wave frequency (ΔF ≈ 0%).",
    regionMode: "quadrant",
    quadrant: "Q1_Slow_HiLoad",
    criteria: {
      coup_5mM: { enabled: true, target: 0.90, scale: 0.20 },
      fm_5mM_pct: { enabled: true, target: 0.0, scale: 8.0 },
      cr_5mM_pct: { enabled: true, target: 0.0, scale: 12.0 }
    }
  },
  {
    id: "wave_awakening_switch",
    name: "cAMP-Induced Wave Awakening Switch",
    desc: "Basally clamped/silent at 0 mM, ignited into robust oscillations (+ΔOsc% ≥ +12%) upon Bt₂cAMP addition.",
    regionMode: "quadrant",
    quadrant: "Q1_Slow_HiLoad",
    criteria: {
      osc_dy_pct: { enabled: true, target: 16.0, scale: 8.0 },
      cr_5mM_pct: { enabled: true, target: 25.0, scale: 15.0 }
    }
  }
];

/**
 * Extracts aggregated metric values for a construct inside the requested spatial target:
 *   - regionSpec.mode === "bin": exact bin (bx, by) or 3x3 neighborhood around (bx, by)
 *   - regionSpec.mode === "quadrant": one of Q1_Slow_HiLoad, Q2_Fast_HiLoad, Q3_Slow_LoLoad, Q4_Fast_LoLoad
 *   - regionSpec.mode === "all": all populated bins in the 10x10 grid
 */
window.extractConstructRegionStats = function(construct, regionSpec) {
  if (!construct || !construct.bins_2d || construct.bins_2d.length === 0) return null;

  let bins = [];
  if (regionSpec.mode === "bin" && regionSpec.bx !== null && regionSpec.by !== null) {
    // Include exact bin + immediate neighbors for robustness if exact bin is sparse
    bins = construct.bins_2d.filter(b => Math.abs(b.bx - regionSpec.bx) <= 1 && Math.abs(b.by - regionSpec.by) <= 1);
  } else if (regionSpec.mode === "quadrant") {
    const q = regionSpec.quadrant || "Q1_Slow_HiLoad";
    bins = construct.bins_2d.filter(b => {
      if (q === "Q1_Slow_HiLoad") return b.bx < 5 && b.by >= 5;
      if (q === "Q2_Fast_HiLoad") return b.bx >= 5 && b.by >= 5;
      if (q === "Q3_Slow_LoLoad") return b.bx < 5 && b.by < 5;
      if (q === "Q4_Fast_LoLoad") return b.bx >= 5 && b.by < 5;
      return true;
    });
  } else {
    bins = construct.bins_2d;
  }

  if (bins.length === 0) return null;

  const medOf = key => {
    const arr = bins.map(b => b[key]).filter(v => v !== null && v !== undefined && Number.isFinite(v));
    if (arr.length === 0) return null;
    arr.sort((a, b) => a - b);
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[m] : 0.5 * (arr[m - 1] + arr[m]);
  };

  return {
    nBins: bins.length,
    coup_5mM: medOf("coup_5mM"),
    coup_y0: medOf("coup_y0"),
    coup_dy: medOf("coup_dy"),
    coup_ec50: medOf("coup_ec50"),
    fm_5mM_pct: medOf("fm_5mM_pct"),
    cr_5mM_pct: medOf("cr_5mM_pct"),
    load_5mM_fold: medOf("load_5mM_fold"),
    am_5mM_fold: medOf("am_5mM_fold"),
    osc_dy_pct: medOf("osc_dy_pct")
  };
};

/**
 * Ranks all 36 active constructs (and optionally TAmut controls) by proximity to `criteria` in `regionSpec`.
 */
window.rankCircuitsByTarget = function(constructsMap, regionSpec, criteria, includeTAmut = false) {
  const results = [];
  const activeKeys = Object.keys(criteria).filter(k => criteria[k] && criteria[k].enabled);
  if (activeKeys.length === 0) return results;

  for (const cid of Object.keys(constructsMap)) {
    const c = constructsMap[cid];
    if (!includeTAmut && c.mutation === "TAmut") continue;

    const stats = window.extractConstructRegionStats(c, regionSpec);
    if (!stats) continue;

    let sumSqNormErr = 0.0;
    let validCount = 0;
    const featureBreakdown = {};

    for (const k of activeKeys) {
      const crit = criteria[k];
      let obs = stats[k];
      // For 3x3_WT_inverse where 0 mM waves are clamped, treat coup_y0 as 0.11 noise floor if queried
      if (k === "coup_y0" && obs === null && c.is_clamped_0mM) {
        obs = 0.11;
      }
      if (obs === null || obs === undefined || !Number.isFinite(obs)) {
        sumSqNormErr += 4.0; // penalty for missing/flat EC50 when EC50 was specifically requested
        validCount++;
        featureBreakdown[k] = { target: crit.target, observed: null, diff: null };
        continue;
      }
      const diff = obs - crit.target;
      const normErr = diff / Math.max(1e-6, crit.scale || 1.0);
      sumSqNormErr += normErr * normErr;
      validCount++;
      featureBreakdown[k] = { target: crit.target, observed: obs, diff };
    }

    if (validCount === 0) continue;
    const rmse = Math.sqrt(sumSqNormErr / validCount);
    const matchScore = Math.max(0.0, 100.0 * Math.exp(-0.45 * rmse));

    results.push({
      construct: c,
      stats,
      rmse,
      matchScore,
      featureBreakdown
    });
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
};
