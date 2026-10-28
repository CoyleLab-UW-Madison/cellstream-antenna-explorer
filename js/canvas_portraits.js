/**
 * canvas_portraits.js
 * High-DPI HTML5 Canvas renderer for 10x10 Intrinsic 2D Stoichiometry Phase Portraits,
 * styled for the dark-slate H9 Physiology Atlas aesthetic.
 * Includes VSUP R²-confidence shrinkage, 4-connected component filtering, contiguous
 * regime boundary contour drawing, interactive hover/click inspection, and Pairwise Δ(A−B) maps.
 */

(function() {
  const NX = 10;
  const NY = 10;

  /**
   * Lock CSS logical dimensions so High-DPI scaling (canvas.width = cssW * dpr)
   * NEVER causes the canvas element to grow on subsequent re-renders!
   */
  function setupHiDPICanvas(canvas, defaultW = 260, defaultH = 230) {
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

  /**
   * Connected-component filter on a 10x10 boolean mask (keeps components >= minSize).
   */
  function filterConnectedComponents(mask, minSize = 3) {
    const visited = Array.from({ length: NY }, () => Array(NX).fill(false));
    const clean = Array.from({ length: NY }, () => Array(NX).fill(false));

    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        if (mask[iy][ix] && !visited[iy][ix]) {
          const queue = [[iy, ix]];
          visited[iy][ix] = true;
          const comp = [];
          while (queue.length > 0) {
            const [cy, cx] = queue.shift();
            comp.push([cy, cx]);
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dy, dx] of dirs) {
              const ny = cy + dy;
              const nx = cx + dx;
              if (ny >= 0 && ny < NY && nx >= 0 && nx < NX && mask[ny][nx] && !visited[ny][nx]) {
                visited[ny][nx] = true;
                queue.push([ny, nx]);
              }
            }
          }
          if (comp.length >= minSize) {
            for (const [cy, cx] of comp) {
              clean[cy][cx] = true;
            }
          }
        }
      }
    }
    return clean;
  }

  /**
   * Computes spatial support confidence weight w_conf[iy][ix] matching `refine_hill_montage_visuals.py`.
   */
  function computeSpatialConfidence(gridVal, gridR2, gridNvox, neutralVal, r2Min = 0.18, r2Full = 0.60) {
    const wConf = Array.from({ length: NY }, () => Array(NX).fill(0.0));
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const v = gridVal[iy][ix];
        if (v === null || !Number.isFinite(v)) continue;
        const r2 = (gridR2[iy][ix] !== null && Number.isFinite(gridR2[iy][ix])) ? gridR2[iy][ix] : 0.0;
        const nvox = (gridNvox[iy][ix] !== null && Number.isFinite(gridNvox[iy][ix])) ? gridNvox[iy][ix] : 1.0;

        const wR2 = Math.max(0.0, Math.min(1.0, (r2 - r2Min) / Math.max(1e-6, r2Full - r2Min)));
        const wVox = Math.max(0.12, Math.min(1.0, (nvox - 1.5) / 4.0));

        const delta = v - neutralVal;
        let wSpatial = 1.0;
        if (Math.abs(delta) > 1e-6) {
          let sameSignGood = 0;
          for (let ny = Math.max(0, iy - 1); ny <= Math.min(NY - 1, iy + 1); ny++) {
            for (let nx = Math.max(0, ix - 1); nx <= Math.min(NX - 1, ix + 1); nx++) {
              if (ny === iy && nx === ix) continue;
              const nbV = gridVal[ny][nx];
              const nbR2 = (gridR2[ny][nx] !== null && Number.isFinite(gridR2[ny][nx])) ? gridR2[ny][nx] : 0.0;
              if (nbV !== null && Number.isFinite(nbV) && ((nbV - neutralVal) * Math.sign(delta) > 0) && nbR2 >= r2Min) {
                sameSignGood++;
              }
            }
          }
          wSpatial = Math.max(0.25, Math.min(1.0, (sameSignGood + 0.5) / 2.5));
        }
        wConf[iy][ix] = wR2 * wVox * wSpatial;
      }
    }
    return wConf;
  }

  /**
   * Builds 10x10 2D arrays [iy][ix] (where iy=0 is bottom row, iy=9 is top row) from construct.bins_2d.
   */
  window.buildConstructGrids = function(construct, metricSpec) {
    const gridVal = Array.from({ length: NY }, () => Array(NX).fill(null));
    const gridR2 = Array.from({ length: NY }, () => Array(NX).fill(null));
    const gridNvox = Array.from({ length: NY }, () => Array(NX).fill(null));
    const gridBins = Array.from({ length: NY }, () => Array(NX).fill(null));

    if (!construct || !construct.bins_2d) {
      return { gridVal, gridR2, gridNvox, gridBins };
    }

    for (const b of construct.bins_2d) {
      const ix = b.bx;
      const iy = b.by;
      if (ix < 0 || ix >= NX || iy < 0 || iy >= NY) continue;
      gridBins[iy][ix] = b;
      gridVal[iy][ix] = b[metricSpec.key] !== undefined ? b[metricSpec.key] : null;
      gridNvox[iy][ix] = b.nvox !== undefined && b.nvox !== null ? b.nvox : 5.0;

      if (metricSpec.isBasalC0) {
        const c0 = b.coup_y0;
        gridR2[iy][ix] = (c0 !== null && c0 !== undefined) ? (c0 >= 0.18 ? 0.95 : 0.35) : null;
      } else if (metricSpec.isEc50 && metricSpec.gain_key) {
        const gainVal = b[metricSpec.gain_key] || 0.0;
        const rawR2 = b[metricSpec.r2_key] || 0.0;
        gridR2[iy][ix] = (gainVal >= (metricSpec.gain_min || 0.10) && rawR2 >= metricSpec.activeR2Thresh) ? rawR2 : 0.0;
      } else {
        gridR2[iy][ix] = b[metricSpec.r2_key] !== undefined ? b[metricSpec.r2_key] : 0.9;
      }
    }
    return { gridVal, gridR2, gridNvox, gridBins };
  };

  /**
   * Renders a 2D Phase Portrait onto a <canvas> element.
   */
  window.renderPhasePortraitCanvas = function(canvas, construct, metricSpec, options = {}) {
    if (!canvas || !metricSpec) return { activeBins: 0, q1Med: null, q4Med: null };

    const showContour = options.showContour !== undefined ? options.showContour : true;
    const confidenceMode = options.confidenceMode || (showContour ? "vsup_contour" : "vsup_only");
    const showAxesLabels = options.showAxesLabels !== undefined ? options.showAxesLabels : true;
    const showSummaryBadge = options.showSummaryBadge !== undefined ? options.showSummaryBadge : true;

    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 260, 230);

    const padL = showAxesLabels ? 36 : 8;
    const padR = 8;
    const padT = 8;
    const padB = showAxesLabels ? 26 : 8;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const cellW = plotW / NX;
    const cellH = plotH / NY;

    // Dark-slate background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cssW, cssH);

    // Unpopulated bin background
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(padL, padT, plotW, plotH);

    if (!construct || !construct.bins_2d || construct.bins_2d.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 11px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Clamped at 0 mM (See 4-Quad Curve)", padL + plotW / 2, padT + plotH / 2);
      return { activeBins: 0, q1Med: null, q4Med: null };
    }

    const { gridVal, gridR2, gridNvox, gridBins } = window.buildConstructGrids(construct, metricSpec);
    const wConf = computeSpatialConfidence(gridVal, gridR2, gridNvox, metricSpec.neutralVal, 0.18, 0.60);
    const activeMask = Array.from({ length: NY }, () => Array(NX).fill(false));

    const q1Vals = [];
    const q4Vals = [];

    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const v = gridVal[iy][ix];
        const r2 = gridR2[iy][ix];
        const nvox = gridNvox[iy][ix];
        const drawX = padL + ix * cellW;
        const drawY = padT + (NY - 1 - iy) * cellH;

        if (v === null || !Number.isFinite(v)) {
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(drawX, drawY, Math.ceil(cellW), Math.ceil(cellH));
          continue;
        }

        const r2Clean = (r2 !== null && Number.isFinite(r2)) ? r2 : 0.0;
        if (!metricSpec.isEc50 || r2Clean >= metricSpec.activeR2Thresh) {
          if (ix < 5 && iy >= 5) q1Vals.push(v);
          if (ix >= 5 && iy < 5) q4Vals.push(v);
        }

        let rgb = [45, 55, 72];
        if (confidenceMode === "raw") {
          const t = window.normalizeValue(v, metricSpec.vmin, metricSpec.vmax, metricSpec.vcenter);
          rgb = window.sampleColormap(metricSpec.cmap, t);
          if (r2Clean >= metricSpec.activeR2Thresh) activeMask[iy][ix] = true;
        } else if (metricSpec.isEc50) {
          if (r2Clean >= metricSpec.activeR2Thresh) {
            const t = window.normalizeValue(v, metricSpec.vmin, metricSpec.vmax, metricSpec.vcenter);
            rgb = window.sampleColormap(metricSpec.cmap, t);
            activeMask[iy][ix] = true;
          } else {
            rgb = [42, 52, 70];
          }
        } else if (metricSpec.activeAmpThresh <= 0.0) {
          const t = window.normalizeValue(v, metricSpec.vmin, metricSpec.vmax, metricSpec.vcenter);
          const baseRgb = window.sampleColormap(metricSpec.cmap, t);
          if (r2Clean >= metricSpec.activeR2Thresh) {
            rgb = baseRgb;
            activeMask[iy][ix] = true;
          } else {
            const w = Math.max(0.32, Math.min(1.0, r2Clean / Math.max(1e-6, metricSpec.activeR2Thresh)));
            rgb = [
              Math.round(w * baseRgb[0] + (1 - w) * 45),
              Math.round(w * baseRgb[1] + (1 - w) * 55),
              Math.round(w * baseRgb[2] + (1 - w) * 72)
            ];
          }
        } else {
          // VSUP shrinkage toward neutralVal
          const wc = wConf[iy][ix];
          const delta = v - metricSpec.neutralVal;
          const vSupp = metricSpec.neutralVal + delta * (0.06 + 0.94 * wc);
          const t = window.normalizeValue(vSupp, metricSpec.vmin, metricSpec.vmax, metricSpec.vcenter);
          const baseRgb = window.sampleColormap(metricSpec.cmap, t);
          rgb = baseRgb;
          if (Math.abs(delta) >= metricSpec.activeAmpThresh && wc < 0.22) {
            const gb = Math.max(0.0, Math.min(1.0, (0.22 - wc) / 0.22)) * 0.35;
            rgb = [
              Math.round((1 - gb) * baseRgb[0] + gb * 60),
              Math.round((1 - gb) * baseRgb[1] + gb * 70),
              Math.round((1 - gb) * baseRgb[2] + gb * 85)
            ];
          }
          if (r2Clean >= metricSpec.activeR2Thresh && nvox >= 3.0 && Math.abs(delta) >= metricSpec.activeAmpThresh && wc >= 0.38) {
            activeMask[iy][ix] = true;
          }
        }

        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(drawX, drawY, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // Draw contiguous high-confidence regime contour if enabled
    const minComp = metricSpec.isEc50 ? 2 : 3;
    const cleanMask = filterConnectedComponents(activeMask, minComp);
    let activeBinCount = 0;
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        if (cleanMask[iy][ix]) activeBinCount++;
      }
    }

    if (showContour && confidenceMode === "vsup_contour") {
      ctx.beginPath();
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          if (!cleanMask[iy][ix]) continue;
          const x0 = padL + ix * cellW;
          const x1 = x0 + cellW;
          const yTop = padT + (NY - 1 - iy) * cellH;
          const yBot = yTop + cellH;

          if (iy === 0 || !cleanMask[iy - 1][ix]) {
            ctx.moveTo(x0, yBot);
            ctx.lineTo(x1, yBot);
          }
          if (iy === NY - 1 || !cleanMask[iy + 1][ix]) {
            ctx.moveTo(x0, yTop);
            ctx.lineTo(x1, yTop);
          }
          if (ix === 0 || !cleanMask[iy][ix - 1]) {
            ctx.moveTo(x0, yTop);
            ctx.lineTo(x0, yBot);
          }
          if (ix === NX - 1 || !cleanMask[iy][ix + 1]) {
            ctx.moveTo(x1, yTop);
            ctx.lineTo(x1, yBot);
          }
        }
      }
      // Subtle outer white halo + inner jet-black contour so it pops on both dark & bright colormaps
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Draw Quadrant Crosshairs (x = 0 at ix=5, y = 0 at iy=5)
    ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL + 5 * cellW, padT);
    ctx.lineTo(padL + 5 * cellW, padT + plotH);
    ctx.moveTo(padL, padT + 5 * cellH);
    ctx.lineTo(padL + plotW, padT + 5 * cellH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Highlight selected bin or quadrant if requested
    if (options.highlightBin && options.highlightBin.bx !== null && options.highlightBin.bx !== undefined) {
      const hbx = options.highlightBin.bx;
      const hby = options.highlightBin.by;
      const hx = padL + hbx * cellW;
      const hy = padT + (NY - 1 - hby) * cellH;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3.4;
      ctx.strokeRect(hx + 0.5, hy + 0.5, cellW - 1, cellH - 1);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.0;
      ctx.strokeRect(hx + 0.5, hy + 0.5, cellW - 1, cellH - 1);
    }
    if (options.highlightQuadrant) {
      const qMap = {
        Q1_Slow_HiLoad: [0, 0, 5, 5],
        Q2_Fast_HiLoad: [5, 0, 5, 5],
        Q3_Slow_LoLoad: [0, 5, 5, 5],
        Q4_Fast_LoLoad: [5, 5, 5, 5]
      };
      const qr = qMap[options.highlightQuadrant];
      if (qr) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.strokeRect(padL + qr[0] * cellW + 1, padT + qr[1] * cellH + 1, qr[2] * cellW - 2, qr[3] * cellH - 2);
      }
    }

    // Outer frame
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Compute Q1 and Q4 medians
    const medianArr = arr => {
      if (!arr || arr.length === 0) return null;
      const s = arr.slice().sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
    };
    const q1Med = medianArr(q1Vals);
    const q4Med = medianArr(q4Vals);

    // Draw Summary Badge at bottom-right inside plot
    if (showSummaryBadge) {
      const fmt = v => (v === null ? "—" : v.toFixed(metricSpec.decimals) + metricSpec.unit);
      const badgeTxt = `Q1:${fmt(q1Med)} | Q4:${fmt(q4Med)}`;
      ctx.font = "700 9.2px 'JetBrains Mono', Consolas, monospace";
      const tw = ctx.measureText(badgeTxt).width + 10;
      const bx = padL + plotW - tw - 4;
      const by = padT + plotH - 18;
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.fillRect(bx, by, tw, 15);
      ctx.strokeStyle = "#3b4c73";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by, tw, 15);
      ctx.fillStyle = "#f1f5f9";
      ctx.textAlign = "left";
      ctx.fillText(badgeTxt, bx + 5, by + 10.8);
    }

    // Axes ticks & labels (dynamically adapted to active 2D projection space)
    if (showAxesLabels) {
      const pSpec = options.projectionSpec || window.ACTIVE_PROJECTION_SPEC || {};
      const xTicks = pSpec.x_ticks || ["-0.3", "0.0", "+0.3"];
      const yTicks = pSpec.y_ticks || ["+0.3", "0.0", "-0.3"];
      const xAxisLbl = pSpec.x_canvas_label || "Δlog₁₀(MinE/MinD) [Slow → Fast]";
      const yAxisLbl = pSpec.y_canvas_label || "Δlog₁₀(Cargo/D_amp)";

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(xTicks[0], padL + 0.8 * cellW, padT + plotH + 11);
      ctx.fillText(xTicks[1], padL + 5.0 * cellW, padT + plotH + 11);
      ctx.fillText(xTicks[2], padL + 9.2 * cellW, padT + plotH + 11);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 8.8px Inter, Arial, sans-serif";
      ctx.fillText(xAxisLbl, padL + plotW / 2, cssH - 3);

      ctx.save();
      ctx.translate(10, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(yAxisLbl, 0, 0);
      ctx.restore();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 8.2px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "right";
      ctx.fillText(yTicks[0], padL - 3, padT + 1.1 * cellH);
      ctx.fillText(yTicks[1], padL - 3, padT + 5.2 * cellH);
      ctx.fillText(yTicks[2], padL - 3, padT + 9.5 * cellH);
    }

    // Store geometry metadata on canvas for interactive mouse hover/click
    canvas._portraitMeta = {
      padL, padR, padT, padB, plotW, plotH, cellW, cellH,
      construct, metricSpec, gridBins, gridVal, gridR2, cleanMask
    };

    return { activeBins: activeBinCount, q1Med, q4Med };
  };

  /**
   * Renders a Difference Phase Portrait Δ(Circuit A − Circuit B) onto a <canvas>.
   */
  window.renderDifferencePortraitCanvas = function(canvas, constructA, constructB, metricSpec, options = {}) {
    if (!canvas || !constructA || !constructB || !metricSpec) return;

    const showAxesLabels = options.showAxesLabels !== undefined ? options.showAxesLabels : true;
    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 260, 230);

    const padL = showAxesLabels ? 36 : 8;
    const padR = 8;
    const padT = 8;
    const padB = showAxesLabels ? 26 : 8;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const cellW = plotW / NX;
    const cellH = plotH / NY;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(padL, padT, plotW, plotH);

    const gA = window.buildConstructGrids(constructA, metricSpec);
    const gB = window.buildConstructGrids(constructB, metricSpec);
    const maxSpan = Math.max(0.25, 0.65 * (metricSpec.vmax - metricSpec.vmin));

    const q1Diffs = [];
    const q4Diffs = [];

    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const vA = gA.gridVal[iy][ix];
        const vB = gB.gridVal[iy][ix];
        const drawX = padL + ix * cellW;
        const drawY = padT + (NY - 1 - iy) * cellH;

        if (vA === null || vB === null || !Number.isFinite(vA) || !Number.isFinite(vB)) {
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(drawX, drawY, Math.ceil(cellW), Math.ceil(cellH));
          continue;
        }
        const diff = vA - vB;
        if (ix < 5 && iy >= 5) q1Diffs.push(diff);
        if (ix >= 5 && iy < 5) q4Diffs.push(diff);

        const t = window.normalizeValue(diff, -maxSpan, maxSpan, 0.0);
        const rgb = window.sampleColormap("RdBu_r", t);
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(drawX, drawY, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // Crosshairs
    ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL + 5 * cellW, padT);
    ctx.lineTo(padL + 5 * cellW, padT + plotH);
    ctx.moveTo(padL, padT + 5 * cellH);
    ctx.lineTo(padL + plotW, padT + 5 * cellH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    const medianArr = arr => {
      if (!arr || arr.length === 0) return null;
      const s = arr.slice().sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
    };
    const q1D = medianArr(q1Diffs);
    const q4D = medianArr(q4Diffs);
    const fmt = v => (v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(metricSpec.decimals) + metricSpec.unit);
    const badgeTxt = `ΔQ1:${fmt(q1D)} | ΔQ4:${fmt(q4D)}`;
    ctx.font = "700 9.2px 'JetBrains Mono', Consolas, monospace";
    const tw = ctx.measureText(badgeTxt).width + 10;
    const bx = padL + plotW - tw - 4;
    const by = padT + plotH - 18;
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.fillRect(bx, by, tw, 15);
    ctx.strokeStyle = "#3b4c73";
    ctx.strokeRect(bx, by, tw, 15);
    ctx.fillStyle = "#f1f5f9";
    ctx.textAlign = "left";
    ctx.fillText(badgeTxt, bx + 5, by + 10.8);

    if (showAxesLabels) {
      const pSpec = options.projectionSpec || window.ACTIVE_PROJECTION_SPEC || {};
      const xTicks = pSpec.x_ticks || ["-0.3", "0.0", "+0.3"];
      const yTicks = pSpec.y_ticks || ["+0.3", "0.0", "-0.3"];
      const xAxisLbl = pSpec.x_canvas_label || "Δlog₁₀(MinE/MinD) [Slow → Fast]";
      const yAxisLbl = pSpec.y_canvas_label || "Δlog₁₀(Cargo/D_amp)";

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 8.5px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(xTicks[0], padL + 0.8 * cellW, padT + plotH + 11);
      ctx.fillText(xTicks[1], padL + 5.0 * cellW, padT + plotH + 11);
      ctx.fillText(xTicks[2], padL + 9.2 * cellW, padT + plotH + 11);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 8.8px Inter, Arial, sans-serif";
      ctx.fillText(xAxisLbl, padL + plotW / 2, cssH - 3);

      ctx.save();
      ctx.translate(10, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(yAxisLbl, 0, 0);
      ctx.restore();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 8.2px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "right";
      ctx.fillText(yTicks[0], padL - 3, padT + 1.1 * cellH);
      ctx.fillText(yTicks[1], padL - 3, padT + 5.2 * cellH);
      ctx.fillText(yTicks[2], padL - 3, padT + 9.5 * cellH);
    }
  };

  /**
   * Renders a horizontal Colorbar legend onto a <canvas>.
   */
  window.renderColorbarCanvas = function(canvas, metricSpec) {
    if (!canvas || !metricSpec) return;
    const { ctx, cssW, cssH } = setupHiDPICanvas(canvas, 250, 32);

    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, cssW, cssH);

    const padX = 16;
    const barW = cssW - 2 * padX;
    const barH = 10;
    const barY = 4;

    for (let i = 0; i < barW; i++) {
      const t = i / Math.max(1, barW - 1);
      const rgb = window.sampleColormap(metricSpec.cmap, t);
      ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      ctx.fillRect(padX + i, barY, 1.5, barH);
    }
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(padX, barY, barW, barH);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9px 'JetBrains Mono', Consolas, monospace";
    const midVal = metricSpec.vcenter !== null ? metricSpec.vcenter : 0.5 * (metricSpec.vmin + metricSpec.vmax);
    ctx.textAlign = "left";
    ctx.fillText(metricSpec.vmin.toFixed(metricSpec.decimals) + metricSpec.unit, padX, barY + barH + 11);
    ctx.textAlign = "center";
    ctx.fillText(midVal.toFixed(metricSpec.decimals) + metricSpec.unit, padX + barW / 2, barY + barH + 11);
    ctx.textAlign = "right";
    ctx.fillText(metricSpec.vmax.toFixed(metricSpec.decimals) + metricSpec.unit, padX + barW, barY + barH + 11);
  };

  /**
   * Attaches hover tooltip and click handler to a phase portrait <canvas> (idempotent).
   */
  window.attachPortraitInteractivity = function(canvas, onBinHover, onBinClick) {
    if (!canvas) return;
    canvas._onBinHover = onBinHover;
    canvas._onBinClick = onBinClick;

    if (canvas._listenersAttached) return;
    canvas._listenersAttached = true;

    canvas.addEventListener("mousemove", e => {
      const meta = canvas._portraitMeta;
      if (!meta || !canvas._onBinHover) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ix = Math.floor((mx - meta.padL) / meta.cellW);
      const iy = NY - 1 - Math.floor((my - meta.padT) / meta.cellH);
      if (ix >= 0 && ix < NX && iy >= 0 && iy < NY) {
        const binObj = meta.gridBins[iy][ix];
        const inCore = meta.cleanMask[iy][ix];
        canvas._onBinHover(e, { bx: ix, by: iy, bin: binObj, inCore, construct: meta.construct, metricSpec: meta.metricSpec });
      } else {
        canvas._onBinHover(e, null);
      }
    });

    canvas.addEventListener("mouseleave", e => {
      if (canvas._onBinHover) canvas._onBinHover(e, null);
    });

    canvas.addEventListener("click", e => {
      const meta = canvas._portraitMeta;
      if (!meta || !canvas._onBinClick) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ix = Math.floor((mx - meta.padL) / meta.cellW);
      const iy = NY - 1 - Math.floor((my - meta.padT) / meta.cellH);
      if (ix >= 0 && ix < NX && iy >= 0 && iy < NY) {
        const qName = ix < 5 ? (iy >= 5 ? "Q1_Slow_HiLoad" : "Q3_Slow_LoLoad") : (iy >= 5 ? "Q2_Fast_HiLoad" : "Q4_Fast_LoLoad");
        canvas._onBinClick({ bx: ix, by: iy, quadrant: qName, bin: meta.gridBins[iy][ix], construct: meta.construct, metricSpec: meta.metricSpec });
      }
    });
  };
})();
