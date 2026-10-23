/**
 * quadrant_curves.js
 * High-DPI HTML5 Canvas renderer for 4-Quadrant (Q1..Q4) Dose-Response Curves (0–5.0 mM Bt₂cAMP)
 * and Clicked-Bin (bx, by) Dose-Response Curves, styled for the dark-slate H9 Physiology Atlas theme.
 * Supports both Pixel-Voxel (`quadrants_pixel`) and Single-Cell ultrack Mask (`quadrants_cell`) datasets.
 */

(function() {
  const QUAD_STYLES = [
    { code: "Q1_Slow_HiLoad", short: "Q1", label: "Q1: Slow (Hi D/E) + Hi Load", color: "#f87171", rgbaFill: "rgba(248, 113, 113, 0.15)", marker: "circle", dash: [], lw: 2.1, showIqr: true },
    { code: "Q3_Slow_LoLoad", short: "Q3", label: "Q3: Slow (Hi D/E) + Lo Load", color: "#60a5fa", rgbaFill: "rgba(96, 165, 250, 0.10)", marker: "triangle", dash: [], lw: 1.75, showIqr: false },
    { code: "Q2_Fast_HiLoad", short: "Q2", label: "Q2: Fast (Hi E/D) + Hi Load", color: "#fb923c", rgbaFill: "rgba(251, 146, 60, 0.10)", marker: "square", dash: [4, 3], lw: 1.65, showIqr: false },
    { code: "Q4_Fast_LoLoad", short: "Q4", label: "Q4: Fast (Hi E/D) + Lo Load", color: "#34d399", rgbaFill: "rgba(52, 211, 153, 0.14)", marker: "diamond", dash: [4, 3], lw: 1.95, showIqr: true }
  ];

  function setupHiDPICanvas(canvas, defaultW = 300, defaultH = 240) {
    if (!canvas.dataset.w) {
      canvas.dataset.w = String(Number(canvas.getAttribute("width")) || defaultW);
      canvas.dataset.h = String(Number(canvas.getAttribute("height")) || defaultH);
    }
    const cssW = Number(canvas.dataset.w);
    const cssH = Number(canvas.dataset.h);
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cssW, cssH, dpr };
  }

  function evalHill(c, y0, dyMax, ec50, nhill) {
    if (c <= 0) return y0;
    const ec = Math.max(1e-6, ec50 || 0.35);
    const nh = Math.max(0.25, Math.min(6.0, nhill || 1.3));
    const num = Math.pow(c, nh);
    const den = Math.pow(ec, nh) + num;
    return y0 + dyMax * (num / Math.max(1e-12, den));
  }

  /**
   * Extracts the Hill curve parameters { y0, dyMax, y5mM, ec50, nhill, r2 } for a specific 2D bin (bx, by)
   * and quadrant metric key ("coupling", "fm_pct", "carrier_fold", "loading_fold", "cargo_am_fold", "cell_territory_pct").
   */
  window.extractBinHillParams = function(binObj, metricKey) {
    if (!binObj) return null;
    if (metricKey === "coupling") {
      if (binObj.coup_y0 === null || binObj.coup_5mM === null) return null;
      const y0 = binObj.coup_y0;
      const y5 = binObj.coup_5mM;
      const dyMax = (binObj.coup_dy_max !== null && binObj.coup_dy_max !== undefined) ? binObj.coup_dy_max : (y5 - y0);
      return { y0, dyMax, y5mM: y5, dy: y5 - y0, ec50: binObj.coup_ec50 || 0.35, nhill: binObj.coup_nhill || 1.4, r2: binObj.coup_r2 || 0.0 };
    } else if (metricKey === "fm_pct") {
      if (binObj.fm_5mM_pct === null) return null;
      const y0 = 0.0;
      const y5 = binObj.fm_5mM_pct;
      const dyMax = (binObj.fm_dy_max_pct !== null && binObj.fm_dy_max_pct !== undefined) ? binObj.fm_dy_max_pct : y5;
      return { y0, dyMax, y5mM: y5, dy: y5, ec50: binObj.fm_ec50 || 0.35, nhill: binObj.fm_nhill || 1.4, r2: binObj.fm_r2 || 0.0 };
    } else if (metricKey === "carrier_fold") {
      if (binObj.cr_5mM_fold === null) return null;
      const y0 = 1.0;
      const y5 = binObj.cr_5mM_fold;
      const dyMax = (binObj.cr_max_fold !== null && binObj.cr_max_fold !== undefined) ? (binObj.cr_max_fold - 1.0) : (y5 - 1.0);
      return { y0, dyMax, y5mM: y5, dy: y5 - 1.0, ec50: binObj.cr_ec50 || 0.35, nhill: binObj.cr_nhill || 1.4, r2: binObj.cr_r2 || 0.0 };
    } else if (metricKey === "loading_fold") {
      if (binObj.load_5mM_fold === null) return null;
      const y0 = 1.0;
      const y5 = binObj.load_5mM_fold;
      const dyMax = (binObj.load_max_fold !== null && binObj.load_max_fold !== undefined) ? (binObj.load_max_fold - 1.0) : (y5 - 1.0);
      return { y0, dyMax, y5mM: y5, dy: y5 - 1.0, ec50: binObj.load_ec50 || 0.35, nhill: binObj.load_nhill || 1.4, r2: binObj.load_r2 || 0.0 };
    } else if (metricKey === "cargo_am_fold") {
      if (binObj.am_5mM_fold === null) return null;
      const y0 = 1.0;
      const y5 = binObj.am_5mM_fold;
      const dyMax = (binObj.am_max_fold !== null && binObj.am_max_fold !== undefined) ? (binObj.am_max_fold - 1.0) : (y5 - 1.0);
      return { y0, dyMax, y5mM: y5, dy: y5 - 1.0, ec50: binObj.am_ec50 || 0.35, nhill: binObj.am_nhill || 1.4, r2: binObj.am_r2 || 0.0 };
    } else if (metricKey === "cell_territory_pct") {
      if (binObj.osc_y0_pct === null || binObj.osc_5mM_pct === null) return null;
      const y0 = binObj.osc_y0_pct;
      const y5 = binObj.osc_5mM_pct;
      const dyMax = (binObj.osc_dy_pct !== null && binObj.osc_dy_pct !== undefined) ? binObj.osc_dy_pct : (y5 - y0);
      return { y0, dyMax, y5mM: y5, dy: y5 - y0, ec50: binObj.osc_ec50 || 0.35, nhill: binObj.osc_nhill || 1.4, r2: binObj.osc_r2 || 0.0 };
    }
    return null;
  };

  function drawMarker(ctx, type, x, y, r, color, strokeCol = null) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (type === "circle") {
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    } else if (type === "square") {
      ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    } else if (type === "triangle") {
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x - r * 1.05, y + r * 0.9);
      ctx.lineTo(x + r * 1.05, y + r * 0.9);
      ctx.closePath();
    } else if (type === "diamond") {
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
    }
    ctx.fill();
    if (strokeCol) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  /**
   * Renders the 4-Quadrant (Q1..Q4) Dose-Response Curves (0–5.0 mM) onto a <canvas>,
   * PLUS an optional glowing cyan curve for the currently clicked 2D stoichiometry bin `options.selectedBin = { bx, by }`!
   */
  window.renderQuadrantDoseCurveCanvas = function(canvas, construct, options = {}) {
    if (!canvas) return;
    const dataSource = options.dataSource || "pixel";
    const metricKey = options.metricKey || "coupling";
    const qSpec = window.QUADRANT_METRIC_MAP[metricKey] || window.QUADRANT_METRIC_MAP.coupling;
    const showAxesLabels = options.showAxesLabels !== undefined ? options.showAxesLabels : true;
    const showAnnotationBox = options.showAnnotationBox !== undefined ? options.showAnnotationBox : true;
    const selectedBin = options.selectedBin || null;

    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 300, 240);

    const padL = showAxesLabels ? 42 : 26;
    const padR = 10;
    const padT = 10;
    const padB = showAxesLabels ? 28 : 18;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    // Dark-slate background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#131b2e";
    ctx.fillRect(padL, padT, plotW, plotH);

    const logMin = Math.log10(0.034);
    const logMax = Math.log10(5.8);
    const xToPx = dose => {
      const eff = (!dose || dose <= 0.0) ? 0.04 : dose;
      const frac = (Math.log10(eff) - logMin) / (logMax - logMin);
      return padL + Math.max(0, Math.min(1, frac)) * plotW;
    };

    const ymin = qSpec.ymin;
    const ymax = qSpec.ymax;
    const yToPx = val => {
      const frac = (val - ymin) / Math.max(1e-9, ymax - ymin);
      return padT + plotH - Math.max(-0.05, Math.min(1.05, frac)) * plotH;
    };

    // Gridlines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.8;
    const xTicks = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
    ctx.beginPath();
    for (const xt of xTicks) {
      const px = xToPx(xt);
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
    }
    for (const yt of qSpec.yticks) {
      const py = yToPx(yt);
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
    }
    ctx.stroke();

    // Shaded floor / buffered band
    if (qSpec.floorBand) {
      const yTop = yToPx(qSpec.floorBand[1]);
      const yBot = yToPx(qSpec.floorBand[0]);
      ctx.fillStyle = metricKey === "fm_pct" ? "rgba(16, 185, 129, 0.10)" : "rgba(148, 163, 184, 0.12)";
      ctx.fillRect(padL, yTop, plotW, yBot - yTop);
    }

    // Reference horizontal line
    if (qSpec.refLine !== null && qSpec.refLine !== undefined) {
      const yRef = yToPx(qSpec.refLine);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
      ctx.lineWidth = 0.9;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, yRef);
      ctx.lineTo(padL + plotW, yRef);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axis break "//" between 0 mM and 0.1 mM
    const brkX = 0.5 * (xToPx(0.0) + xToPx(0.1));
    ctx.fillStyle = "#64748b";
    ctx.font = "700 8px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("//", brkX, padT + plotH + 4);

    if (!construct) return;

    const qDict = dataSource === "cell" ? (construct.quadrants_cell || {}) : (construct.quadrants_pixel || {});
    const isClamped = Boolean(construct.is_clamped_0mM);

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    // Clamped 0–0.1 mM zone for 3x3_WT_inverse
    if (isClamped) {
      const xClampEnd = xToPx(0.14);
      ctx.fillStyle = "rgba(244, 63, 94, 0.14)";
      ctx.fillRect(padL, padT, xClampEnd - padL, plotH);
      ctx.fillStyle = "#fb7185";
      ctx.font = "700 7.5px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("0–0.1mM", 0.5 * (padL + xClampEnd), padT + plotH * 0.46);
      ctx.fillText("Clamped", 0.5 * (padL + xClampEnd), padT + plotH * 0.56);
    }

    // 1. Draw the 4 Quadrant Curves (Q1..Q4)
    for (const st of QUAD_STYLES) {
      const qData = qDict[st.code];
      if (!qData || !qData.metrics || !qData.metrics[metricKey]) continue;

      const doses = qData.doses || [];
      const mObj = qData.metrics[metricKey];
      const meds = mObj.med || [];
      const q25s = mObj.q25 || [];
      const q75s = mObj.q75 || [];
      const fit = mObj.fit || {};

      const pts = [];
      for (let i = 0; i < doses.length; i++) {
        if (meds[i] !== null && meds[i] !== undefined && Number.isFinite(meds[i])) {
          pts.push({
            dose: doses[i],
            x: xToPx(doses[i]),
            y: yToPx(meds[i]),
            y25: (q25s[i] !== null && Number.isFinite(q25s[i])) ? yToPx(q25s[i]) : yToPx(meds[i]),
            y75: (q75s[i] !== null && Number.isFinite(q75s[i])) ? yToPx(q75s[i]) : yToPx(meds[i])
          });
        }
      }
      if (pts.length === 0) continue;

      if (st.showIqr && pts.length >= 2 && !selectedBin) {
        ctx.fillStyle = st.rgbaFill;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].y75);
          else ctx.lineTo(pts[i].x, pts[i].y75);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
          ctx.lineTo(pts[i].x, pts[i].y25);
        }
        ctx.closePath();
        ctx.fill();
      }

      if (fit && fit.y0 !== null && fit.y0 !== undefined && fit.ec50 !== null && fit.ec50 !== undefined) {
        const dyMax = (fit.dy_max !== null && fit.dy_max !== undefined) ? fit.dy_max : (fit.dy || 0.0);
        const startC = isClamped ? 0.18 : 0.04;
        const nSteps = 55;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = selectedBin ? st.lw * 0.78 : st.lw;
        ctx.globalAlpha = selectedBin ? 0.65 : 0.95;
        ctx.setLineDash(st.dash);
        ctx.beginPath();
        for (let k = 0; k <= nSteps; k++) {
          const frac = k / nSteps;
          const cVal = Math.pow(10, Math.log10(startC) + frac * (Math.log10(5.2) - Math.log10(startC)));
          const effDose = (!isClamped && k === 0) ? 0.0 : cVal;
          const yVal = evalHill(effDose, fit.y0, dyMax, fit.ec50, fit.nhill);
          const px = xToPx(cVal);
          const py = yToPx(yVal);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        // Draw EC50 circle on curve if responsive
        const minSwing = metricKey === "coupling" ? 0.11 : (metricKey === "fm_pct" ? 5.5 : 0.12);
        if (Math.abs(fit.dy || 0) >= minSwing && (fit.r2 || 0) >= 0.42 && fit.ec50 >= 0.04 && fit.ec50 <= 5.0) {
          const ecY = evalHill(fit.ec50, fit.y0, dyMax, fit.ec50, fit.nhill);
          const ex = xToPx(fit.ec50);
          const ey = yToPx(ecY);
          ctx.fillStyle = "#0f172a";
          ctx.strokeStyle = st.color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(ex, ey, 3.4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      }

      for (const p of pts) {
        drawMarker(ctx, st.marker, p.x, p.y, selectedBin ? 2.2 : 2.7, st.color);
      }
    }

    // 2. If a specific 2D bin `selectedBin = { bx, by }` is clicked/selected, overlay its exact Hill curve in glowing cyan!
    let binFit = null;
    if (selectedBin && selectedBin.bx !== null && selectedBin.bx !== undefined && construct.bins_2d) {
      const binObj = construct.bins_2d.find(b => b.bx === selectedBin.bx && b.by === selectedBin.by);
      binFit = window.extractBinHillParams(binObj, metricKey);
      if (binFit && binFit.y0 !== null && binFit.y5mM !== null) {
        const startC = isClamped ? 0.18 : 0.04;
        const nSteps = 65;

        // Outer glow
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 6.0;
        ctx.beginPath();
        for (let k = 0; k <= nSteps; k++) {
          const frac = k / nSteps;
          const cVal = Math.pow(10, Math.log10(startC) + frac * (Math.log10(5.2) - Math.log10(startC)));
          const effDose = (!isClamped && k === 0) ? 0.0 : cVal;
          const yVal = evalHill(effDose, binFit.y0, binFit.dyMax, binFit.ec50, binFit.nhill);
          const px = xToPx(cVal);
          const py = yToPx(yVal);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Crisp bright cyan curve
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let k = 0; k <= nSteps; k++) {
          const frac = k / nSteps;
          const cVal = Math.pow(10, Math.log10(startC) + frac * (Math.log10(5.2) - Math.log10(startC)));
          const effDose = (!isClamped && k === 0) ? 0.0 : cVal;
          const yVal = evalHill(effDose, binFit.y0, binFit.dyMax, binFit.ec50, binFit.nhill);
          const px = xToPx(cVal);
          const py = yToPx(yVal);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Draw dose points at 0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0 mM along the bin curve
        const stdDoses = isClamped ? [0.2, 0.5, 1.0, 2.0, 5.0] : [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
        for (const dVal of stdDoses) {
          const yVal = evalHill(dVal, binFit.y0, binFit.dyMax, binFit.ec50, binFit.nhill);
          drawMarker(ctx, "diamond", xToPx(dVal), yToPx(yVal), 3.6, "#38bdf8", "#0f172a");
        }

        // Draw EC50 marker on the bin curve
        if (binFit.ec50 && binFit.ec50 >= 0.04 && binFit.ec50 <= 5.0 && (binFit.r2 || 0) >= 0.35) {
          const ecY = evalHill(binFit.ec50, binFit.y0, binFit.dyMax, binFit.ec50, binFit.nhill);
          const ex = xToPx(binFit.ec50);
          const ey = yToPx(ecY);
          ctx.fillStyle = "#fde047";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(ex, ey, 4.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore(); // end clip

    // Outer frame
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Compact annotation box in top-left
    if (showAnnotationBox) {
      const f1 = ((qDict.Q1_Slow_HiLoad || {}).metrics || {})[metricKey]?.fit || {};
      const f4 = ((qDict.Q4_Fast_LoLoad || {}).metrics || {})[metricKey]?.fit || {};
      const dec = qSpec.decimals;
      const u = qSpec.unit;
      const fmtV = v => (v !== null && v !== undefined && Number.isFinite(v)) ? v.toFixed(dec) + u : "—";
      const fmtEc = f => {
        const minSw = metricKey === "coupling" ? 0.10 : (metricKey === "fm_pct" ? 5.0 : 0.10);
        if (f && f.ec50 && Math.abs(f.dy || 0) >= minSw && (f.r2 || 0) >= 0.38) {
          return `${f.ec50.toFixed(2)}mM`;
        }
        return "flat";
      };

      const lines = [
        isClamped ? `Q1: →${fmtV(f1.y5mM)} (${fmtEc(f1)})` : `Q1: ${fmtV(f1.y0)}→${fmtV(f1.y5mM)} (${fmtEc(f1)})`,
        isClamped ? `Q4: →${fmtV(f4.y5mM)} (${fmtEc(f4)})` : `Q4: ${fmtV(f4.y0)}→${fmtV(f4.y5mM)} (${fmtEc(f4)})`
      ];
      if (selectedBin && binFit) {
        lines.push(`Bin(${selectedBin.bx},${selectedBin.by}): ${fmtV(binFit.y0)}→${fmtV(binFit.y5mM)} (${fmtEc(binFit)})`);
      }

      ctx.font = "700 8.5px 'JetBrains Mono', Consolas, monospace";
      const wBox = Math.max(...lines.map(l => ctx.measureText(l).width)) + 10;
      const hBox = lines.length * 11 + 5;
      const bx = padL + 5;
      const by = padT + 5;

      ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
      ctx.fillRect(bx, by, wBox, hBox);
      ctx.strokeStyle = selectedBin && binFit ? "#38bdf8" : "#3b4c73";
      ctx.lineWidth = 0.9;
      ctx.strokeRect(bx, by, wBox, hBox);

      ctx.textAlign = "left";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 2 ? "#38bdf8" : "#f1f5f9";
        ctx.fillText(lines[i], bx + 5, by + 10.5 + i * 11);
      }
    }

    // X and Y tick labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    const xTickLabels = ["0", "0.1", "0.2", "0.5", "1", "2", "5"];
    for (let i = 0; i < xTicks.length; i++) {
      ctx.fillText(xTickLabels[i], xToPx(xTicks[i]), padT + plotH + 11);
    }
    ctx.textAlign = "right";
    for (const yt of qSpec.yticks) {
      ctx.fillText(yt.toFixed(qSpec.decimals > 1 ? 2 : 0), padL - 4, yToPx(yt) + 3);
    }

    if (showAxesLabels) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 9px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Bt₂cAMP (mM)", padL + plotW / 2, cssH - 3);

      ctx.save();
      ctx.translate(11, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(qSpec.yLabel, 0, 0);
      ctx.restore();
    }
  };

  /**
   * Renders a dedicated Clicked-Bin (bx, by) Multi-Feature Dose-Response Plot onto a <canvas>,
   * showing how Coupling C(c), Frequency Shift ΔF(c), and Loading Fold respond across 0–5 mM Bt₂cAMP
   * inside that specific stoichiometry bin!
   */
  window.renderSingleBinMultiCurveCanvas = function(canvas, construct, bx, by) {
    if (!canvas || !construct) return;
    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 340, 220);

    const padL = 42;
    const padR = 42;
    const padT = 12;
    const padB = 28;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#131b2e";
    ctx.fillRect(padL, padT, plotW, plotH);

    const binObj = (construct.bins_2d || []).find(b => b.bx === bx && b.by === by);
    if (!binObj) {
      ctx.strokeStyle = "#475569";
      ctx.strokeRect(padL, padT, plotW, plotH);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 11px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Bin (${bx}, ${by}) is unpopulated / non-oscillating`, padL + plotW / 2, padT + plotH / 2);
      return;
    }

    const logMin = Math.log10(0.034);
    const logMax = Math.log10(5.8);
    const xToPx = dose => {
      const eff = (!dose || dose <= 0.0) ? 0.04 : dose;
      const frac = (Math.log10(eff) - logMin) / (logMax - logMin);
      return padL + Math.max(0, Math.min(1, frac)) * plotW;
    };

    // Left Y-axis: Dimensionless Coupling C(c) in [0.0, 1.15]
    const yLeftToPx = val => {
      const frac = (val - 0.0) / 1.15;
      return padT + plotH - Math.max(-0.05, Math.min(1.05, frac)) * plotH;
    };

    // Right Y-axis: % Shift (ΔF% and ΔD_amp%) in [-40%, +45%]
    const yRightToPx = val => {
      const frac = (val - (-40.0)) / 85.0;
      return padT + plotH - Math.max(-0.05, Math.min(1.05, frac)) * plotH;
    };

    // Gridlines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.8;
    const xTicks = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
    ctx.beginPath();
    for (const xt of xTicks) {
      const px = xToPx(xt);
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
    }
    for (const yt of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      const py = yLeftToPx(yt);
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
    }
    ctx.stroke();

    // 0% dashed line on right axis
    const yZeroPct = yRightToPx(0.0);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, yZeroPct);
    ctx.lineTo(padL + plotW, yZeroPct);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    const coupFit = window.extractBinHillParams(binObj, "coupling");
    const fmFit = window.extractBinHillParams(binObj, "fm_pct");
    const crFit = window.extractBinHillParams(binObj, "carrier_fold");

    const drawCurve = (fit, mapY, col, dash = [], scalePct = false) => {
      if (!fit || fit.y0 === null) return;
      const nSteps = 60;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.3;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let k = 0; k <= nSteps; k++) {
        const frac = k / nSteps;
        const cVal = Math.pow(10, Math.log10(0.04) + frac * (Math.log10(5.2) - Math.log10(0.04)));
        const effDose = k === 0 ? 0.0 : cVal;
        let yVal = evalHill(effDose, fit.y0, fit.dyMax, fit.ec50, fit.nhill);
        if (scalePct) yVal = 100.0 * (yVal - 1.0);
        const px = xToPx(cVal);
        const py = mapY(yVal);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (const dVal of [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0]) {
        let yVal = evalHill(dVal, fit.y0, fit.dyMax, fit.ec50, fit.nhill);
        if (scalePct) yVal = 100.0 * (yVal - 1.0);
        drawMarker(ctx, "circle", xToPx(dVal), mapY(yVal), 2.7, col, "#0f172a");
      }
    };

    // 1. Coupling C(c) on Left Axis (Cyan #38bdf8)
    drawCurve(coupFit, yLeftToPx, "#38bdf8", [], false);
    // 2. Frequency Shift ΔF(c)% on Right Axis (Amber #fbbf24)
    drawCurve(fmFit, yRightToPx, "#fbbf24", [], false);
    // 3. Carrier Amp Shift ΔD(c)% on Right Axis (Purple #c084fc)
    drawCurve(crFit, yRightToPx, "#c084fc", [4, 3], true);

    ctx.restore();

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Legend inside top-left
    ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
    ctx.fillRect(padL + 5, padT + 5, 175, 36);
    ctx.strokeStyle = "#3b4c73";
    ctx.strokeRect(padL + 5, padT + 5, 175, 36);
    ctx.font = "700 8.2px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`— Coupling C(c) [Left Axis]`, padL + 10, padT + 15);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`— Freq Shift ΔF% [Right Axis]`, padL + 10, padT + 26);
    ctx.fillStyle = "#c084fc";
    ctx.fillText(`-- Carrier Amp ΔD% [Right Axis]`, padL + 10, padT + 37);

    // Ticks
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    const xTickLabels = ["0", "0.1", "0.2", "0.5", "1", "2", "5"];
    for (let i = 0; i < xTicks.length; i++) {
      ctx.fillText(xTickLabels[i], xToPx(xTicks[i]), padT + plotH + 11);
    }

    // Left ticks (Cyan)
    ctx.fillStyle = "#38bdf8";
    ctx.textAlign = "right";
    for (const yt of [0.0, 0.5, 1.0]) {
      ctx.fillText(yt.toFixed(1), padL - 4, yLeftToPx(yt) + 3);
    }

    // Right ticks (Amber/Purple)
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    for (const yt of [-30, 0, 30]) {
      ctx.fillText((yt > 0 ? "+" : "") + yt + "%", padL + plotW + 4, yRightToPx(yt) + 3);
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Bin (${bx}, ${by}) Joint Dose-Response [Bt₂cAMP mM]`, padL + plotW / 2, cssH - 3);
  };
})();
