/**
 * z_slice_inspector.js
 *
 * Renders the "3rd-Variable Core Sample Inspector" for any clicked 2D bin (bx, by) on the
 * EXACT 10-bin full axis (`bz = 0..9`) that the normal 2D Phase Portrait uses for that 3rd variable:
 *   1. `renderZSliceHeatmapCanvas`:
 *      Full 10-bin [Bt₂cAMP Dose (0..5 mM) + Whole-Portrait Ref] × [3rd Variable (10 bins)] Response Portrait.
 *      - Draws all 10 bins of the normal 3rd-variable axis (`#1e293b` slate grid + dashed Mid crosshair at bin 5).
 *      - Shows the whole portrait's 3rd-variable footprint (`whole_s`) as a muted ghost backdrop (26% opacity)
 *        outside the clicked bin, plus a dedicated `Whole` reference column on the right.
 *      - Highlights the clicked bin's populated core slice (`binZ.s`) at 100% saturation with a bright
 *        cyan/white contour border so you see the core slice relative to the whole portrait.
 *   2. `renderZSliceCrossSectionAndCurvesCanvas`:
 *      Side-by-side (or toggled full-width) view of:
 *        (A) Metric vs. 3rd Variable (Full 10-Bin Axis) Cross-Section at 0 mM vs 5 mM,
 *            overlaying the Clicked Bin Core Slice on top of the Whole-Portrait 5mM/0mM reference curve.
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
      is_global_abs: true,
      z_edges: [3.95, 4.03, 4.11, 4.19, 4.27, 4.35, 4.43, 4.51, 4.59, 4.67, 4.75],
      z_ticks: ["4.75", "4.35", "3.95"],
      z_label: "Absolute 3rd Variable log₁₀(AU)",
      z_short: "log₁₀(3rd Var AU)",
      z_symbol: "3rd Var"
    };
  };

  function getConstructZMap(constructId, projKey) {
    const b = getZBundleForProj(projKey);
    if (!b || !b.constructs || !b.constructs[constructId]) return null;
    return b.constructs[constructId][projKey] || null;
  }

  function getBinZData(constructId, projKey, bx, by) {
    const pMap = getConstructZMap(constructId, projKey);
    if (!pMap) return { binZ: null, metaZ: null };
    return {
      binZ: pMap[`${bx}_${by}`] || null,
      metaZ: pMap["_meta"] || null
    };
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

  function extractBasalAndSatBySlice(slicesArr, dosesArr, zKey) {
    const map = {};
    if (!slicesArr || !dosesArr) return map;
    slicesArr.forEach(s => {
      const arr = s.m ? s.m[zKey] : null;
      if (!arr) return;
      let vBasal = null;
      for (let i = 0; i < dosesArr.length; i++) {
        if (dosesArr[i] <= 0.26 && arr[i] !== null && Number.isFinite(arr[i])) {
          vBasal = arr[i];
          break;
        }
      }
      let vSat = null;
      for (let i = dosesArr.length - 1; i >= 0; i--) {
        if (dosesArr[i] >= 1.9 && arr[i] !== null && Number.isFinite(arr[i])) {
          vSat = arr[i];
          break;
        }
      }
      map[s.bz] = { bz: s.bz, z: s.z, nv: s.nv, v0: vBasal, v5: vSat, arr };
    });
    return map;
  }

  /**
   * 1. Renders Panel A:
   *    Full 10-Bin [Bt₂cAMP Dose (0..5 mM) + Whole-Portrait 5mM Ref] × [3rd Variable (10 bins)] Response Portrait
   *    - Always displays on the FULL 10-bin axis (`bz = 0..9`) that the normal 2D portrait plots for that 3rd variable.
   *    - Shows the whole portrait's 3rd-variable span (`whole_s`) as a muted ghost backdrop outside the clicked bin,
   *      plus a dedicated `Whole 5mM` reference strip on the right.
   *    - Frames the clicked bin's core slice (`binZ.s`) in full color with a bright cyan/white contour box.
   */
  window.renderZSliceHeatmapCanvas = function(canvas, construct, projKey, bx, by, quadMetricKey) {
    if (!canvas || !construct) return;
    const { ctx, W, H } = setupHiDPICanvas(canvas);
    const mCfg = Z_METRIC_CONFIG[quadMetricKey] || Z_METRIC_CONFIG.coupling;
    const zSpec = window.getZSpecForProjection(projKey);
    const { binZ, metaZ } = getBinZData(construct.id, projKey, bx, by);

    // Match the dark-slate background of `renderPhasePortraitCanvas`
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const padL = 48;
    const padR = 54; // Room on right for the dedicated "Whole Portrait (5mM)" 10-bin reference strip!
    const padT = 24;
    const padB = 56;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const zEdges = zSpec.z_edges || [3.95, 4.03, 4.11, 4.19, 4.27, 4.35, 4.43, 4.51, 4.59, 4.67, 4.75];
    const nz = zEdges.length - 1; // Always 10 bins (matching the 10x10 2D portraits!)
    const cellH = plotH / nz;

    const wholeSlices = (metaZ && metaZ.whole_s) ? metaZ.whole_s : [];
    const wholeDoses = (metaZ && metaZ.d) ? metaZ.d : [0, 0.1, 0.25, 0.5, 1, 2, 5];
    const wholeMap = {};
    wholeSlices.forEach(s => { wholeMap[s.bz] = s; });
    const wholeSatMap = extractBasalAndSatBySlice(wholeSlices, wholeDoses, mCfg.zKey);

    const doses = (binZ && binZ.d && binZ.d.length > 0) ? binZ.d : wholeDoses;
    const nd = Math.max(1, doses.length);
    const cellW = plotW / nd;

    const sliceMap = {};
    let totalVox = 0;
    let bzMinCore = 99, bzMaxCore = -1;
    if (binZ && binZ.s) {
      binZ.s.forEach(s => {
        sliceMap[s.bz] = s;
        totalVox += (s.nv || 0);
        if (s.bz < bzMinCore) bzMinCore = s.bz;
        if (s.bz > bzMaxCore) bzMaxCore = s.bz;
      });
    }

    let bzMinWhole = 99, bzMaxWhole = -1;
    wholeSlices.forEach(s => {
      if (s.bz < bzMinWhole) bzMinWhole = s.bz;
      if (s.bz > bzMaxWhole) bzMaxWhole = s.bz;
    });

    // Top header inside canvas
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 10.5px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const medZTxt = (metaZ && metaZ.med_z !== null && metaZ.med_z !== undefined && !zSpec.is_global_abs)
      ? ` (0mM Med = ${metaZ.med_z.toFixed(2)} AU)`
      : "";
    ctx.fillText(`Full 10-Bin ${zSpec.z_symbol} Axis${medZTxt} — Core Bin (${bx}, ${by}) vs Whole Portrait`, padL, 15);

    const activeCoreCount = binZ && binZ.s ? binZ.s.length : 0;
    ctx.fillStyle = "#38bdf8";
    ctx.font = "600 9.8px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`Core: ${activeCoreCount}/${nz} bins (Whole: ${wholeSlices.length}/${nz})`, W - 8, 15);

    // Base unpopulated 10-bin background (`#1e293b`, matching `renderPhasePortraitCanvas`)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(padL, padT, plotW, plotH);

    // Draw all 10 rows (`bz = 0..9`, with bz=0 at bottom and bz=9 at top, matching 2D portraits!)
    for (let bz = 0; bz < nz; bz++) {
      const rowY = padT + (nz - 1 - bz) * cellH;
      const sCore = sliceMap[bz];
      const sWhole = wholeMap[bz];
      const coreVals = sCore && sCore.m ? sCore.m[mCfg.zKey] : null;
      const wholeVals = sWhole && sWhole.m ? sWhole.m[mCfg.zKey] : null;

      for (let di = 0; di < nd; di++) {
        const colX = padL + di * cellW;
        const vCore = coreVals && di < coreVals.length ? coreVals[di] : null;
        const vWhole = wholeVals && di < wholeVals.length ? wholeVals[di] : null;

        if (vCore !== null && vCore !== undefined && Number.isFinite(vCore)) {
          // 1. Populated in Clicked Bin (bx, by) Core Slice -> Full 100% vivid color!
          const tNorm = window.normalizeValue(vCore, mCfg.vmin, mCfg.vmax, mCfg.vcenter);
          const rgb = window.sampleColormap(mCfg.cmap, tNorm !== null ? tNorm : 0.5);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect(colX + 0.5, rowY + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellH) - 1);

          if (cellW >= 26 && cellH >= 15) {
            const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
            ctx.fillStyle = lum > 150 ? "#090d16" : "#f8fafc";
            ctx.font = "600 9px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(vCore.toFixed(mCfg.decimals), colX + cellW / 2, rowY + cellH / 2);
          }
        } else if (vWhole !== null && vWhole !== undefined && Number.isFinite(vWhole)) {
          // 2. Populated in Whole Portrait, but outside Clicked Bin (bx, by) -> Ghosted 22% blend over #1e293b
          const tNorm = window.normalizeValue(vWhole, mCfg.vmin, mCfg.vmax, mCfg.vcenter);
          const rgb = window.sampleColormap(mCfg.cmap, tNorm !== null ? tNorm : 0.5);
          const alpha = 0.20;
          const rB = Math.round(alpha * rgb[0] + (1 - alpha) * 30);
          const gB = Math.round(alpha * rgb[1] + (1 - alpha) * 41);
          const bB = Math.round(alpha * rgb[2] + (1 - alpha) * 59);
          ctx.fillStyle = `rgb(${rB}, ${gB}, ${bB})`;
          ctx.fillRect(colX + 0.5, rowY + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellH) - 1);
        } else {
          // 3. Unpopulated even in Whole Portrait -> Standard #1e293b empty bin
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(colX + 0.5, rowY + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellH) - 1);
        }

        // Subtle cell border for all 10xN cells so the full 10-bin coordinate grid is always crisp
        ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(colX, rowY, cellW, cellH);
      }

      // Voxel count badge on left edge of populated Core Slice rows
      if (sCore) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.fillRect(padL + 2, rowY + 2, 32, 12);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "600 8px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`n=${Math.max(1, Math.round(sCore.nv))}`, padL + 4, rowY + 3);
      }
    }

    // Draw Dedicated "Whole 5mM" 10-Bin Reference Strip on the Right (`padL + plotW + 8`)
    const refX = padL + plotW + 8;
    const refW = 36;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Whole", refX + refW / 2, padT - 2);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(refX, padT, refW, plotH);
    for (let bz = 0; bz < nz; bz++) {
      const rowY = padT + (nz - 1 - bz) * cellH;
      const wSat = wholeSatMap[bz] ? wholeSatMap[bz].v5 : null;
      const isCoreRow = Boolean(sliceMap[bz]);
      if (wSat !== null && Number.isFinite(wSat)) {
        const tNorm = window.normalizeValue(wSat, mCfg.vmin, mCfg.vmax, mCfg.vcenter);
        const rgb = window.sampleColormap(mCfg.cmap, tNorm !== null ? tNorm : 0.5);
        const a = isCoreRow ? 1.0 : 0.48;
        const rB = Math.round(a * rgb[0] + (1 - a) * 30);
        const gB = Math.round(a * rgb[1] + (1 - a) * 41);
        const bB = Math.round(a * rgb[2] + (1 - a) * 59);
        ctx.fillStyle = `rgb(${rB}, ${gB}, ${bB})`;
        ctx.fillRect(refX + 0.5, rowY + 0.5, refW - 1, Math.ceil(cellH) - 1);

        if (cellH >= 15) {
          const lum = 0.299 * rB + 0.587 * gB + 0.114 * bB;
          ctx.fillStyle = lum > 150 ? "#090d16" : (isCoreRow ? "#ffffff" : "#cbd5e1");
          ctx.font = `${isCoreRow ? "700" : "500"} 8.2px 'JetBrains Mono', monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(wSat.toFixed(mCfg.decimals), refX + refW / 2, rowY + cellH / 2);
        }
      }
      ctx.strokeStyle = "rgba(15, 23, 42, 0.6)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(refX, rowY, refW, cellH);
    }
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(refX, padT, refW, plotH);

    // Draw Dashed Midpoint Crosshair at bin 5 (`bz = 5`, matching the 2D Phase Portrait's horizontal crosshair!)
    const midY = padT + 5 * cellH;
    ctx.save();
    ctx.strokeStyle = "rgba(226, 232, 240, 0.50)";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(refX + refW, midY);
    ctx.stroke();
    ctx.restore();

    // Draw Whole-Portrait Span Dashed Bracket (`bzMinWhole .. bzMaxWhole`)
    if (bzMaxWhole >= bzMinWhole) {
      const yTopW = padT + (nz - 1 - bzMaxWhole) * cellH;
      const yBotW = padT + (nz - bzMinWhole) * cellH;
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(padL + 1, yTopW + 1, plotW - 2, yBotW - yTopW - 2);
      ctx.restore();
    }

    // Draw Bright Cyan/White Highlight Contour around the Clicked Bin's Core Slice (`bzMinCore .. bzMaxCore`)
    if (bzMaxCore >= bzMinCore) {
      const yTopC = padT + (nz - 1 - bzMaxCore) * cellH;
      const yBotC = padT + (nz - bzMinCore) * cellH;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2.6;
      ctx.strokeRect(padL + 1, yTopC + 1, plotW - 2, yBotC - yTopC - 2);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.6;
      ctx.strokeRect(padL + 1, yTopC + 1, plotW - 2, yBotC - yTopC - 2);
      // Also highlight the corresponding rows on the "Whole 5mM" strip
      ctx.strokeRect(refX + 0.5, yTopC + 0.5, refW - 1, yBotC - yTopC - 1);
      ctx.restore();
    } else {
      // Unpopulated (bx, by) bin message overlay
      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      ctx.fillRect(padL + 16, padT + plotH / 2 - 22, plotW - 32, 44);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(padL + 16, padT + plotH / 2 - 22, plotW - 32, 44);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 10.5px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Bin (${bx}, ${by}) has no active voxels in ${construct.valency} ${construct.mutation}`, padL + plotW / 2, padT + plotH / 2 - 6);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "400 9.5px 'Inter', sans-serif";
      ctx.fillText("Whole-portrait 3rd-variable span is shown in the background.", padL + plotW / 2, padT + plotH / 2 + 10);
    }

    // In Global Shared mode, draw the Gold Diamond Marker at this construct's 0 mM median Z on the Y-axis
    if (zSpec.is_global_abs && metaZ && Number.isFinite(metaZ.med_z)) {
      const fz = (metaZ.med_z - zEdges[0]) / Math.max(1e-9, zEdges[zEdges.length - 1] - zEdges[0]);
      const my = padT + (1.0 - Math.max(0.02, Math.min(0.98, fz))) * plotH;
      const mx = padL;
      const r = 4.2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }

    // Outer frame
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Y-axis ticks matching `renderPhasePortraitCanvas` (`z_ticks` at top, mid, bottom + intermediate bin edges)
    const yTicks = zSpec.z_ticks || [
      zEdges[zEdges.length - 1].toFixed(2),
      zEdges[5].toFixed(2),
      zEdges[0].toFixed(2)
    ];
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(yTicks[0], padL - 5, padT + 0.8 * cellH);
    ctx.fillText(yTicks[1], padL - 5, padT + 5.0 * cellH);
    ctx.fillText(yTicks[2], padL - 5, padT + 9.2 * cellH);

    // Y-axis rotated label (matching normal 2D portrait label!)
    ctx.save();
    ctx.translate(11, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9.2px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(zSpec.z_short, 0, 0);
    ctx.restore();

    // X-axis dose labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let di = 0; di < nd; di++) {
      const colX = padL + (di + 0.5) * cellW;
      const dVal = doses[di];
      const dTxt = dVal === 0 ? "0" : (dVal < 1 && dVal !== 0.5 && dVal !== 0.2 && dVal !== 0.1 ? dVal.toFixed(2) : String(dVal));
      ctx.fillText(dTxt, colX, padT + plotH + 4);
    }
    ctx.fillText("5mM", refX + refW / 2, padT + plotH + 4);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9.5px 'Inter', sans-serif";
    ctx.fillText("Bt₂cAMP Dose (mM)  [Cyan Box = Core Slice | Ghost/Right = Whole Portrait]", padL + (plotW + refW) / 2, padT + plotH + 18);

    // Mini Horizontal Colorbar at Bottom
    const cbY = H - 17;
    const cbH = 7;
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
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(`${mCfg.vmin.toFixed(mCfg.decimals)}${mCfg.unit}`, cbX - 6, cbY + cbH / 2);
    ctx.textAlign = "left";
    ctx.fillText(`${mCfg.vmax.toFixed(mCfg.decimals)}${mCfg.unit}`, cbX + cbW + 6, cbY + cbH / 2);
  };

  /**
   * 2. Renders Panel B:
   *    - Sub-Plot A: Metric vs. 3rd Variable (Full 10-Bin Axis) Cross-Section at 0 mM vs 5 mM,
   *                  showing the Clicked Bin Core Slice overlaid on the Whole-Portrait 10-bin profile!
   *    - Sub-Plot B: Stratified 3rd-Variable Dose-Response Curves (Low Z · Mid Z · High Z tertiles)
   */
  window.renderZSliceCrossSectionAndCurvesCanvas = function(canvas, construct, projKey, bx, by, quadMetricKey, subMode = "split") {
    if (!canvas || !construct) return;
    const { ctx, W, H } = setupHiDPICanvas(canvas);
    const mCfg = Z_METRIC_CONFIG[quadMetricKey] || Z_METRIC_CONFIG.coupling;
    const zSpec = window.getZSpecForProjection(projKey);
    const { binZ, metaZ } = getBinZData(construct.id, projKey, bx, by);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (subMode === "cross_section") {
      drawZCrossSectionSubPlot(ctx, 0, 0, W, H, binZ, metaZ, zSpec, mCfg, bx, by);
    } else if (subMode === "tertiles") {
      drawZTertileDoseCurvesSubPlot(ctx, 0, 0, W, H, binZ, metaZ, zSpec, mCfg, bx, by);
    } else {
      // Side-by-side: Cross-Section on full 10-bin axis (Left 50%) + Stratified Dose Curves (Right 50%)
      const wLeft = Math.floor(W * 0.50);
      const wRight = W - wLeft;
      drawZCrossSectionSubPlot(ctx, 0, 0, wLeft, H, binZ, metaZ, zSpec, mCfg, bx, by);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wLeft, 8);
      ctx.lineTo(wLeft, H - 8);
      ctx.stroke();
      drawZTertileDoseCurvesSubPlot(ctx, wLeft, 0, wRight, H, binZ, metaZ, zSpec, mCfg, bx, by);
    }
  };

  function drawZCrossSectionSubPlot(ctx, x0, y0, W, H, binZ, metaZ, zSpec, mCfg, bx, by) {
    const padL = 44;
    const padR = 12;
    const padT = 34;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const zEdges = zSpec.z_edges || [3.95, 4.03, 4.11, 4.19, 4.27, 4.35, 4.43, 4.51, 4.59, 4.67, 4.75];
    const nz = zEdges.length - 1;
    const zMin = zEdges[0];
    const zMax = zEdges[zEdges.length - 1];

    // 1. Extract Whole-Portrait 0 mM & 5 mM points across all 10 bins
    const wholeSlices = (metaZ && metaZ.whole_s) ? metaZ.whole_s : [];
    const wholeDoses = (metaZ && metaZ.d) ? metaZ.d : [];
    const wholeMap = extractBasalAndSatBySlice(wholeSlices, wholeDoses, mCfg.zKey);
    const wholePts = Object.values(wholeMap).sort((a, b) => a.z - b.z);

    // 2. Extract Clicked Bin (bx, by) Core Slice 0 mM & 5 mM points
    const coreSlices = (binZ && binZ.s) ? binZ.s : [];
    const coreDoses = (binZ && binZ.d) ? binZ.d : [];
    const coreMap = extractBasalAndSatBySlice(coreSlices, coreDoses, mCfg.zKey);
    const corePts = Object.values(coreMap).sort((a, b) => a.z - b.z);

    // Dynamic Y range anchored to mCfg bounds
    let yLo = mCfg.ymin;
    let yHi = mCfg.ymax;
    wholePts.concat(corePts).forEach(p => {
      if (p.v0 !== null) { yLo = Math.min(yLo, p.v0 * 0.9); yHi = Math.max(yHi, p.v0 * 1.08); }
      if (p.v5 !== null) { yLo = Math.min(yLo, p.v5 * 0.9); yHi = Math.max(yHi, p.v5 * 1.08); }
    });

    const zToX = z => x0 + padL + ((z - zMin) / Math.max(1e-6, zMax - zMin)) * plotW;
    const vToY = v => y0 + padT + (1.0 - (v - yLo) / Math.max(1e-6, yHi - yLo)) * plotH;

    // Title
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 10.4px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`A. ${mCfg.short} vs Full 10-Bin ${zSpec.z_symbol}`, x0 + padL - 6, y0 + 15);

    // Plot box background (`#1e293b` unpopulated slate, with highlighted vertical band for Core Slice!)
    ctx.fillStyle = "#0b111d";
    ctx.fillRect(x0 + padL, y0 + padT, plotW, plotH);

    if (corePts.length > 0) {
      const bzLo = Math.min(...corePts.map(p => p.bz));
      const bzHi = Math.max(...corePts.map(p => p.bz));
      const xCoreL = zToX(zEdges[bzLo]);
      const xCoreR = zToX(zEdges[bzHi + 1]);
      ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
      ctx.fillRect(xCoreL, y0 + padT, Math.max(2, xCoreR - xCoreL), plotH);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.32)";
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(xCoreL, y0 + padT);
      ctx.lineTo(xCoreL, y0 + padT + plotH);
      ctx.moveTo(xCoreR, y0 + padT);
      ctx.lineTo(xCoreR, y0 + padT + plotH);
      ctx.stroke();
    }

    // Draw all 10 vertical bin gridlines (`zEdges[0..10]`) + dashed midpoint crosshair at bin 5
    for (let i = 1; i < nz; i++) {
      const gx = zToX(zEdges[i]);
      ctx.save();
      if (i === 5) {
        ctx.strokeStyle = "rgba(226, 232, 240, 0.40)";
        ctx.setLineDash([3, 3]);
      } else {
        ctx.strokeStyle = "rgba(30, 41, 59, 0.85)";
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, y0 + padT);
      ctx.lineTo(gx, y0 + padT + plotH);
      ctx.stroke();
      ctx.restore();
    }

    // Horizontal Y gridlines
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
      ctx.font = "500 8.8px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(gv.toFixed(mCfg.decimals), x0 + padL - 4, gy);
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

    // 1. Draw Whole-Portrait Ghost Curve (`wholePts` at 5 mM and 0 mM) across the full construct span
    const w5s = wholePts.filter(p => p.v5 !== null);
    if (w5s.length >= 2) {
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.42)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      w5s.forEach((p, i) => {
        const px = zToX(p.z), py = vToY(p.v5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
      w5s.forEach(p => {
        ctx.beginPath();
        ctx.arc(zToX(p.z), vToY(p.v5), 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
        ctx.fill();
      });
    }

    // 2. Shaded inducible ribbon for Clicked Bin Core Slice (`corePts`) between 0 mM and 5 mM
    const bothCore = corePts.filter(p => p.v0 !== null && p.v5 !== null);
    if (bothCore.length >= 2) {
      ctx.beginPath();
      bothCore.forEach((p, i) => {
        const px = zToX(p.z), py = vToY(p.v5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      for (let i = bothCore.length - 1; i >= 0; i--) {
        ctx.lineTo(zToX(bothCore[i].z), vToY(bothCore[i].v0));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
      ctx.fill();
    }

    // 3. Draw Clicked Bin 0 mM Basal curve (dashed slate)
    const p0s = corePts.filter(p => p.v0 !== null);
    if (p0s.length >= 2) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#cbd5e1";
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
      ctx.arc(px, py, 3.0, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 4. Draw Clicked Bin 5 mM Saturated curve (bold cyan)
    const p5s = corePts.filter(p => p.v5 !== null);
    if (p5s.length >= 2) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
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

    // Compute linear slope of 5 mM metric wrt Z
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
      ctx.font = "600 8.8px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`Slope:${slope >= 0 ? "+" : ""}${slope.toFixed(2)}${mCfg.unit}/dex`, x0 + padL - 4, y0 + 28);
    }

    // Legend inside top-right of sub-plot
    ctx.font = "500 8.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("●5mM ○0mM ··Whole", x0 + padL + plotW, y0 + 28);

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x0 + padL, y0 + padT, plotW, plotH);

    // X-axis ticks matching the normal 2D portrait's 10-bin axis (`z_ticks` at left=bin0, mid=bin5, right=bin9)
    const zTicks = zSpec.z_ticks || [
      zEdges[zEdges.length - 1].toFixed(2),
      zEdges[5].toFixed(2),
      zEdges[0].toFixed(2)
    ];
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Note: in `PROJECTION_DEFS`, y_ticks are ordered [top(high), mid, bottom(low)], so zTicks[2] is low (left) and zTicks[0] is high (right)
    ctx.fillText(zTicks[2], x0 + padL + 0.08 * plotW, y0 + padT + plotH + 5);
    ctx.fillText(zTicks[1], x0 + padL + 0.50 * plotW, y0 + padT + plotH + 5);
    ctx.fillText(zTicks[0], x0 + padL + 0.92 * plotW, y0 + padT + plotH + 5);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9.5px 'Inter', sans-serif";
    ctx.fillText(zSpec.z_short, x0 + padL + plotW / 2, y0 + padT + plotH + 20);
  }

  function drawZTertileDoseCurvesSubPlot(ctx, x0, y0, W, H, binZ, metaZ, zSpec, mCfg, bx, by) {
    const padL = 42;
    const padR = 12;
    const padT = 34;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const doses = (binZ && binZ.d) ? binZ.d : [];
    const tDict = (binZ && binZ.t) ? binZ.t : {};

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
    ctx.font = "600 10.4px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`B. Stratified ${zSpec.z_symbol} Tertile Curves`, x0 + padL - 6, y0 + 15);

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
      ctx.font = "500 8.8px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(gv.toFixed(mCfg.decimals), x0 + padL - 4, gy);
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

      const zDisp = tObj.z !== undefined
        ? (!zSpec.is_global_abs && tObj.z > 0 ? `+${tObj.z.toFixed(2)}` : tObj.z.toFixed(2))
        : "";
      legendItems.push({
        color: style.color,
        text: `${style.labelPrefix}(${zDisp})`
      });
    });

    let lx = x0 + padL - 4;
    ctx.font = "600 8.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      ctx.fillText(`●${item.text}`, lx, y0 + 28);
      lx += ctx.measureText(`●${item.text}`).width + 6;
    });

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x0 + padL, y0 + padT, plotW, plotH);

    // X-axis dose ticks
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 8.8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [0, 0.1, 0.25, 0.5, 1, 2, 5].forEach(dVal => {
      const tx = doseToLogX(dVal, x0 + padL, plotW);
      ctx.fillText(String(dVal), tx, y0 + padT + plotH + 5);
    });
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9.5px 'Inter', sans-serif";
    ctx.fillText("Bt₂cAMP (mM)", x0 + padL + plotW / 2, y0 + padT + plotH + 20);
  }
})();
