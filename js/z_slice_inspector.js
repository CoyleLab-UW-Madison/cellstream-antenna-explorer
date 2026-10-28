/**
 * z_slice_inspector.js
 *
 * Renders the "3rd-Variable Core Sample Inspector" for any clicked 2D bin (bx, by):
 *   1. `renderZSliceHeatmapCanvas`:
 *      2D Response Portrait of [Bt₂cAMP Dose (0..5 mM)] × [Floating 3rd Variable in Absolute log₁₀(AU)],
 *      colored by the active metric of interest.
 *   2. `renderZSliceCrossSectionAndCurvesCanvas`:
 *      Side-by-side (or toggled full-width) view of:
 *        (A) Metric vs. 3rd Variable (log₁₀ AU) Cross-Section at 0 mM (Basal) vs. 5 mM (Saturated),
 *            with shaded inducible Δ ribbon and quantitative Z-slope readout.
 *        (B) Stratified 3rd-Variable Dose-Response Curves (Low Z · Mid Z · High Z tertiles) across 0..5 mM Bt₂cAMP.
 */

(function() {
  const Z_METRIC_CONFIG = {
    coupling: {
      zKey: "coup",
      title: "Dimensionless Coupling C",
      short: "Coupling C",
      cmap: "viridis",
      vmin: 0.08,
      vmax: 1.05,
      vcenter: null,
      ymin: 0.0,
      ymax: 1.15,
      refLine: 1.0,
      unit: "",
      decimals: 2,
      signed: false
    },
    fm_pct: {
      zKey: "fm_pct",
      title: "Driver Freq Shift ΔF (%)",
      short: "ΔF (%)",
      cmap: "coolwarm",
      vmin: -32.0,
      vmax: 32.0,
      vcenter: 0.0,
      ymin: -38.0,
      ymax: 42.0,
      refLine: 0.0,
      unit: "%",
      decimals: 1,
      signed: true
    },
    carrier_fold: {
      zKey: "cr_fold",
      title: "MinD Carrier Wave Fold",
      short: "Carrier Fold",
      cmap: "RdBu_r",
      vmin: 0.55,
      vmax: 1.45,
      vcenter: 1.0,
      ymin: 0.45,
      ymax: 1.65,
      refLine: 1.0,
      unit: "×",
      decimals: 2,
      signed: false
    },
    loading_fold: {
      zKey: "load_fold",
      title: "Per-Carrier Loading Fold",
      short: "Loading Fold",
      cmap: "plasma",
      vmin: 1.0,
      vmax: 8.5,
      vcenter: null,
      ymin: 0.8,
      ymax: 9.2,
      refLine: 1.0,
      unit: "×",
      decimals: 2,
      signed: false
    },
    cargo_am_fold: {
      zKey: "am_fold",
      title: "Client Cargo AM Fold",
      short: "Cargo AM Fold",
      cmap: "viridis",
      vmin: 1.0,
      vmax: 8.0,
      vcenter: null,
      ymin: 0.8,
      ymax: 8.5,
      refLine: 1.0,
      unit: "×",
      decimals: 2,
      signed: false
    },
    cell_territory_pct: {
      zKey: "osc_pct",
      title: "Oscillating Penetrance (%)",
      short: "Osc (%)",
      cmap: "viridis",
      vmin: 0.0,
      vmax: 45.0,
      vcenter: null,
      ymin: 0.0,
      ymax: 65.0,
      refLine: null,
      unit: "%",
      decimals: 1,
      signed: false
    }
  };

  const TERTILE_STYLES = {
    lo:  { color: "#60a5fa", fill: "rgba(96, 165, 250, 0.16)", labelPrefix: "Low" },
    mid: { color: "#34d399", fill: "rgba(52, 211, 153, 0.16)", labelPrefix: "Mid" },
    hi:  { color: "#f472b6", fill: "rgba(244, 114, 182, 0.16)", labelPrefix: "High" }
  };

  function setupHiDPICanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = parseInt(canvas.dataset.w || canvas.width || 460, 10);
    const cssH = parseInt(canvas.dataset.h || canvas.height || 340, 10);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: cssW, H: cssH };
  }

  function getZBundleForProj(projKey) {
    if (projKey && projKey.endsWith("_abs")) {
      return window.ANTENNA_Z_SLICES_ABS || null;
    }
    return window.ANTENNA_Z_SLICES_SELF || null;
  }

  window.getZSpecForProjection = function(projKey) {
    const b = getZBundleForProj(projKey);
    if (b && b.z_specs && b.z_specs[projKey]) {
      return b.z_specs[projKey];
    }
    return {
      z_col: "abs_log10_E",
      z_edges: [3.95, 4.05, 4.15, 4.25, 4.35, 4.45, 4.55, 4.65, 4.75],
      z_label: "Absolute 3rd Variable log₁₀(AU)",
      z_short: "log₁₀(3rd Var AU)",
      z_symbol: "3rd Var"
    };
  };

  function getBinZData(constructId, projKey, bx, by) {
    const b = getZBundleForProj(projKey);
    if (!b || !b.constructs || !b.constructs[constructId]) return null;
    const pMap = b.constructs[constructId][projKey];
    if (!pMap) return null;
    return pMap[`${bx}_${by}`] || null;
  }

  function fmtVal(val, dec, unit = "", signed = false) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "—";
    const s = val.toFixed(dec);
    const prefix = signed && val > 0 ? "+" : "";
    return `${prefix}${s}${unit}`;
  }

  function doseToLogX(d, xLeft, plotW) {
    const c0 = 0.03;
    const maxD = 5.2;
    const t = (Math.log10(Math.max(0, d) + c0) - Math.log10(c0)) / (Math.log10(maxD + c0) - Math.log10(c0));
    return xLeft + Math.max(0, Math.min(1, t)) * plotW;
  }

  function evalHill(c, y0, y5, ec50, nh) {
    if (y0 === null || y5 === null || ec50 === null || nh === null) return null;
    const dy = y5 - y0;
    const cp = Math.max(0, c);
    const num = Math.pow(cp, nh);
    const den = Math.pow(Math.max(1e-6, ec50), nh) + num;
    return y0 + dy * (num / Math.max(1e-12, den));
  }

  /**
   * 1. Renders Panel A: 2D [Bt₂cAMP Dose (0..5 mM)] × [3rd Variable log₁₀(AU)] Response Portrait Heatmap
   */
  window.renderZSliceHeatmapCanvas = function(canvas, construct, projKey, bx, by, quadMetricKey) {
    if (!canvas || !construct) return;
    const { ctx, W, H } = setupHiDPICanvas(canvas);
    const mCfg = Z_METRIC_CONFIG[quadMetricKey] || Z_METRIC_CONFIG.coupling;
    const zSpec = window.getZSpecForProjection(projKey);
    const binZ = getBinZData(construct.id, projKey, bx, by);

    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, W, H);

    const padL = 62;
    const padR = 16;
    const padT = 32;
    const padB = 64;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const zEdges = zSpec.z_edges || [3.95, 4.05, 4.15, 4.25, 4.35, 4.45, 4.55, 4.65, 4.75];
    const nz = zEdges.length - 1;

    // Header banner inside canvas
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 11.5px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Bin (${bx}, ${by}) Core Sample: ${zSpec.z_symbol} [log₁₀ AU] × Bt₂cAMP Dose`, padL, 18);

    if (!binZ || !binZ.s || binZ.s.length === 0) {
      ctx.strokeStyle = "#1e293b";
      ctx.strokeRect(padL, padT, plotW, plotH);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 12px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Bin (${bx}, ${by}) is unpopulated in ${construct.valency} ${construct.mutation} ${construct.topology}`, padL + plotW / 2, padT + plotH / 2 - 8);
      ctx.fillStyle = "#64748b";
      ctx.font = "400 11px 'Inter', sans-serif";
      ctx.fillText("Click any active bin in the 2D Phase Portrait above to inspect its 3rd-variable profile.", padL + plotW / 2, padT + plotH / 2 + 12);
      return;
    }

    const doses = binZ.d || [];
    const nd = doses.length;
    const cellW = plotW / Math.max(1, nd);
    const cellH = plotH / nz;

    // Lookup map by bz (0..nz-1)
    const sliceMap = {};
    let totalVox = 0;
    binZ.s.forEach(s => {
      sliceMap[s.bz] = s;
      totalVox += (s.nv || 0);
    });

    ctx.fillStyle = "#38bdf8";
    ctx.font = "600 10.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${binZ.s.length}/${nz} ${zSpec.z_symbol} slices · ~${Math.round(totalVox)} vox/d`, W - padR, 18);

    // Draw background grid & cells (bz = 0 at bottom, bz = nz-1 at top)
    for (let bz = 0; bz < nz; bz++) {
      const rowY = padT + (nz - 1 - bz) * cellH;
      const sObj = sliceMap[bz];
      const vals = sObj && sObj.m ? sObj.m[mCfg.zKey] : null;

      for (let di = 0; di < nd; di++) {
        const colX = padL + di * cellW;
        const v = vals ? vals[di] : null;

        if (v !== null && v !== undefined && Number.isFinite(v)) {
          const tNorm = window.normalizeValue(v, mCfg.vmin, mCfg.vmax, mCfg.vcenter);
          const rgb = window.sampleColormap(mCfg.cmap, tNorm !== null ? tNorm : 0.5);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect(colX + 0.5, rowY + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellH) - 1);

          // Draw cell value text if cell is wide enough
          if (cellW >= 28 && cellH >= 18) {
            const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
            ctx.fillStyle = lum > 150 ? "#090d16" : "#f8fafc";
            ctx.font = "600 9.5px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(v.toFixed(mCfg.decimals), colX + cellW / 2, rowY + cellH / 2);
          }
        } else {
          // Unpopulated Z-slice or quiescent dose cell
          ctx.fillStyle = sObj ? "#111927" : "#0b101b";
          ctx.fillRect(colX + 0.5, rowY + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellH) - 1);
          if (sObj) {
            ctx.fillStyle = "#334155";
            ctx.font = "400 9px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("·", colX + cellW / 2, rowY + cellH / 2);
          }
        }
      }

      // Right-edge voxel count badge per Z-slice
      if (sObj) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
        ctx.fillRect(padL + 2, rowY + 2, 34, 13);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "500 8.5px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`n=${Math.max(1, Math.round(sObj.nv))}`, padL + 4, rowY + 3);
      }
    }

    // Outer frame
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Y-axis ticks (zEdges in log10 AU)
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= nz; i += 2) {
      const yPos = padT + (nz - i) * cellH;
      ctx.fillText(zEdges[i].toFixed(2), padL - 6, yPos);
      ctx.beginPath();
      ctx.moveTo(padL - 3, yPos);
      ctx.lineTo(padL, yPos);
      ctx.strokeStyle = "#475569";
      ctx.stroke();
    }

    // Y-axis rotated label
    ctx.save();
    ctx.translate(15, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(zSpec.z_short, 0, 0);
    ctx.restore();

    // X-axis dose labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let di = 0; di < nd; di++) {
      const colX = padL + (di + 0.5) * cellW;
      const dVal = doses[di];
      const dTxt = dVal === 0 ? "0" : (dVal < 1 && dVal !== 0.5 && dVal !== 0.2 && dVal !== 0.1 ? dVal.toFixed(2) : String(dVal));
      ctx.fillText(dTxt, colX, padT + plotH + 5);
    }
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 10.5px 'Inter', sans-serif";
    ctx.fillText("Bt₂cAMP Dose (mM)", padL + plotW / 2, padT + plotH + 20);

    // Mini Horizontal Colorbar at Bottom
    const cbY = H - 22;
    const cbH = 8;
    const cbW = Math.min(220, plotW * 0.65);
    const cbX = padL + (plotW - cbW) / 2;
    for (let i = 0; i < cbW; i++) {
      const t = i / Math.max(1, cbW - 1);
      const rgb = window.sampleColormap(mCfg.cmap, t);
      ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      ctx.fillRect(cbX + i, cbY, 1.5, cbH);
    }
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(cbX, cbY, cbW, cbH);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(`${mCfg.vmin.toFixed(mCfg.decimals)}${mCfg.unit}`, cbX - 6, cbY + cbH / 2);
    ctx.textAlign = "left";
    ctx.fillText(`${mCfg.vmax.toFixed(mCfg.decimals)}${mCfg.unit}`, cbX + cbW + 6, cbY + cbH / 2);
  };

  /**
   * 2. Renders Panel B:
   *    - Left Sub-Plot:  Metric vs. 3rd Variable (log₁₀ AU) Cross-Section at 0 mM (Basal) vs. 5 mM (Saturated)
   *    - Right Sub-Plot: Stratified 3rd-Variable Dose-Response Curves (Low Z · Mid Z · High Z tertiles)
   */
  window.renderZSliceCrossSectionAndCurvesCanvas = function(canvas, construct, projKey, bx, by, quadMetricKey, subMode = "split") {
    if (!canvas || !construct) return;
    const { ctx, W, H } = setupHiDPICanvas(canvas);
    const mCfg = Z_METRIC_CONFIG[quadMetricKey] || Z_METRIC_CONFIG.coupling;
    const zSpec = window.getZSpecForProjection(projKey);
    const binZ = getBinZData(construct.id, projKey, bx, by);

    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, W, H);

    if (!binZ || !binZ.s || binZ.s.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 12px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`No 3rd-variable slices in Bin (${bx}, ${by})`, W / 2, H / 2);
      return;
    }

    if (subMode === "cross_section") {
      drawZCrossSectionSubPlot(ctx, 0, 0, W, H, binZ, zSpec, mCfg, bx, by);
    } else if (subMode === "tertiles") {
      drawZTertileDoseCurvesSubPlot(ctx, 0, 0, W, H, binZ, zSpec, mCfg, bx, by);
    } else {
      // Default "split": Side-by-side Cross-Section (Left 48%) + Stratified Dose Curves (Right 52%)
      const wLeft = Math.floor(W * 0.48);
      const wRight = W - wLeft;
      drawZCrossSectionSubPlot(ctx, 0, 0, wLeft, H, binZ, zSpec, mCfg, bx, by);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wLeft, 8);
      ctx.lineTo(wLeft, H - 8);
      ctx.stroke();
      drawZTertileDoseCurvesSubPlot(ctx, wLeft, 0, wRight, H, binZ, zSpec, mCfg, bx, by);
    }
  };

  function drawZCrossSectionSubPlot(ctx, x0, y0, W, H, binZ, zSpec, mCfg, bx, by) {
    const padL = 46;
    const padR = 12;
    const padT = 34;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const zEdges = zSpec.z_edges || [3.95, 4.75];
    const zMin = zEdges[0];
    const zMax = zEdges[zEdges.length - 1];

    // Extract basal (low-dose <= 0.25 mM) and high-dose (5.0 mM, or >= 2.0 mM) values per Z-slice
    const doses = binZ.d || [];
    const pts = [];
    binZ.s.forEach(s => {
      const arr = s.m ? s.m[mCfg.zKey] : null;
      if (!arr) return;
      let vBasal = null;
      for (let i = 0; i < doses.length; i++) {
        if (doses[i] <= 0.26 && arr[i] !== null && Number.isFinite(arr[i])) {
          vBasal = arr[i];
          break;
        }
      }
      let vSat = null;
      for (let i = doses.length - 1; i >= 0; i--) {
        if (doses[i] >= 1.9 && arr[i] !== null && Number.isFinite(arr[i])) {
          vSat = arr[i];
          break;
        }
      }
      if (vBasal !== null || vSat !== null) {
        pts.push({ z: s.z, nv: s.nv, v0: vBasal, v5: vSat });
      }
    });

    pts.sort((a, b) => a.z - b.z);

    // Dynamic Y range anchored to mCfg bounds
    let yLo = mCfg.ymin;
    let yHi = mCfg.ymax;
    pts.forEach(p => {
      if (p.v0 !== null) { yLo = Math.min(yLo, p.v0 * 0.9); yHi = Math.max(yHi, p.v0 * 1.08); }
      if (p.v5 !== null) { yLo = Math.min(yLo, p.v5 * 0.9); yHi = Math.max(yHi, p.v5 * 1.08); }
    });

    const zToX = z => x0 + padL + ((z - zMin) / Math.max(1e-6, zMax - zMin)) * plotW;
    const vToY = v => y0 + padT + (1.0 - (v - yLo) / Math.max(1e-6, yHi - yLo)) * plotH;

    // Title
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 10.8px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`A. ${mCfg.short} vs. ${zSpec.z_symbol} (0 vs 5mM)`, x0 + padL - 6, y0 + 16);

    // Grid & frame
    ctx.fillStyle = "#0b111d";
    ctx.fillRect(x0 + padL, y0 + padT, plotW, plotH);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = y0 + padT + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(x0 + padL, gy);
      ctx.lineTo(x0 + padL + plotW, gy);
      ctx.stroke();

      const gv = yHi - (i / 4) * (yHi - yLo);
      ctx.fillStyle = "#64748b";
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(gv.toFixed(mCfg.decimals), x0 + padL - 5, gy);
    }

    if (mCfg.refLine !== null && mCfg.refLine >= yLo && mCfg.refLine <= yHi) {
      const ry = vToY(mCfg.refLine);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.beginPath();
      ctx.moveTo(x0 + padL, ry);
      ctx.lineTo(x0 + padL + plotW, ry);
      ctx.stroke();
      ctx.restore();
    }

    // Shaded inducible ribbon between 0 mM (v0) and 5 mM (v5)
    const bothPts = pts.filter(p => p.v0 !== null && p.v5 !== null);
    if (bothPts.length >= 2) {
      ctx.beginPath();
      bothPts.forEach((p, i) => {
        const px = zToX(p.z);
        const py = vToY(p.v5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      for (let i = bothPts.length - 1; i >= 0; i--) {
        ctx.lineTo(zToX(bothPts[i].z), vToY(bothPts[i].v0));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
      ctx.fill();
    }

    // Draw 0 mM Basal curve (dashed amber/slate)
    const p0s = pts.filter(p => p.v0 !== null);
    if (p0s.length >= 2) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      p0s.forEach((p, i) => {
        const px = zToX(p.z), py = vToY(p.v0);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }
    p0s.forEach(p => {
      const px = zToX(p.z), py = vToY(p.v0);
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });

    // Draw 5 mM Saturated curve (solid cyan)
    const p5s = pts.filter(p => p.v5 !== null);
    if (p5s.length >= 2) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      p5s.forEach((p, i) => {
        const px = zToX(p.z), py = vToY(p.v5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    p5s.forEach(p => {
      const px = zToX(p.z), py = vToY(p.v5);
      ctx.beginPath();
      ctx.arc(px, py, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = "#080c14";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // Compute linear slope of 5 mM metric wrt log10(Z)
    if (p5s.length >= 2) {
      const zm = p5s.reduce((a, b) => a + b.z, 0) / p5s.length;
      const vm = p5s.reduce((a, b) => a + b.v5, 0) / p5s.length;
      let num = 0, den = 0;
      p5s.forEach(p => {
        num += (p.z - zm) * (p.v5 - vm);
        den += (p.z - zm) * (p.z - zm);
      });
      const slope = den > 1e-4 ? num / den : 0.0;
      ctx.fillStyle = "#38bdf8";
      ctx.font = "500 9.5px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`5mM Slope: ${slope >= 0 ? "+" : ""}${slope.toFixed(2)}${mCfg.unit}/dex`, x0 + padL + 4, y0 + 28);
    }

    // Legend inside top-right of sub-plot
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("● 5mM", x0 + padL + plotW - 4, y0 + 28);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("○ 0mM", x0 + padL + plotW - 42, y0 + 28);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x0 + padL, y0 + padT, plotW, plotH);

    // X-axis ticks (log10 Z AU)
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [zMin, 0.5 * (zMin + zMax), zMax].forEach(zv => {
      const tx = zToX(zv);
      ctx.fillText(zv.toFixed(2), tx, y0 + padT + plotH + 5);
    });
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 10px 'Inter', sans-serif";
    ctx.fillText(zSpec.z_short, x0 + padL + plotW / 2, y0 + padT + plotH + 20);
  }

  function drawZTertileDoseCurvesSubPlot(ctx, x0, y0, W, H, binZ, zSpec, mCfg, bx, by) {
    const padL = 42;
    const padR = 12;
    const padT = 34;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const doses = binZ.d || [];
    const tDict = binZ.t || {};

    let yLo = mCfg.ymin;
    let yHi = mCfg.ymax;
    ["lo", "mid", "hi"].forEach(tk => {
      const tObj = tDict[tk];
      const mObj = tObj && tObj.m ? tObj.m[mCfg.zKey] : null;
      if (!mObj || !mObj.v) return;
      mObj.v.forEach(v => {
        if (v !== null && Number.isFinite(v)) {
          yLo = Math.min(yLo, v * 0.9);
          yHi = Math.max(yHi, v * 1.08);
        }
      });
    });

    const vToY = v => y0 + padT + (1.0 - (v - yLo) / Math.max(1e-6, yHi - yLo)) * plotH;

    // Title
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 10.8px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`B. Stratified ${zSpec.z_symbol} Tertile Curves`, x0 + padL - 6, y0 + 16);

    // Plot area background & grid
    ctx.fillStyle = "#0b111d";
    ctx.fillRect(x0 + padL, y0 + padT, plotW, plotH);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = y0 + padT + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(x0 + padL, gy);
      ctx.lineTo(x0 + padL + plotW, gy);
      ctx.stroke();

      const gv = yHi - (i / 4) * (yHi - yLo);
      ctx.fillStyle = "#64748b";
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(gv.toFixed(mCfg.decimals), x0 + padL - 5, gy);
    }

    if (mCfg.refLine !== null && mCfg.refLine >= yLo && mCfg.refLine <= yHi) {
      const ry = vToY(mCfg.refLine);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.beginPath();
      ctx.moveTo(x0 + padL, ry);
      ctx.lineTo(x0 + padL + plotW, ry);
      ctx.stroke();
      ctx.restore();
    }

    // Draw each Z-tertile (lo, mid, hi)
    const legendItems = [];
    ["lo", "mid", "hi"].forEach(tk => {
      const tObj = tDict[tk];
      if (!tObj || !tObj.m || !tObj.m[mCfg.zKey]) return;
      const style = TERTILE_STYLES[tk];
      const mObj = tObj.m[mCfg.zKey];
      const vals = mObj.v || [];
      const fit = mObj.f || []; // [y0, y5mM, ec50, nhill, r2]

      // 1. Draw smooth fitted Hill curve if valid
      if (fit[0] !== null && fit[1] !== null && fit[2] !== null && fit[3] !== null) {
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        const nSteps = 50;
        for (let s = 0; s <= nSteps; s++) {
          const dVal = (s / nSteps) * 5.0;
          const fv = evalHill(dVal, fit[0], fit[1], fit[2], fit[3]);
          const px = doseToLogX(dVal, x0 + padL, plotW);
          const py = vToY(fv);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else {
        // Connect empirical medians if Hill fit wasn't available
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < doses.length; i++) {
          if (vals[i] === null || !Number.isFinite(vals[i])) continue;
          const px = doseToLogX(doses[i], x0 + padL, plotW);
          const py = vToY(vals[i]);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // 2. Draw empirical median dots
      for (let i = 0; i < doses.length; i++) {
        if (vals[i] === null || !Number.isFinite(vals[i])) continue;
        const px = doseToLogX(doses[i], x0 + padL, plotW);
        const py = vToY(vals[i]);
        ctx.beginPath();
        ctx.arc(px, py, 3.0, 0, Math.PI * 2);
        ctx.fillStyle = style.color;
        ctx.fill();
        ctx.strokeStyle = "#080c14";
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      legendItems.push({
        color: style.color,
        text: `${style.labelPrefix} (${tObj.z !== undefined ? tObj.z.toFixed(2) : ""})`
      });
    });

    // Draw inline legend row above plot
    let lx = x0 + padL;
    ctx.font = "600 8.8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      ctx.fillText(`● ${item.text}`, lx, y0 + 28);
      lx += ctx.measureText(`● ${item.text}`).width + 8;
    });

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x0 + padL, y0 + padT, plotW, plotH);

    // X-axis dose ticks
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [0, 0.1, 0.25, 0.5, 1, 2, 5].forEach(dVal => {
      const tx = doseToLogX(dVal, x0 + padL, plotW);
      ctx.fillText(String(dVal), tx, y0 + padT + plotH + 5);
    });
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 10px 'Inter', sans-serif";
    ctx.fillText("Bt₂cAMP (mM)", x0 + padL + plotW / 2, y0 + padT + plotH + 20);
  }
})();
