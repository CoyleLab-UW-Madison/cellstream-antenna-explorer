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
      if (binObj.coup_5mM === null || binObj.coup_5mM === undefined) return null;
      const y5 = binObj.coup_5mM;
      const dyFallback = (binObj.coup_dy !== null && binObj.coup_dy !== undefined) ? binObj.coup_dy : 0.0;
      const y0 = (binObj.coup_y0 !== null && binObj.coup_y0 !== undefined) ? binObj.coup_y0 : Math.max(0.0, y5 - dyFallback);
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

  /**
   * Extracts the empirical per-dose trace { doses, nvox, med, q25, q75 } for a specific 2D bin (bx, by)
   * and metric key ("coupling", "fm_pct", "carrier_fold", "loading_fold", "cargo_am_fold", "carrier_pct").
   */
  window.extractBinEmpiricalTrace = function(binObj, metricKey) {
    if (!binObj || !binObj.traces || !binObj.traces.d) return null;
    const tr = binObj.traces;
    const doses = tr.d;
    const nvox = tr.n || [];
    if (metricKey === "coupling" && tr.coup) {
      return { doses, nvox, med: tr.coup[0], q25: tr.coup[1], q75: tr.coup[2] };
    } else if (metricKey === "fm_pct" && tr.fm_pct) {
      return { doses, nvox, med: tr.fm_pct[0], q25: tr.fm_pct[1], q75: tr.fm_pct[2] };
    } else if (metricKey === "carrier_fold" && tr.cr_fold) {
      return { doses, nvox, med: tr.cr_fold[0], q25: tr.cr_fold[1], q75: tr.cr_fold[2] };
    } else if (metricKey === "carrier_pct" && tr.cr_fold) {
      return {
        doses,
        nvox,
        med: tr.cr_fold[0].map(v => v !== null ? 100.0 * (v - 1.0) : null),
        q25: tr.cr_fold[1].map(v => v !== null ? 100.0 * (v - 1.0) : null),
        q75: tr.cr_fold[2].map(v => v !== null ? 100.0 * (v - 1.0) : null)
      };
    } else if (metricKey === "loading_fold" && tr.load_fold) {
      return { doses, nvox, med: tr.load_fold[0], q25: tr.load_fold[1], q75: tr.load_fold[2] };
    } else if (metricKey === "cargo_am_fold" && tr.am_fold) {
      return { doses, nvox, med: tr.am_fold[0], q25: tr.am_fold[1], q75: tr.am_fold[2] };
    } else if (metricKey === "cell_territory_pct" && tr.osc_pct) {
      return { doses, nvox, med: tr.osc_pct[0], q25: tr.osc_pct[1], q75: tr.osc_pct[2] };
    }
    return null;
  };

  function drawErrorBar(ctx, x, yLowPx, yHighPx, color, alpha = 0.75, capHalfW = 2.6, lw = 1.25) {
    if (!Number.isFinite(yLowPx) || !Number.isFinite(yHighPx)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, yLowPx);
    ctx.lineTo(x, yHighPx);
    if (capHalfW > 0) {
      ctx.moveTo(x - capHalfW, yLowPx);
      ctx.lineTo(x + capHalfW, yLowPx);
      ctx.moveTo(x - capHalfW, yHighPx);
      ctx.lineTo(x + capHalfW, yHighPx);
    }
    ctx.stroke();
    ctx.restore();
  }

  function buildDynamicTicks(ymin, ymax, defaultTicks, refLine = null) {
    const span = Math.max(1e-6, ymax - ymin);
    const rawStep = span / 4.0;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    let niceStep = mag;
    if (residual > 5) niceStep = 10 * mag;
    else if (residual > 2.5) niceStep = 5 * mag;
    else if (residual > 1.5) niceStep = 2 * mag;

    const first = Math.ceil(ymin / niceStep) * niceStep;
    const ticks = [];
    for (let v = first; v <= ymax + 1e-7; v += niceStep) {
      ticks.push(Number(v.toFixed(4)));
    }
    if (refLine !== null && refLine !== undefined && refLine >= ymin && refLine <= ymax) {
      if (!ticks.some(t => Math.abs(t - refLine) < niceStep * 0.25)) {
        ticks.push(refLine);
        ticks.sort((a, b) => a - b);
      }
    }
    return ticks.length >= 2 ? ticks : defaultTicks;
  }

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
   * PLUS an optional glowing cyan curve + empirical IQR error bars for the currently clicked
   * 2D stoichiometry bin `options.selectedBin = { bx, by }`!
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

    const padL = showAxesLabels ? 44 : 28;
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

    const qDict = construct ? (dataSource === "cell" ? (construct.quadrants_cell || {}) : (construct.quadrants_pixel || {})) : {};
    const isClamped = Boolean(construct && construct.is_clamped_0mM);

    let binObj = null;
    let binFit = null;
    let binTrace = null;
    if (construct && selectedBin && selectedBin.bx !== null && selectedBin.bx !== undefined && construct.bins_2d) {
      binObj = construct.bins_2d.find(b => b.bx === selectedBin.bx && b.by === selectedBin.by) || null;
      binFit = window.extractBinHillParams(binObj, metricKey);
      binTrace = window.extractBinEmpiricalTrace(binObj, metricKey);
    }

    // Dynamic auto-expanding Y-axis bounds so no curve or error bar ever clips off-screen
    let ymin = qSpec.ymin;
    let ymax = qSpec.ymax;
    let dataMin = Infinity;
    let dataMax = -Infinity;
    const pushBound = v => {
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        if (v < dataMin) dataMin = v;
        if (v > dataMax) dataMax = v;
      }
    };

    for (const st of QUAD_STYLES) {
      const mObj = ((qDict[st.code] || {}).metrics || {})[metricKey];
      if (!mObj) continue;
      (mObj.med || []).forEach(pushBound);
      if (st.showIqr && !selectedBin) {
        (mObj.q25 || []).forEach(pushBound);
        (mObj.q75 || []).forEach(pushBound);
      }
      if (mObj.fit) {
        pushBound(mObj.fit.y0);
        pushBound(mObj.fit.y5mM);
      }
    }
    if (binFit) {
      pushBound(binFit.y0);
      pushBound(binFit.y5mM);
    }
    if (binTrace) {
      (binTrace.med || []).forEach(pushBound);
      (binTrace.q25 || []).forEach(pushBound);
      (binTrace.q75 || []).forEach(pushBound);
    }

    let boundsExpanded = false;
    const baseSpan = Math.max(1e-6, ymax - ymin);
    if (Number.isFinite(dataMax) && dataMax > ymax - 0.04 * baseSpan) {
      ymax = dataMax + 0.08 * Math.max(baseSpan, dataMax - Math.min(ymin, dataMin));
      boundsExpanded = true;
    }
    if (Number.isFinite(dataMin) && dataMin < ymin + 0.04 * baseSpan) {
      const rawNewMin = dataMin - 0.07 * Math.max(baseSpan, Math.max(ymax, dataMax) - dataMin);
      ymin = (metricKey === "coupling" || metricKey === "cell_territory_pct") ? Math.max(0.0, rawNewMin) : rawNewMin;
      boundsExpanded = true;
    }
    const yTicks = boundsExpanded ? buildDynamicTicks(ymin, ymax, qSpec.yticks, qSpec.refLine) : qSpec.yticks;

    const yToPx = val => {
      const frac = (val - ymin) / Math.max(1e-9, ymax - ymin);
      return padT + plotH - Math.max(-0.04, Math.min(1.04, frac)) * plotH;
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
    for (const yt of yTicks) {
      const py = yToPx(yt);
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
    }
    ctx.stroke();

    // Shaded floor / buffered band
    if (qSpec.floorBand) {
      const yTop = Math.max(padT, Math.min(padT + plotH, yToPx(qSpec.floorBand[1])));
      const yBot = Math.max(padT, Math.min(padT + plotH, yToPx(qSpec.floorBand[0])));
      ctx.fillStyle = metricKey === "fm_pct" ? "rgba(16, 185, 129, 0.10)" : "rgba(148, 163, 184, 0.12)";
      ctx.fillRect(padL, yTop, plotW, yBot - yTop);
    }

    // Reference horizontal line
    if (qSpec.refLine !== null && qSpec.refLine !== undefined) {
      const yRef = yToPx(qSpec.refLine);
      if (yRef >= padT && yRef <= padT + plotH) {
        ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
        ctx.lineWidth = 0.9;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, yRef);
        ctx.lineTo(padL + plotW, yRef);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Axis break "//" between 0 mM and 0.1 mM
    const brkX = 0.5 * (xToPx(0.0) + xToPx(0.1));
    ctx.fillStyle = "#64748b";
    ctx.font = "700 8px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("//", brkX, padT + plotH + 4);

    if (!construct) return;

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

        // Vertical IQR error bars on Q1 and Q4 when no single bin is selected
        for (const p of pts) {
          drawErrorBar(ctx, p.x, p.y25, p.y75, st.color, 0.55, 2.0, 1.0);
        }
      }

      if (fit && fit.y0 !== null && fit.y0 !== undefined && fit.ec50 !== null && fit.ec50 !== undefined) {
        const dyMax = (fit.dy_max !== null && fit.dy_max !== undefined) ? fit.dy_max : (fit.dy || 0.0);
        const startC = isClamped ? 0.18 : 0.04;
        const nSteps = 55;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = selectedBin ? st.lw * 0.72 : st.lw;
        ctx.globalAlpha = selectedBin ? 0.55 : 0.95;
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
        drawMarker(ctx, st.marker, p.x, p.y, selectedBin ? 2.0 : 2.7, st.color);
      }
    }

    // 2. If a specific 2D bin `selectedBin = { bx, by }` is clicked/selected, overlay its empirical IQR ribbon, error bars, and Hill curve in glowing cyan!
    if (binFit && binFit.y0 !== null && binFit.y5mM !== null) {
      const startC = isClamped ? 0.18 : 0.04;
      const nSteps = 65;

      // Collect empirical points + error bars if available
      const empPts = [];
      if (binTrace && binTrace.doses && binTrace.med) {
        for (let i = 0; i < binTrace.doses.length; i++) {
          const dVal = binTrace.doses[i];
          const mVal = binTrace.med[i];
          if (mVal === null || mVal === undefined || !Number.isFinite(mVal)) continue;
          const q25Val = (binTrace.q25 && Number.isFinite(binTrace.q25[i])) ? binTrace.q25[i] : mVal;
          const q75Val = (binTrace.q75 && Number.isFinite(binTrace.q75[i])) ? binTrace.q75[i] : mVal;
          empPts.push({
            dose: dVal,
            x: xToPx(dVal),
            y: yToPx(mVal),
            y25: yToPx(q25Val),
            y75: yToPx(q75Val)
          });
        }
      }

      // Shaded cyan IQR confidence band across empirical doses
      if (empPts.length >= 2) {
        ctx.fillStyle = "rgba(56, 189, 248, 0.17)";
        ctx.beginPath();
        for (let i = 0; i < empPts.length; i++) {
          if (i === 0) ctx.moveTo(empPts[i].x, empPts[i].y75);
          else ctx.lineTo(empPts[i].x, empPts[i].y75);
        }
        for (let i = empPts.length - 1; i >= 0; i--) {
          ctx.lineTo(empPts[i].x, empPts[i].y25);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Outer glow for Hill curve
      ctx.strokeStyle = "rgba(56, 189, 248, 0.32)";
      ctx.lineWidth = 5.5;
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

      // Crisp bright cyan Hill curve
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
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

      // Draw empirical points + vertical q25-q75 IQR error bars (or evaluated Hill points if no empirical trace)
      if (empPts.length > 0) {
        for (const ep of empPts) {
          drawErrorBar(ctx, ep.x, ep.y25, ep.y75, "#7dd3fc", 0.92, 2.8, 1.35);
          drawMarker(ctx, "diamond", ep.x, ep.y, 3.6, "#38bdf8", "#0f172a");
        }
      } else {
        const stdDoses = isClamped ? [0.2, 0.5, 1.0, 2.0, 5.0] : [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
        for (const dVal of stdDoses) {
          const yVal = evalHill(dVal, binFit.y0, binFit.dyMax, binFit.ec50, binFit.nhill);
          drawMarker(ctx, "diamond", xToPx(dVal), yToPx(yVal), 3.6, "#38bdf8", "#0f172a");
        }
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
        const nvStr = binObj && binObj.nvox ? ` [n≈${Math.round(binObj.nvox)}/d]` : "";
        lines.push(`Bin(${selectedBin.bx},${selectedBin.by}): ${fmtV(binFit.y0)}→${fmtV(binFit.y5mM)} (${fmtEc(binFit)})${nvStr}`);
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
    for (const yt of yTicks) {
      const py = yToPx(yt);
      if (py >= padT - 2 && py <= padT + plotH + 4) {
        const decDigits = qSpec.decimals > 1 ? 2 : (Math.abs(yt - Math.round(yt)) > 0.05 ? 1 : 0);
        ctx.fillText(yt.toFixed(decDigits), padL - 4, py + 3);
      }
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
   * Renders a dedicated Clicked-Bin (bx, by) Multi-Feature Co-Dosing Plot onto a <canvas>,
   * showing how Coupling C(c), Frequency Shift ΔF(c)%, and Carrier Amp ΔD(c)% co-dose across 0–5 mM Bt₂cAMP.
   *
   * Key design features:
   *  1. Shared 0 mM Baseline Origin (`yZero`): The Left Axis (Coupling C(c), starting at C₀) and Right Axis
   *     (% Shift ΔF% & ΔCarrier%, starting at 0.0%) are mathematically aligned so C₀ and 0.0% map to the
   *     EXACT same vertical pixel `yZero`! All three curves originate from the exact same spot at 0 mM.
   *  2. Empirical Points + Vertical `q25–q75` IQR Error Bars: Draws the actual per-dose medians and IQR error
   *     bars for all three metrics alongside their smooth Hill fits.
   *  3. Dynamic Dual-Axis Auto-Scaling: Automatically expands both axes around `yZero` so no curve or error
   *     bar ever clips or goes off-screen.
   */
  window.renderSingleBinMultiCurveCanvas = function(canvas, construct, bx, by) {
    if (!canvas || !construct) return;
    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 340, 220);

    const padL = 44;
    const padR = 44;
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

    const isClamped = Boolean(construct.is_clamped_0mM);
    const logMin = Math.log10(0.034);
    const logMax = Math.log10(5.8);
    const xToPx = dose => {
      const eff = (!dose || dose <= 0.0) ? 0.04 : dose;
      const frac = (Math.log10(eff) - logMin) / (logMax - logMin);
      return padL + Math.max(0, Math.min(1, frac)) * plotW;
    };

    const coupFit = window.extractBinHillParams(binObj, "coupling");
    const fmFit = window.extractBinHillParams(binObj, "fm_pct");
    const crFit = window.extractBinHillParams(binObj, "carrier_fold");
    const oscFit = isClamped ? window.extractBinHillParams(binObj, "cell_territory_pct") : null;

    const coupTr = window.extractBinEmpiricalTrace(binObj, "coupling");
    const fmTr = window.extractBinEmpiricalTrace(binObj, "fm_pct");
    const crTr = window.extractBinEmpiricalTrace(binObj, "carrier_pct");
    const oscTr = isClamped ? window.extractBinEmpiricalTrace(binObj, "cell_territory_pct") : null;

    // Baseline C0 for Coupling (so C0 on the Left Axis sits at the exact same yZero as 0.0% on the Right Axis!)
    const firstCoupEmp = (coupTr && coupTr.med) ? coupTr.med.find(v => v !== null && Number.isFinite(v)) : null;
    const c0Base = (coupFit && coupFit.y0 !== null && Number.isFinite(coupFit.y0))
      ? coupFit.y0
      : (Number.isFinite(firstCoupEmp) ? firstCoupEmp : 0.15);

    // Align empirical traces so their first active point sits on the shared baseline (preserving full dose-response excursion & IQR width)
    const alignTraceToOrigin = (tr, targetY0) => {
      if (!tr || !tr.doses || !tr.med || tr.med.length === 0) return null;
      const firstVal = tr.med.find(v => v !== null && Number.isFinite(v));
      const emp0 = Number.isFinite(firstVal) ? firstVal : targetY0;
      const shift = targetY0 - emp0;
      return {
        doses: tr.doses,
        med: tr.med.map(v => (v !== null && Number.isFinite(v)) ? v + shift : null),
        q25: (tr.q25 || []).map(v => (v !== null && Number.isFinite(v)) ? v + shift : null),
        q75: (tr.q75 || []).map(v => (v !== null && Number.isFinite(v)) ? v + shift : null)
      };
    };

    const coupTrAligned = alignTraceToOrigin(coupTr, c0Base);
    const fmTrAligned = alignTraceToOrigin(fmTr, 0.0);
    const crTrAligned = alignTraceToOrigin(crTr, 0.0);
    const oscTrAligned = oscTr ? alignTraceToOrigin(oscTr, 0.0) : null;

    // Compute maximum excursions above and below the shared origin (C0 on Left Axis, 0.0% on Right Axis)
    let leftUp = 0.45;
    let leftDown = 0.08;
    const checkLeft = val => {
      if (val === null || val === undefined || !Number.isFinite(val)) return;
      const dv = val - c0Base;
      if (dv > leftUp) leftUp = dv;
      if (-dv > leftDown) leftDown = -dv;
    };
    if (coupFit) {
      checkLeft(coupFit.y0);
      checkLeft(coupFit.y5mM);
    }
    if (coupTrAligned) {
      coupTrAligned.med.forEach(checkLeft);
      coupTrAligned.q25.forEach(checkLeft);
      coupTrAligned.q75.forEach(checkLeft);
    }

    let rightUp = 24.0;
    let rightDown = 20.0;
    const checkRight = val => {
      if (val === null || val === undefined || !Number.isFinite(val)) return;
      if (val > rightUp) rightUp = val;
      if (-val > rightDown) rightDown = -val;
    };
    if (fmFit) {
      checkRight(fmFit.y0);
      checkRight(fmFit.y5mM);
    }
    if (crFit) {
      checkRight(100.0 * ((crFit.y0 || 1.0) - 1.0));
      checkRight(100.0 * ((crFit.y5mM || 1.0) - 1.0));
    }
    if (fmTrAligned) {
      fmTrAligned.med.forEach(checkRight);
      fmTrAligned.q25.forEach(checkRight);
      fmTrAligned.q75.forEach(checkRight);
    }
    if (crTrAligned) {
      crTrAligned.med.forEach(checkRight);
      crTrAligned.q25.forEach(checkRight);
      crTrAligned.q75.forEach(checkRight);
    }
    if (oscFit) {
      checkRight(oscFit.dy);
    }
    if (oscTrAligned) {
      oscTrAligned.med.forEach(checkRight);
      oscTrAligned.q25.forEach(checkRight);
      oscTrAligned.q75.forEach(checkRight);
    }

    // Add 12% headroom so no marker or error bar cap ever touches the border
    leftUp *= 1.12;
    leftDown *= 1.12;
    rightUp *= 1.12;
    rightDown *= 1.12;

    // Choose shared vertical fraction `zeroFrac` (fraction of plotH below the shared origin line)
    const needFracLeft = leftDown / Math.max(1e-6, leftUp + leftDown);
    const needFracRight = rightDown / Math.max(1e-6, rightUp + rightDown);
    const zeroFrac = Math.max(0.24, Math.min(0.62, Math.max(needFracLeft, needFracRight)));

    const leftSpanAbove = Math.max(leftUp, leftDown * ((1.0 - zeroFrac) / zeroFrac));
    const leftSpanBelow = leftSpanAbove * (zeroFrac / (1.0 - zeroFrac));
    const leftMin = c0Base - leftSpanBelow;
    const leftMax = c0Base + leftSpanAbove;

    const rightSpanAbove = Math.max(rightUp, rightDown * ((1.0 - zeroFrac) / zeroFrac));
    const rightSpanBelow = rightSpanAbove * (zeroFrac / (1.0 - zeroFrac));
    const rightMin = -rightSpanBelow;
    const rightMax = rightSpanAbove;

    const yLeftToPx = val => {
      const frac = (val - leftMin) / Math.max(1e-9, leftMax - leftMin);
      return padT + plotH - frac * plotH;
    };
    const yRightToPx = val => {
      const frac = (val - rightMin) / Math.max(1e-9, rightMax - rightMin);
      return padT + plotH - frac * plotH;
    };

    // Shared 0 mM baseline pixel `yZero` (identical for yLeftToPx(c0Base) and yRightToPx(0.0)!)
    const yZero = yRightToPx(0.0);

    // Gridlines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.8;
    const xTicks = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
    const rightTicks = buildDynamicTicks(rightMin, rightMax, [-25, 0, 25], 0.0);
    ctx.beginPath();
    for (const xt of xTicks) {
      const px = xToPx(xt);
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
    }
    for (const rt of rightTicks) {
      const py = yRightToPx(rt);
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
    }
    ctx.stroke();

    // Highlighted shared 0 mM baseline (`C₀` on Left Axis === `0.0%` on Right Axis)
    ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(padL + plotW, yZero);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    const drawCoDosingSeries = (fit, trAligned, mapY, col, fillRgba, markerType, dash = [], scalePct = false, shiftFitToY0 = null) => {
      // 1. Empirical IQR ribbon + vertical error bars
      const pts = [];
      if (trAligned && trAligned.doses && trAligned.med) {
        for (let i = 0; i < trAligned.doses.length; i++) {
          const dVal = trAligned.doses[i];
          const mVal = trAligned.med[i];
          if (mVal === null || mVal === undefined || !Number.isFinite(mVal)) continue;
          const q25Val = (trAligned.q25 && Number.isFinite(trAligned.q25[i])) ? trAligned.q25[i] : mVal;
          const q75Val = (trAligned.q75 && Number.isFinite(trAligned.q75[i])) ? trAligned.q75[i] : mVal;
          pts.push({
            dose: dVal,
            x: xToPx(dVal),
            y: mapY(mVal),
            y25: mapY(q25Val),
            y75: mapY(q75Val)
          });
        }
      }

      if (pts.length >= 2) {
        ctx.fillStyle = fillRgba;
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

      // 2. Smooth Hill fit curve starting from the exact shared origin at 0 mM
      if (fit && fit.y0 !== null && fit.y0 !== undefined) {
        const startC = isClamped ? 0.18 : 0.04;
        const nSteps = 60;
        const baseY0 = shiftFitToY0 !== null ? shiftFitToY0 : fit.y0;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.25;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let k = 0; k <= nSteps; k++) {
          const frac = k / nSteps;
          const cVal = Math.pow(10, Math.log10(startC) + frac * (Math.log10(5.2) - Math.log10(startC)));
          const effDose = (!isClamped && k === 0) ? 0.0 : cVal;
          let yVal = evalHill(effDose, baseY0, fit.dyMax, fit.ec50, fit.nhill);
          if (scalePct) yVal = 100.0 * (yVal - 1.0);
          const px = xToPx(cVal);
          const py = mapY(yVal);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 3. Draw vertical IQR error bars + empirical markers
      if (pts.length > 0) {
        for (const p of pts) {
          drawErrorBar(ctx, p.x, p.y25, p.y75, col, 0.78, 2.3, 1.15);
          drawMarker(ctx, markerType, p.x, p.y, 2.8, col, "#0f172a");
        }
      } else if (fit && fit.y0 !== null) {
        const baseY0 = shiftFitToY0 !== null ? shiftFitToY0 : fit.y0;
        const stdDoses = isClamped ? [0.2, 0.5, 1.0, 2.0, 5.0] : [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
        for (const dVal of stdDoses) {
          let yVal = evalHill(dVal, baseY0, fit.dyMax, fit.ec50, fit.nhill);
          if (scalePct) yVal = 100.0 * (yVal - 1.0);
          drawMarker(ctx, markerType, xToPx(dVal), mapY(yVal), 2.8, col, "#0f172a");
        }
      }
    };

    // 0. If 0mM-clamped (3x3 WT Inverse), also draw Wave Awakening ΔOsc(c)% on Right Axis (Teal #2dd4bf)
    if (isClamped && (oscFit || oscTrAligned)) {
      drawCoDosingSeries(oscFit, oscTrAligned, yRightToPx, "#2dd4bf", "rgba(45, 212, 191, 0.13)", "diamond", [2, 2], false, 0.0);
    }
    // 1. Carrier Amp Shift ΔD(c)% on Right Axis (Purple #c084fc)
    drawCoDosingSeries(crFit, crTrAligned, yRightToPx, "#c084fc", "rgba(192, 132, 252, 0.11)", "square", [4, 3], true, 1.0);
    // 2. Frequency Shift ΔF(c)% on Right Axis (Amber #fbbf24)
    drawCoDosingSeries(fmFit, fmTrAligned, yRightToPx, "#fbbf24", "rgba(251, 191, 36, 0.11)", "triangle", [], false, 0.0);
    // 3. Coupling C(c) on Left Axis (Cyan #38bdf8, anchored at c0Base === yZero)
    drawCoDosingSeries(coupFit, coupTrAligned, yLeftToPx, "#38bdf8", "rgba(56, 189, 248, 0.14)", "circle", [], false, c0Base);

    // Draw shared origin bullseye at (0 mM, yZero) so the co-dosing anchor is visually unmistakable
    if (!isClamped) {
      const x0 = xToPx(0.0);
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x0, yZero, 3.8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Legend inside top-left with exact C0 -> C5mM and % values
    const c5Str = (coupFit && Number.isFinite(coupFit.y5mM)) ? `${c0Base.toFixed(2)}→${coupFit.y5mM.toFixed(2)}` : `C₀=${c0Base.toFixed(2)}`;
    const fmStr = (fmFit && Number.isFinite(fmFit.y5mM)) ? `${fmFit.y5mM >= 0 ? "+" : ""}${fmFit.y5mM.toFixed(1)}%` : "—";
    const crPct5 = (crFit && Number.isFinite(crFit.y5mM)) ? 100.0 * (crFit.y5mM - 1.0) : null;
    const crStr = crPct5 !== null ? `${crPct5 >= 0 ? "+" : ""}${crPct5.toFixed(1)}%` : "—";
    const oscStr = (oscFit && Number.isFinite(oscFit.dy)) ? `${oscFit.dy >= 0 ? "+" : ""}${oscFit.dy.toFixed(1)}%` : "—";

    const legLines = [
      { col: "#38bdf8", text: `● Coupling C(c): ${c5Str} [L]` },
      { col: "#fbbf24", text: `▲ Freq Shift ΔF: ${fmStr} [R]` },
      { col: "#c084fc", text: `■ Carrier ΔD_amp: ${crStr} [R]` }
    ];
    if (isClamped && (oscFit || oscTrAligned)) {
      legLines.push({ col: "#2dd4bf", text: `◆ Awakening ΔOsc: ${oscStr} [R]` });
    }
    ctx.font = "700 8.0px 'JetBrains Mono', Consolas, monospace";
    const legW = Math.max(...legLines.map(l => ctx.measureText(l.text).width)) + 10;
    const legH = legLines.length * 10.5 + 4.5;
    ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
    ctx.fillRect(padL + 4, padT + 4, legW, legH);
    ctx.strokeStyle = "#3b4c73";
    ctx.strokeRect(padL + 4, padT + 4, legW, legH);
    ctx.textAlign = "left";
    for (let i = 0; i < legLines.length; i++) {
      ctx.fillStyle = legLines[i].col;
      ctx.fillText(legLines[i].text, padL + 9, padT + 14 + i * 10.5);
    }

    // X Ticks
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textAlign = "center";
    const xTickLabels = ["0", "0.1", "0.2", "0.5", "1", "2", "5"];
    for (let i = 0; i < xTicks.length; i++) {
      ctx.fillText(xTickLabels[i], xToPx(xTicks[i]), padT + plotH + 11);
    }

    // Left Axis Ticks (Cyan: Coupling C(c) aligned at C0)
    ctx.fillStyle = "#38bdf8";
    ctx.textAlign = "right";
    const leftTicks = [
      c0Base,
      c0Base + 0.5 * leftSpanAbove,
      c0Base + 0.9 * leftSpanAbove
    ];
    if (leftSpanBelow >= 0.15) {
      leftTicks.unshift(Math.max(0.0, c0Base - 0.65 * leftSpanBelow));
    }
    for (const lt of leftTicks) {
      const py = yLeftToPx(lt);
      if (py >= padT + 4 && py <= padT + plotH - 2) {
        ctx.fillText(lt.toFixed(2), padL - 4, py + 3);
      }
    }

    // Right Axis Ticks (Amber/Purple: % Shift ΔF% & ΔCarrier% aligned at 0%)
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    for (const rt of rightTicks) {
      const py = yRightToPx(rt);
      if (py >= padT + 4 && py <= padT + plotH - 2) {
        const lbl = (rt > 0 ? "+" : "") + Math.round(rt) + "%";
        ctx.fillText(lbl, padL + plotW + 4, py + 3);
      }
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Bin (${bx}, ${by}) Co-Dosing [Shared 0mM Origin · IQR Bars]`, padL + plotW / 2, cssH - 3);
  };
})();
