/**
 * app.js
 * Main controller for the Cellstream Antenna-Circuit Explorer (Dark-Slate H9 Atlas Edition).
 * Modes:
 *   1. Single-Circuit Inspector ("single")
 *   2. 3×3 Family Explorer ("family3x3")
 *   3. Full 4×(3×3) Library ("library6x6")
 *   4. Side-by-Side Comparator ("pairwise")
 *   5. Target Response Finder ("target")
 *   6. Sortable 38-Construct Table ("table")
 */

(function() {
  const DATA = window.ANTENNA_LIBRARY_DATA;
  if (!DATA || !DATA.constructs) {
    console.error("ANTENNA_LIBRARY_DATA failed to load.");
    return;
  }

  const CONSTRUCTS = DATA.constructs;

  const FAMILIES = [
    { id: "WT_upright",   mutation: "WT",    topology: "upright", label: "WT Upright",   pillClass: "fam-wt-upr",   badgeClass: "badge-wt-upr",   subtitle: "FHA1(WT) on MinD Carrier | PKAsub on Diffusive Cargo" },
    { id: "WT_inverse",   mutation: "WT",    topology: "inverse", label: "WT Inverse",   pillClass: "fam-wt-inv",   badgeClass: "badge-wt-inv",   subtitle: "PKAsub on MinD Carrier | FHA1(WT) on Diffusive Cargo" },
    { id: "R70A_upright", mutation: "R70A",  topology: "upright", label: "R70A Upright", pillClass: "fam-r70a-upr", badgeClass: "badge-r70a-upr", subtitle: "FHA1(R70A) Weak Reader on MinD | PKAsub on Cargo" },
    { id: "R70A_inverse", mutation: "R70A",  topology: "inverse", label: "R70A Inverse", pillClass: "fam-r70a-inv", badgeClass: "badge-r70a-inv", subtitle: "PKAsub on MinD Carrier | FHA1(R70A) Weak Reader on Cargo" },
    { id: "TAmut_ctrl",   mutation: "TAmut", topology: "inverse", label: "T→A Controls", pillClass: "fam-tamut",    badgeClass: "badge-tamut",    subtitle: "Non-Phosphorylatable PKAsub(T→A) Negative Controls (1×1 & 2×2 Inverse)" }
  ];

  const VALENCIES_9 = ["1x1", "1x2", "1x3", "2x1", "2x2", "2x3", "3x1", "3x2", "3x3"];
  const VALENCY_GRID = [
    ["1x1", "1x2", "1x3"],
    ["2x1", "2x2", "2x3"],
    ["3x1", "3x2", "3x3"]
  ];

  const state = {
    mode: "single",                 // "single" | "family3x3" | "library6x6" | "pairwise" | "target" | "table"
    familyId: "WT_upright",
    valency: "2x2",
    selectedCircuitA: "2x2_WT_upright",
    selectedCircuitB: "2x2_WT_inverse",

    // Display & Focus state (modeled after H9_FOV_Physiology_Atlas_Viewer.html)
    focus: "all_portraits",         // "all_portraits" | "all_quads" | "pair_metrics" | "m_coup_5mM" | "m_coup_y0" | ...
    pairMetricLeft: "coup_5mM",
    pairMetricRight: "fm_5mM_pct",
    zoomPx: 440,
    scalePct: 100,                  // User scale multiplier (65% to 140%) on top of viewport-adaptive sizing

    // Global plot settings
    viewType: "portraits",          // "portraits" | "quadrants" (used in 3x3 Family & 6x6 Library modes)
    portraitMetricKey: "coup_5mM",
    quadMetricKey: "coupling",
    dataSource: "pixel",            // "pixel" | "cell"
    confidenceMode: "vsup_contour", // "vsup_contour" | "vsup_only" | "raw"

    // Interactive Clicked-Bin state (persists & updates live without layout jump)
    selectedBin: { bx: 2, by: 7, quadrant: "Q1_Slow_HiLoad" },

    // Mode 5: Target Finder state
    targetPresetId: "all_quad_tracker",
    targetRegionSpec: { mode: "quadrant", quadrant: "Q4_Fast_LoLoad", bx: 7, by: 2 },
    targetCriteria: {
      coup_5mM:   { enabled: true,  target: 0.96, min: 0.10, max: 1.05, step: 0.02, scale: 0.25, label: "Saturated 5mM Coupling C₅ₘₘ", unit: "" },
      coup_y0:    { enabled: false, target: 0.10, min: 0.08, max: 0.35, step: 0.01, scale: 0.08, label: "Basal 0mM Coupling C₀", unit: "" },
      coup_dy:    { enabled: true,  target: 0.72, min: 0.00, max: 0.90, step: 0.02, scale: 0.25, label: "Inducible Coupling Swing ΔC", unit: "" },
      coup_ec50:  { enabled: true,  target: 0.24, min: 0.05, max: 1.50, step: 0.02, scale: 0.25, label: "Coupling Hill EC₅₀", unit: " mM" },
      fm_5mM_pct: { enabled: false, target: 0.0,  min: -30,  max: 30,   step: 1.0,  scale: 10.0, label: "Driver Frequency Shift ΔF₅ₘₘ", unit: "%" },
      cr_5mM_pct: { enabled: false, target: 0.0,  min: -40,  max: 40,   step: 1.0,  scale: 14.0, label: "Carrier Amp Shift ΔD₅ₘₘ", unit: "%" },
      osc_dy_pct: { enabled: false, target: 15.0, min: -25,  max: 25,   step: 1.0,  scale: 8.0,  label: "Wave Awakening Shift ΔOsc%", unit: "%" }
    },

    // Mode 6: Sortable Table state
    sortCol: "c5mM_sat",
    sortAsc: false
  };

  function getOrderedConstructs(includeTAmut = true) {
    const out = [];
    for (const fam of FAMILIES.slice(0, 4)) {
      for (const v of VALENCIES_9) {
        const cid = `${v}_${fam.mutation}_${fam.topology}`;
        if (CONSTRUCTS[cid]) out.push(CONSTRUCTS[cid]);
      }
    }
    if (includeTAmut) {
      ["1x1_TAmut_inverse", "2x2_TAmut_inverse"].forEach(cid => {
        if (CONSTRUCTS[cid]) out.push(CONSTRUCTS[cid]);
      });
    }
    return out;
  }

  function syncCircuitFromFamilyValency() {
    if (state.familyId === "TAmut_ctrl") {
      if (!state.selectedCircuitA.includes("TAmut")) {
        state.selectedCircuitA = "2x2_TAmut_inverse";
      }
      state.valency = CONSTRUCTS[state.selectedCircuitA]?.valency || "2x2";
      return;
    }
    const fam = FAMILIES.find(f => f.id === state.familyId) || FAMILIES[0];
    const cid = `${state.valency}_${fam.mutation}_${fam.topology}`;
    if (CONSTRUCTS[cid]) {
      state.selectedCircuitA = cid;
    }
  }

  function syncFamilyValencyFromCircuit(cid) {
    const c = CONSTRUCTS[cid];
    if (!c) return;
    state.selectedCircuitA = cid;
    state.valency = c.valency;
    if (c.mutation === "TAmut") {
      state.familyId = "TAmut_ctrl";
    } else {
      state.familyId = `${c.mutation}_${c.topology}`;
    }
  }

  function getBadgeClassForConstruct(c) {
    if (!c) return "badge-wt-upr";
    if (c.mutation === "TAmut") return "badge-tamut";
    if (c.mutation === "WT" && c.topology === "upright") return "badge-wt-upr";
    if (c.mutation === "WT" && c.topology === "inverse") return "badge-wt-inv";
    if (c.mutation === "R70A" && c.topology === "upright") return "badge-r70a-upr";
    return "badge-r70a-inv";
  }

  function formatNum(v, decimals = 2, unit = "", signed = false) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const prefix = (signed && v > 0) ? "+" : "";
    return `${prefix}${v.toFixed(decimals)}${unit}`;
  }

  /**
   * Computes viewport-adaptive (w, h) logical pixel dimensions for canvases so that
   * 3×3 grids and 6×6 super-grids automatically fit the user's browser window size!
   */
  function getAdaptiveTileSize(kind = "grid3x3") {
    const vw = window.innerWidth || 1440;
    const vh = window.innerHeight || 900;
    const sc = (state.scalePct || 100) / 100.0;

    if (kind === "family3x3") {
      // Fit 3 rows + headers comfortably inside viewport height & width
      const availW = Math.floor((vw - 180) / 3.25);
      const availH = Math.floor((vh - 235) / 3.0) - 34;
      const baseH = Math.max(135, Math.min(225, Math.min(availH, Math.round(availW * 0.82))));
      const baseW = Math.round(baseH * 1.22);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "single3x3") {
      // 3x3 grid of 9 phase portraits or 6 quadrant curves in Single-Circuit mode
      const availW = Math.floor((vw - 120) / 3.25);
      const availH = Math.floor((vh - 250) / 2.85) - 46;
      const baseH = Math.max(145, Math.min(215, Math.min(availH, Math.round(availW * 0.83))));
      const baseW = Math.round(baseH * 1.20);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "library6x6") {
      // 6 columns across (2 superquads x 3 cols)
      const availW = Math.floor((vw - 150) / 6.4);
      const availH = Math.floor((vh - 240) / 4.8);
      const baseW = Math.max(125, Math.min(195, Math.min(availW, Math.round(availH * 1.22))));
      const baseH = Math.round(baseW * 0.81);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "zoomed") {
      const availW = Math.floor((vw - 140) / 2.2);
      const availH = Math.floor(vh - 290);
      const baseW = Math.max(290, Math.min(460, Math.min(availW, Math.round(availH * 1.16))));
      const baseH = Math.round(baseW * 0.84);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    return { w: Math.round(240 * sc), h: Math.round(200 * sc) };
  }

  // Tooltip manager for 2D Phase Portrait bins
  const tooltipEl = document.getElementById("portrait-tooltip");

  function handleBinHover(event, info) {
    if (!tooltipEl) return;
    if (!info) {
      tooltipEl.style.display = "none";
      return;
    }
    const { bx, by, bin, inCore, construct } = info;
    const xRanges = DATA.grid_axes.x_bins[bx] || [0, 0];
    const yRanges = DATA.grid_axes.y_bins[by] || [0, 0];
    const qLabel = bx < 5
      ? (by >= 5 ? "Q1: Slow (Hi D/E) + Hi Load" : "Q3: Slow (Hi D/E) + Lo Load")
      : (by >= 5 ? "Q2: Fast (Hi E/D) + Hi Load" : "Q4: Fast (Hi E/D) + Lo Load");

    let html = `
      <div class="tt-title">${construct.valency} ${construct.mutation} ${construct.topology.toUpperCase()} — Bin (${bx}, ${by}) [Click to Plot Curve]</div>
      <div class="tt-row"><span>Quadrant:</span><span class="tt-val">${qLabel}</span></div>
      <div class="tt-row"><span>Δlog₁₀(E/D):</span><span class="tt-val">[${xRanges[0].toFixed(2)}, ${xRanges[1].toFixed(2)}]</span></div>
      <div class="tt-row"><span>Δlog₁₀(Cargo/D):</span><span class="tt-val">[${yRanges[0].toFixed(2)}, ${yRanges[1].toFixed(2)}]</span></div>
    `;

    if (!bin) {
      html += `<div class="tt-row" style="margin-top:4px;color:#f87171;"><span>Status:</span><span class="tt-val">Unpopulated / Quenched</span></div>`;
    } else {
      html += `
        <hr style="border:0;border-top:1px solid #2a3655;margin:4px 0;"/>
        <div class="tt-row"><span>Coupling C₀ → C₅ₘₘ:</span><span class="tt-val">${formatNum(bin.coup_y0, 2)} → ${formatNum(bin.coup_5mM, 2)} (Δ${formatNum(bin.coup_dy, 2, "", true)})</span></div>
        <div class="tt-row"><span>Coupling EC₅₀ (R²):</span><span class="tt-val">${formatNum(bin.coup_ec50, 2, " mM")} (${formatNum(bin.coup_r2, 2)})</span></div>
        <div class="tt-row"><span>Freq Shift ΔF₅ₘₘ:</span><span class="tt-val">${formatNum(bin.fm_5mM_pct, 1, "%", true)}</span></div>
        <div class="tt-row"><span>Carrier Amp ΔD₅ₘₘ:</span><span class="tt-val">${formatNum(bin.cr_5mM_pct, 1, "%", true)}</span></div>
        <div class="tt-row"><span>Loading / AM Fold:</span><span class="tt-val">${formatNum(bin.load_5mM_fold, 2, "×")} / ${formatNum(bin.am_5mM_fold, 2, "×")}</span></div>
        <div class="tt-row"><span>Osc Penetrance ΔOsc:</span><span class="tt-val">${formatNum(bin.osc_dy_pct, 1, "%", true)}</span></div>
        <div class="tt-row"><span>High-Conf Zone:</span><span class="tt-val" style="color:${inCore ? "#34d399" : "#94a3b8"}">${inCore ? "Inside Black Contour" : "Outside / Border"}</span></div>
      `;
    }

    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
    const pad = 14;
    let left = event.clientX + pad;
    let top = event.clientY + pad;
    if (left + 300 > window.innerWidth) left = event.clientX - 305;
    if (top + 230 > window.innerHeight) top = event.clientY - 230;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  /**
   * Updates the Live Clicked-Bin Dose-Response Inspector Dock AND redraws the cyan bin highlight
   * on all visible phase portrait canvases in-place (NO full DOM rebuild or scroll jump!).
   */
  function updateClickedBinLive(clickedInfo) {
    if (clickedInfo) {
      state.selectedBin = {
        bx: clickedInfo.bx,
        by: clickedInfo.by,
        quadrant: clickedInfo.quadrant
      };
      if (clickedInfo.metricSpec) {
        state.portraitMetricKey = clickedInfo.metricSpec.key;
        if (clickedInfo.metricSpec.quadCurveKey) {
          state.quadMetricKey = clickedInfo.metricSpec.quadCurveKey;
        }
      }
    }

    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_upright"];
    const bx = state.selectedBin.bx;
    const by = state.selectedBin.by;
    const binObj = (c.bins_2d || []).find(b => b.bx === bx && b.by === by);
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];

    // 1. Update text readout inside #bin-inspector-readout if present
    const readoutEl = document.getElementById("bin-inspector-readout");
    if (readoutEl) {
      const qLabel = bx < 5
        ? (by >= 5 ? "Q1: Slow (Hi D/E) + Hi Load" : "Q3: Slow (Hi D/E) + Lo Load")
        : (by >= 5 ? "Q2: Fast (Hi E/D) + Hi Load" : "Q4: Fast (Hi E/D) + Lo Load");

      if (!binObj) {
        readoutEl.innerHTML = `
          <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:6px;">
            Clicked Stoichiometry Bin: (bx = ${bx}, by = ${by}) — ${qLabel}
          </div>
          <div style="color:#f87171;font-family:var(--font-mono);font-size:12px;">
            This stoichiometry bin is unpopulated or non-oscillating in ${c.valency} ${c.mutation} ${c.topology}. Click any colored bin on a 2D Phase Portrait to view its fitted Hill dose-response curves.
          </div>
        `;
      } else {
        readoutEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:700;color:var(--accent);">
              Clicked Bin (${bx}, ${by}) Dose-Response Inspector
            </span>
            <span class="badge ${getBadgeClassForConstruct(c)}">${qLabel.split(":")[0]}</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:11.5px;line-height:1.6;color:var(--text);">
            <div><span style="color:var(--muted);">Coords:</span> Δlog₁₀(E/D)=<strong>${formatNum(binObj.x, 2, "", true)}</strong>, Δlog₁₀(Cargo/D)=<strong>${formatNum(binObj.y, 2, "", true)}</strong></div>
            <div><span style="color:var(--muted);">Coupling C(c):</span> <strong>${formatNum(binObj.coup_y0, 2)} → ${formatNum(binObj.coup_5mM, 2)}</strong> (ΔC=<strong>${formatNum(binObj.coup_dy, 2, "", true)}</strong>, EC₅₀=<strong>${formatNum(binObj.coup_ec50, 2, "mM")}</strong>, R²=${formatNum(binObj.coup_r2, 2)})</div>
            <div><span style="color:var(--muted);">Freq Shift ΔF(c):</span> <strong style="color:#fbbf24;">${formatNum(binObj.fm_5mM_pct, 1, "%", true)}</strong> (EC₅₀=${formatNum(binObj.fm_ec50, 2, "mM")}, R²=${formatNum(binObj.fm_r2, 2)})</div>
            <div><span style="color:var(--muted);">Carrier Amp ΔD(c):</span> <strong style="color:#c084fc;">${formatNum(binObj.cr_5mM_pct, 1, "%", true)}</strong> (${formatNum(binObj.cr_5mM_fold, 2, "×")})</div>
            <div><span style="color:var(--muted);">Loading / AM Fold:</span> <strong>${formatNum(binObj.load_5mM_fold, 2, "×")}</strong> / <strong>${formatNum(binObj.am_5mM_fold, 2, "×")}</strong></div>
            <div><span style="color:var(--muted);">Osc Penetrance:</span> ${formatNum(binObj.osc_y0_pct, 1, "%")} → ${formatNum(binObj.osc_5mM_pct, 1, "%")} (ΔOsc=<strong>${formatNum(binObj.osc_dy_pct, 1, "%", true)}</strong>)</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--muted);">
            💡 <em>Click any bin $(bx, by)$ on any 2D Phase Portrait below to immediately plot its dose-response curve on the right!</em>
          </div>
        `;
      }
    }

    // 2. Update the two live canvases inside the Bin Inspector Dock
    const dockQuadCvs = document.getElementById("dock-quad-plus-bin-canvas");
    if (dockQuadCvs) {
      window.renderQuadrantDoseCurveCanvas(dockQuadCvs, c, {
        dataSource: state.dataSource,
        metricKey: state.quadMetricKey,
        showAxesLabels: true,
        showAnnotationBox: true,
        selectedBin: state.selectedBin
      });
    }
    const dockTitleEl = document.getElementById("dock-quad-title");
    if (dockTitleEl) {
      dockTitleEl.textContent = `${qSpec.shortLabel}: 4 Quadrants + Bin (${bx}, ${by}) [Cyan Curve]`;
    }

    const dockMultiCvs = document.getElementById("dock-bin-multi-canvas");
    if (dockMultiCvs) {
      window.renderSingleBinMultiCurveCanvas(dockMultiCvs, c, bx, by);
    }

    // 3. Also update the large zoomed quadrant canvas if currently in zoomed mode
    const zoomedQuadCvs = document.getElementById("zoomed-quad-canvas");
    if (zoomedQuadCvs) {
      window.renderQuadrantDoseCurveCanvas(zoomedQuadCvs, c, {
        dataSource: state.dataSource,
        metricKey: state.quadMetricKey,
        showAxesLabels: true,
        showAnnotationBox: true,
        selectedBin: state.selectedBin
      });
    }

    // 4. Redraw all currently mounted 2D phase portrait canvases in-place so the cyan highlight box moves to (bx, by)
    document.querySelectorAll("canvas.live-portrait-canvas").forEach(cvs => {
      const meta = cvs._portraitMeta;
      if (meta && meta.construct && meta.metricSpec) {
        window.renderPhasePortraitCanvas(cvs, meta.construct, meta.metricSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: cvs.dataset.axes === "true",
          showSummaryBadge: true,
          highlightBin: (meta.construct.id === c.id) ? state.selectedBin : null
        });
      }
    });
  }

  /**
   * Renders Row 1 (`#controls-bar`) and Row 2 (`#focus-bar`) modeled after H9_FOV_Physiology_Atlas_Viewer.html.
   */
  function renderControlBars() {
    // Update active mode button in header
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    const controlsBar = document.getElementById("controls-bar");
    const focusBar = document.getElementById("focus-bar");
    if (!controlsBar || !focusBar) return;

    const allConstructs = getOrderedConstructs(true);

    // Build Row 1: Family pills, Valency pills, Data Unit pills, Zone Contour pills
    let ctrlHTML = `
      <div class="ctrl-group">
        <span class="ctrl-label">Family:</span>
        ${FAMILIES.map(f => `
          <button class="pill-btn ${f.pillClass} ${state.familyId === f.id ? "active" : ""}" data-set-family="${f.id}" title="${f.subtitle}">
            ${f.label}
          </button>
        `).join("")}
      </div>
    `;

    if (state.familyId !== "TAmut_ctrl") {
      ctrlHTML += `
        <div class="ctrl-group">
          <span class="ctrl-label">Valency (MinD×Cargo):</span>
          ${VALENCIES_9.map(v => `
            <button class="pill-btn ${state.valency === v ? "active" : ""}" data-set-valency="${v}">
              ${v}
            </button>
          `).join("")}
        </div>
      `;
    } else {
      ctrlHTML += `
        <div class="ctrl-group">
          <span class="ctrl-label">T→A Control Construct:</span>
          <button class="pill-btn ${state.selectedCircuitA === "1x1_TAmut_inverse" ? "active" : ""}" data-set-cid="1x1_TAmut_inverse">1×1 T→A Inverse (pCL334)</button>
          <button class="pill-btn ${state.selectedCircuitA === "2x2_TAmut_inverse" ? "active" : ""}" data-set-cid="2x2_TAmut_inverse">2×2 T→A Inverse (pCL335)</button>
        </div>
      `;
    }

    ctrlHTML += `
      <div class="ctrl-group">
        <span class="ctrl-label">4-Quad Unit:</span>
        <button class="pill-btn ${state.dataSource === "pixel" ? "active" : ""}" data-set-source="pixel" title="64×64 Superpixel Wave Voxels">Pixel-Voxel</button>
        <button class="pill-btn ${state.dataSource === "cell" ? "active" : ""}" data-set-source="cell" title="Single-Cell ultrack Masks (1 Cell = 1 Vote)">ultrack Cell-Mask</button>
      </div>

      <div class="ctrl-group">
        <span class="ctrl-label">Zone Filter:</span>
        <button class="pill-btn ${state.confidenceMode === "vsup_contour" ? "active" : ""}" data-set-conf="vsup_contour">Black Contour ON</button>
        <button class="pill-btn ${state.confidenceMode === "vsup_only" ? "active" : ""}" data-set-conf="vsup_only">Contour OFF</button>
        <button class="pill-btn ${state.confidenceMode === "raw" ? "active" : ""}" data-set-conf="raw">Raw</button>
      </div>

      <div class="kb-hint">
        Keys: <strong>1–4</strong> Family | <strong>←/→</strong> Valency | <strong>↑/↓</strong> Metric | <strong>C</strong> Contour | <strong>M</strong> Pixel/Cell
      </div>
    `;

    controlsBar.innerHTML = ctrlHTML;

    // Build Row 2 (`#focus-bar`) depending on active mode
    const scaleCtrlHTML = `
      <div class="ctrl-group" style="margin-left:auto;">
        <span class="ctrl-label">Grid / Plot Scale:</span>
        <input type="range" id="slider-scale-pct" min="65" max="140" step="5" value="${state.scalePct}" style="width:95px;accent-color:var(--accent);" title="Scale plots relative to browser window size" />
        <span id="scale-pct-label" style="font-size:11.5px;color:var(--accent);font-weight:700;font-family:var(--font-mono);">${state.scalePct}%</span>
      </div>
    `;

    let focusHTML = "";
    if (state.mode === "single") {
      focusHTML = `
        <span class="ctrl-label" style="color:#c084fc;">Display / Focus View:</span>
        <button class="pill-btn focus-special ${state.focus === "all_portraits" ? "active" : ""}" data-set-focus="all_portraits">
          All 9 Portraits (3×3 Grid)
        </button>
        <button class="pill-btn focus-special ${state.focus === "all_quads" ? "active" : ""}" data-set-focus="all_quads">
          All 6 Dose-Response Curves (4-Quad)
        </button>
        <button class="pill-btn focus-special ${state.focus === "pair_metrics" ? "active" : ""}" data-set-focus="pair_metrics">
          Side-by-Side Metric Pair (Pick 2)
        </button>
        <span style="color:var(--border);margin:0 4px;">|</span>
        <span class="ctrl-label" style="color:#38bdf8;">Zoom Single Portrait (+ 4-Quad Curve):</span>
        ${window.PORTRAIT_METRICS.map((m, idx) => `
          <button class="pill-btn ${state.focus === "m_" + m.key ? "active" : ""}" data-set-focus="m_${m.key}">
            ${idx + 1}. ${m.shortLabel.split(" (")[0]}
          </button>
        `).join("")}
        ${scaleCtrlHTML}
      `;
    } else if (state.mode === "family3x3" || state.mode === "library6x6") {
      focusHTML = `
        <span class="ctrl-label" style="color:#c084fc;">Plot Type:</span>
        <button class="pill-btn focus-special ${state.viewType === "portraits" ? "active" : ""}" data-set-viewtype="portraits">
          2D Stoichiometry Phase Portraits
        </button>
        <button class="pill-btn focus-special ${state.viewType === "quadrants" ? "active" : ""}" data-set-viewtype="quadrants">
          4-Quadrant Dose-Response Curves (0–5 mM)
        </button>
        <span style="color:var(--border);margin:0 4px;">|</span>
      `;
      if (state.viewType === "portraits") {
        focusHTML += `
          <span class="ctrl-label" style="color:#38bdf8;">Select 2D Metric:</span>
          ${window.PORTRAIT_METRICS.map((m, idx) => `
            <button class="pill-btn ${state.portraitMetricKey === m.key ? "active" : ""}" data-set-pmetric="${m.key}">
              ${idx + 1}. ${m.shortLabel}
            </button>
          `).join("")}
        `;
      } else {
        focusHTML += `
          <span class="ctrl-label" style="color:#38bdf8;">Select 4-Quadrant Curve Metric:</span>
          ${window.QUADRANT_METRICS.map((m, idx) => `
            <button class="pill-btn ${state.quadMetricKey === m.key ? "active" : ""}" data-set-qmetric="${m.key}">
              ${idx + 1}. ${m.shortLabel}
            </button>
          `).join("")}
        `;
      }
      focusHTML += scaleCtrlHTML;
    } else if (state.mode === "pairwise") {
      focusHTML = `
        <div class="ctrl-group">
          <span class="ctrl-label" style="color:#60a5fa;">Circuit A (Left):</span>
          <select id="sel-pair-circuit-a" class="dark-select">
            ${allConstructs.map(c => `<option value="${c.id}" ${c.id === state.selectedCircuitA ? "selected" : ""}>${c.valency} ${c.mutation} ${c.topology.toUpperCase()} (${c.design_id})</option>`).join("")}
          </select>
        </div>
        <div class="ctrl-group">
          <span class="ctrl-label" style="color:#f87171;">Circuit B (Right):</span>
          <select id="sel-pair-circuit-b" class="dark-select">
            ${allConstructs.map(c => `<option value="${c.id}" ${c.id === state.selectedCircuitB ? "selected" : ""}>${c.valency} ${c.mutation} ${c.topology.toUpperCase()} (${c.design_id})</option>`).join("")}
          </select>
        </div>
        <button class="pill-btn" id="btn-swap-circuits">⇄ Swap A &amp; B</button>
        <span style="color:var(--border);margin:0 4px;">|</span>
        <span class="ctrl-label" style="color:#38bdf8;">Metric:</span>
        ${window.PORTRAIT_METRICS.map((m, idx) => `
          <button class="pill-btn ${state.portraitMetricKey === m.key ? "active" : ""}" data-set-pmetric="${m.key}">
            ${idx + 1}. ${m.shortLabel.split(" (")[0]}
          </button>
        `).join("")}
        ${scaleCtrlHTML}
      `;
    } else {
      focusHTML = `
        <span class="ctrl-label" style="color:#38bdf8;">Reference 2D Portrait Metric:</span>
        ${window.PORTRAIT_METRICS.map((m, idx) => `
          <button class="pill-btn ${state.portraitMetricKey === m.key ? "active" : ""}" data-set-pmetric="${m.key}">
            ${idx + 1}. ${m.shortLabel}
          </button>
        `).join("")}
        ${scaleCtrlHTML}
      `;
    }

    focusBar.innerHTML = focusHTML;

    // Bind events in controlsBar & focusBar
    controlsBar.querySelectorAll("[data-set-family]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.familyId = btn.dataset.setFamily;
        syncCircuitFromFamilyValency();
        updateUI();
      });
    });

    controlsBar.querySelectorAll("[data-set-valency]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.valency = btn.dataset.setValency;
        syncCircuitFromFamilyValency();
        updateUI();
      });
    });

    controlsBar.querySelectorAll("[data-set-cid]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.setCid);
        updateUI();
      });
    });

    controlsBar.querySelectorAll("[data-set-source]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.dataSource = btn.dataset.setSource;
        updateUI();
      });
    });

    controlsBar.querySelectorAll("[data-set-conf]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.confidenceMode = btn.dataset.setConf;
        updateUI();
      });
    });

    focusBar.querySelectorAll("[data-set-focus]").forEach(btn => {
      btn.addEventListener("click", () => {
        const fk = btn.dataset.setFocus;
        state.focus = fk;
        if (fk.startsWith("m_")) {
          const mKey = fk.substring(2);
          state.portraitMetricKey = mKey;
          const mSpec = window.PORTRAIT_METRIC_MAP[mKey];
          if (mSpec && mSpec.quadCurveKey) state.quadMetricKey = mSpec.quadCurveKey;
        }
        updateUI();
      });
    });

    focusBar.querySelectorAll("[data-set-viewtype]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.viewType = btn.dataset.setViewtype;
        updateUI();
      });
    });

    focusBar.querySelectorAll("[data-set-pmetric]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.portraitMetricKey = btn.dataset.setPmetric;
        const mSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey];
        if (mSpec && mSpec.quadCurveKey) state.quadMetricKey = mSpec.quadCurveKey;
        updateUI();
      });
    });

    focusBar.querySelectorAll("[data-set-qmetric]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.quadMetricKey = btn.dataset.setQmetric;
        if (state.quadMetricKey === "cell_territory_pct") state.dataSource = "cell";
        updateUI();
      });
    });

    const sliderScale = document.getElementById("slider-scale-pct");
    if (sliderScale) {
      sliderScale.addEventListener("input", e => {
        state.scalePct = parseInt(e.target.value, 10);
        const lbl = document.getElementById("scale-pct-label");
        if (lbl) lbl.textContent = `${state.scalePct}%`;
      });
      sliderScale.addEventListener("change", () => updateUI());
    }

    const selPairA = document.getElementById("sel-pair-circuit-a");
    if (selPairA) {
      selPairA.addEventListener("change", e => {
        syncFamilyValencyFromCircuit(e.target.value);
        updateUI();
      });
    }
    const selPairB = document.getElementById("sel-pair-circuit-b");
    if (selPairB) {
      selPairB.addEventListener("change", e => {
        state.selectedCircuitB = e.target.value;
        updateUI();
      });
    }
    const btnSwap = document.getElementById("btn-swap-circuits");
    if (btnSwap) {
      btnSwap.addEventListener("click", () => {
        const tmp = state.selectedCircuitA;
        syncFamilyValencyFromCircuit(state.selectedCircuitB);
        state.selectedCircuitB = tmp;
        updateUI();
      });
    }
  }

  /**
   * Builds a Quantitative 4-Quadrant Hill Fit Table (styled with table.fov-table).
   */
  function buildQuadrantFitTableHTML(construct, metricKey, dataSource) {
    const qDict = dataSource === "cell" ? (construct.quadrants_cell || {}) : (construct.quadrants_pixel || {});
    const qSpec = window.QUADRANT_METRIC_MAP[metricKey] || window.QUADRANT_METRICS[0];
    const quads = [
      { key: "Q1_Slow_HiLoad", short: "Q1: Slow (Hi D/E) + Hi Load", dot: "q1" },
      { key: "Q3_Slow_LoLoad", short: "Q3: Slow (Hi D/E) + Lo Load", dot: "q3" },
      { key: "Q2_Fast_HiLoad", short: "Q2: Fast (Hi E/D) + Hi Load", dot: "q2" },
      { key: "Q4_Fast_LoLoad", short: "Q4: Fast (Hi E/D) + Lo Load", dot: "q4" }
    ];

    const dec = qSpec.decimals;
    const u = qSpec.unit;

    let rowsHTML = quads.map(q => {
      const qObj = qDict[q.key] || {};
      const mObj = (qObj.metrics || {})[metricKey] || {};
      const f = mObj.fit || {};
      const nCount = dataSource === "cell" ? qObj.n_cells : qObj.n_voxels;
      return `
        <tr>
          <td><span class="quad-dot ${q.dot}"></span><strong>${q.short}</strong></td>
          <td>${nCount !== undefined && nCount !== null ? nCount.toLocaleString() : "—"}</td>
          <td>${formatNum(f.y0, dec, u)}</td>
          <td style="color:#38bdf8;font-weight:700;">${formatNum(f.y5mM, dec, u)}</td>
          <td>${formatNum(f.dy, dec, u, true)}</td>
          <td style="color:#fde047;font-weight:700;">${formatNum(f.ec50, 2, " mM")}</td>
          <td>${formatNum(f.nhill, 2)}</td>
          <td>${formatNum(f.r2, 2)}</td>
        </tr>
      `;
    }).join("");

    return `
      <table class="fov-table">
        <thead>
          <tr>
            <th>Quadrant Stoichiometry Regime</th>
            <th>${dataSource === "cell" ? "Osc. Cells" : "Wave Voxels"}</th>
            <th>Basal y₀ (0 mM)</th>
            <th>Plateau y₅ₘₘ (5 mM)</th>
            <th>Net Swing Δy</th>
            <th>Hill EC₅₀</th>
            <th>Hill n_H</th>
            <th>Fit R²</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    `;
  }

  /**
   * MODE 1: Single-Circuit Inspector (Modeled after H9_FOV_Physiology_Atlas_Viewer.html)
   */
  function renderSingleMode(container) {
    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_upright"];
    const gs = c.global_summary || {};
    const badgeCls = getBadgeClassForConstruct(c);
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];

    // 1. 8-Card Metrics Strip at Top (matching H9_FOV_Physiology_Atlas_Viewer.html)
    const metricsStripHTML = `
      <div class="metrics-strip">
        <div class="metric-card">
          <div class="m-label">Basal 0 mM Coupling (C₀)</div>
          <div class="m-val" style="color:#fbbf24;">${c.is_clamped_0mM ? "Clamped" : formatNum(gs.c0_basal, 3)}</div>
          <div class="m-sub">Data_norm / D_norm (0 mM)</div>
        </div>
        <div class="metric-card">
          <div class="m-label">Saturated 5 mM Coupling</div>
          <div class="m-val" style="color:#38bdf8;">${formatNum(gs.c5mM_sat, 3)}</div>
          <div class="m-sub">1.00 = 1:1 Wave Tracking</div>
        </div>
        <div class="metric-card">
          <div class="m-label">Net Inducible Swing (ΔC)</div>
          <div class="m-val" style="color:#34d399;">${formatNum(gs.delta_coup, 3, "", true)}</div>
          <div class="m-sub">PKA-Driven Coupling Gain</div>
        </div>
        <div class="metric-card">
          <div class="m-label">Baseline Wave Freq (F₀)</div>
          <div class="m-val">${formatNum(gs.f0_mHz, 1, " mHz")}</div>
          <div class="m-sub">0 mM Phase-Vocoder Median</div>
        </div>
        <div class="metric-card">
          <div class="m-label">5 mM Frequency Shift (ΔF)</div>
          <div class="m-val" style="color:${(gs.fm_5mM_pct || 0) >= 0 ? "#f87171" : "#60a5fa"};">${formatNum(gs.fm_5mM_pct, 1, "%", true)}</div>
          <div class="m-sub">Core Driver Clock Shift</div>
        </div>
        <div class="metric-card">
          <div class="m-label">5 mM Carrier Amp Shift</div>
          <div class="m-val" style="color:#c084fc;">${formatNum(gs.cr_5mM_pct, 1, "%", true)}</div>
          <div class="m-sub">MinD Wave Power Change</div>
        </div>
        <div class="metric-card">
          <div class="m-label">Active Segmented Cells</div>
          <div class="m-val">${formatNum(gs.active_cells_5mM_pct, 1, "%")}</div>
          <div class="m-sub">0 mM: ${formatNum(gs.active_cells_0mM_pct, 1, "%")} (${(gs.n_cells_total || 0).toLocaleString()} cells)</div>
        </div>
        <div class="metric-card">
          <div class="m-label">Subcellular Wave Territory</div>
          <div class="m-val" style="color:#34d399;">${formatNum(gs.cell_territory_5mM_pct, 1, "%")}</div>
          <div class="m-sub">0 mM f_osc: ${formatNum(gs.cell_territory_0mM_pct, 1, "%")}</div>
        </div>
      </div>
    `;

    // 2. Live Clicked-Bin Dose-Response Inspector + Antenna Schematic Dock
    const inspectorDockHTML = `
      <div class="fov-card">
        <div class="fov-card-header">
          <div>
            <span class="badge ${badgeCls}">${c.valency} ${c.mutation} ${c.topology.toUpperCase()}</span>
            <strong style="margin-left:8px;font-size:14px;">${c.arch_desc}</strong>
            <span style="color:var(--muted);margin-left:8px;font-family:var(--font-mono);font-size:12px;">(${c.design_id} | Plasmids: ${c.plasmids})</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="pill-btn" id="btn-compare-counterpart">
              ${c.mutation === "TAmut" ? `Compare ${c.valency} WT vs T→A Control →` : "Compare Upright vs Inverse Pair →"}
            </button>
          </div>
        </div>

        <div class="bin-inspector-dock">
          <!-- Col 1: Interactive Molecular Antenna Schematic -->
          <div>
            ${window.renderAntennaSchematicHTML(c, true)}
          </div>

          <!-- Col 2: Clicked Bin (bx, by) Readout + 4-Quad Overlay Curve -->
          <div style="display:grid;grid-template-columns:1fr 310px;gap:12px;align-items:center;">
            <div id="bin-inspector-readout"></div>
            <div class="tile-card" style="padding:6px;">
              <div class="tile-card-header">
                <span id="dock-quad-title">${qSpec.shortLabel}: 4 Quads + Clicked Bin</span>
              </div>
              <canvas id="dock-quad-plus-bin-canvas" width="295" height="210"></canvas>
            </div>
          </div>

          <!-- Col 3: Clicked Bin (bx, by) Joint Multi-Feature Dose Curve (C, ΔF%, ΔD%) -->
          <div class="tile-card" style="padding:6px;">
            <div class="tile-card-header">
              <span>Clicked Bin Joint Curve: C(c), ΔF%, ΔD%</span>
              <span class="mono-tag">0 → 5 mM</span>
            </div>
            <canvas id="dock-bin-multi-canvas" width="330" height="210"></canvas>
          </div>
        </div>
      </div>
    `;

    // 3. Main Focus Visual Body (All 9 Portraits Grid, OR All 6 Dose Curves Grid, OR Side-by-Side Metric Pair, OR Single Zoomed Metric)
    let visualBodyHTML = "";
    const sz3x3 = getAdaptiveTileSize("single3x3");
    const szZoom = getAdaptiveTileSize("zoomed");

    if (state.focus === "all_portraits") {
      visualBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong>All 9 Intrinsic 2D Stoichiometry Phase Portraits (0 → 5.0 mM Hill Fits)</strong>
              <span style="color:var(--muted);margin-left:10px;font-size:12px;">
                Click any <strong>(bx, by) bin</strong> inside a portrait to plot its dose-response curve above, or click <strong>Zoom ⤢</strong> to enlarge.
              </span>
            </div>
            <div style="color:var(--muted);font-size:12px;font-family:var(--font-mono);">
              Selected Bin: <strong style="color:var(--accent);">(${state.selectedBin.bx}, ${state.selectedBin.by})</strong>
            </div>
          </div>

          <div class="portrait-grid-9">
            ${window.PORTRAIT_METRICS.map((m, idx) => `
              <div class="tile-card ${m.key === state.portraitMetricKey ? "active-metric" : ""}">
                <div class="tile-card-header">
                  <span>${idx + 1}. ${m.shortLabel}</span>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <span class="mono-tag" id="stat-tag-${m.key}"></span>
                    <button class="zoom-btn-mini" data-zoom-metric="${m.key}" title="Zoom into ${m.shortLabel}">Zoom ⤢</button>
                  </div>
                </div>
                <canvas id="single-pcanvas-${m.key}" class="live-portrait-canvas" data-axes="true" data-w="${sz3x3.w}" data-h="${sz3x3.h}" width="${sz3x3.w}" height="${sz3x3.h}" style="cursor:crosshair;"></canvas>
                <canvas id="single-pcbar-${m.key}" data-w="${sz3x3.w - 16}" data-h="26" width="${sz3x3.w - 16}" height="26"></canvas>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (state.focus === "all_quads") {
      visualBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong>All 6 4-Quadrant Dose-Response Curves (0 → 5.0 mM Bt₂cAMP) — ${state.dataSource === "cell" ? "Single-Cell ultrack Masks (1 Cell = 1 Vote)" : "64×64 Superpixel Wave Voxels"}</strong>
              <span style="color:var(--muted);margin-left:10px;font-size:12px;">
                Glowing cyan curve shows currently selected Stoichiometry Bin <strong>(${state.selectedBin.bx}, ${state.selectedBin.by})</strong>.
              </span>
            </div>
            <div class="quad-legend-row">
              <span><span class="quad-dot q1"></span>Q1: Slow+HiLoad</span>
              <span><span class="quad-dot q3"></span>Q3: Slow+LoLoad</span>
              <span><span class="quad-dot q2"></span>Q2: Fast+HiLoad</span>
              <span><span class="quad-dot q4"></span>Q4: Fast+LoLoad</span>
              <span><span class="quad-dot bin"></span>Bin (${state.selectedBin.bx},${state.selectedBin.by})</span>
            </div>
          </div>

          <div class="portrait-grid-9">
            ${window.QUADRANT_METRICS.map((qm, idx) => `
              <div class="tile-card ${qm.key === state.quadMetricKey ? "active-metric" : ""}">
                <div class="tile-card-header">
                  <span>${idx + 1}. ${qm.shortLabel}</span>
                  <span class="mono-tag">${state.dataSource.toUpperCase()}</span>
                </div>
                <canvas id="single-qcanvas-${qm.key}" data-w="${sz3x3.w}" data-h="${sz3x3.h}" width="${sz3x3.w}" height="${sz3x3.h}"></canvas>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (state.focus === "pair_metrics") {
      const mLeft = window.PORTRAIT_METRIC_MAP[state.pairMetricLeft] || window.PORTRAIT_METRICS[0];
      const mRight = window.PORTRAIT_METRIC_MAP[state.pairMetricRight] || window.PORTRAIT_METRICS[4];
      visualBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
              <strong>Side-by-Side Metric Comparison (${c.valency} ${c.mutation} ${c.topology.toUpperCase()})</strong>
              <label style="font-size:12px;color:var(--muted);">Left Metric:
                <select id="sel-pair-mleft" class="dark-select">
                  ${window.PORTRAIT_METRICS.map(m => `<option value="${m.key}" ${m.key === state.pairMetricLeft ? "selected" : ""}>${m.shortLabel}</option>`).join("")}
                </select>
              </label>
              <label style="font-size:12px;color:var(--muted);">Right Metric:
                <select id="sel-pair-mright" class="dark-select">
                  ${window.PORTRAIT_METRICS.map(m => `<option value="${m.key}" ${m.key === state.pairMetricRight ? "selected" : ""}>${m.shortLabel}</option>`).join("")}
                </select>
              </label>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:20px;justify-content:center;">
            <div class="tile-card">
              <div class="tile-card-header"><span>${mLeft.title}</span></div>
              <canvas id="pair-mleft-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szZoom.w}" data-h="${szZoom.h}" width="${szZoom.w}" height="${szZoom.h}" style="cursor:crosshair;"></canvas>
              <canvas id="pair-mleft-cbar" data-w="${szZoom.w - 30}" data-h="30" width="${szZoom.w - 30}" height="30"></canvas>
            </div>
            <div class="tile-card">
              <div class="tile-card-header"><span>${mRight.title}</span></div>
              <canvas id="pair-mright-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szZoom.w}" data-h="${szZoom.h}" width="${szZoom.w}" height="${szZoom.h}" style="cursor:crosshair;"></canvas>
              <canvas id="pair-mright-cbar" data-w="${szZoom.w - 30}" data-h="30" width="${szZoom.w - 30}" height="30"></canvas>
            </div>
          </div>
        </div>
      `;
    } else if (state.focus.startsWith("m_")) {
      const mKey = state.focus.substring(2);
      const pSpec = window.PORTRAIT_METRIC_MAP[mKey] || window.PORTRAIT_METRICS[0];
      visualBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong style="font-size:14px;color:var(--accent);">${pSpec.title}</strong>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">${pSpec.description}</div>
            </div>
            <button class="pill-btn focus-special" id="btn-back-all-portraits">← Back to All 9 Portraits Grid</button>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:20px;justify-content:center;align-items:flex-start;margin-bottom:14px;">
            <div class="tile-card">
              <div class="tile-card-header">
                <span>2D Stoichiometry Phase Portrait (Click any bin to plot curve)</span>
                <span class="mono-tag">${c.valency} ${c.mutation} ${c.topology.toUpperCase()}</span>
              </div>
              <canvas id="zoomed-portrait-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szZoom.w}" data-h="${szZoom.h}" width="${szZoom.w}" height="${szZoom.h}" style="cursor:crosshair;"></canvas>
              <canvas id="zoomed-portrait-cbar" data-w="${szZoom.w - 30}" data-h="30" width="${szZoom.w - 30}" height="30"></canvas>
            </div>

            <div class="tile-card">
              <div class="tile-card-header">
                <span>4-Quadrant + Clicked Bin (${state.selectedBin.bx}, ${state.selectedBin.by}) Dose-Response</span>
                <span class="mono-tag">${state.dataSource.toUpperCase()} MODE</span>
              </div>
              <canvas id="zoomed-quad-canvas" data-w="${szZoom.w}" data-h="${szZoom.h}" width="${szZoom.w}" height="${szZoom.h}"></canvas>
              <div class="quad-legend-row" style="margin-top:6px;">
                <span><span class="quad-dot q1"></span>Q1</span>
                <span><span class="quad-dot q3"></span>Q3</span>
                <span><span class="quad-dot q2"></span>Q2</span>
                <span><span class="quad-dot q4"></span>Q4</span>
                <span><span class="quad-dot bin"></span>Clicked Bin (${state.selectedBin.bx},${state.selectedBin.by})</span>
              </div>
            </div>
          </div>

          ${buildQuadrantFitTableHTML(c, state.quadMetricKey, state.dataSource)}
        </div>
      `;
    }

    container.innerHTML = metricsStripHTML + inspectorDockHTML + visualBodyHTML;

    // Bind Compare Upright vs Inverse Pair button
    const btnComp = document.getElementById("btn-compare-counterpart");
    if (btnComp) {
      btnComp.addEventListener("click", () => {
        if (c.mutation === "TAmut") {
          const wtId = `${c.valency}_WT_inverse`;
          if (CONSTRUCTS[wtId]) {
            state.selectedCircuitA = wtId;
            state.selectedCircuitB = c.id;
          }
        } else {
          const oppTopo = c.topology === "upright" ? "inverse" : "upright";
          const oppId = `${c.valency}_${c.mutation}_${oppTopo}`;
          if (CONSTRUCTS[oppId]) {
            state.selectedCircuitA = c.topology === "upright" ? c.id : oppId;
            state.selectedCircuitB = c.topology === "upright" ? oppId : c.id;
          }
        }
        state.mode = "pairwise";
        updateUI();
      });
    }

    // Render canvases depending on focus view
    if (state.focus === "all_portraits") {
      for (const m of window.PORTRAIT_METRICS) {
        const cvs = document.getElementById(`single-pcanvas-${m.key}`);
        const cbar = document.getElementById(`single-pcbar-${m.key}`);
        if (cvs) {
          const res = window.renderPhasePortraitCanvas(cvs, c, m, {
            confidenceMode: state.confidenceMode,
            showAxesLabels: true,
            showSummaryBadge: true,
            highlightBin: state.selectedBin
          });
          const tag = document.getElementById(`stat-tag-${m.key}`);
          if (tag) tag.textContent = `${res.activeBins} bins`;
          // Clicking a bin updates the live Bin Dose-Response Inspector in-place!
          window.attachPortraitInteractivity(cvs, handleBinHover, clicked => {
            updateClickedBinLive(clicked);
          });
        }
        if (cbar) window.renderColorbarCanvas(cbar, m);
      }

      container.querySelectorAll("[data-zoom-metric]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const mKey = btn.dataset.zoomMetric;
          state.focus = `m_${mKey}`;
          state.portraitMetricKey = mKey;
          const mSpec = window.PORTRAIT_METRIC_MAP[mKey];
          if (mSpec && mSpec.quadCurveKey) state.quadMetricKey = mSpec.quadCurveKey;
          updateUI();
        });
      });
    } else if (state.focus === "all_quads") {
      for (const qm of window.QUADRANT_METRICS) {
        const cvs = document.getElementById(`single-qcanvas-${qm.key}`);
        if (cvs) {
          window.renderQuadrantDoseCurveCanvas(cvs, c, {
            dataSource: qm.key === "cell_territory_pct" ? "cell" : state.dataSource,
            metricKey: qm.key,
            showAxesLabels: true,
            showAnnotationBox: true,
            selectedBin: state.selectedBin
          });
        }
      }
    } else if (state.focus === "pair_metrics") {
      const mLeft = window.PORTRAIT_METRIC_MAP[state.pairMetricLeft] || window.PORTRAIT_METRICS[0];
      const mRight = window.PORTRAIT_METRIC_MAP[state.pairMetricRight] || window.PORTRAIT_METRICS[4];
      const cL = document.getElementById("pair-mleft-canvas");
      const cbL = document.getElementById("pair-mleft-cbar");
      const cR = document.getElementById("pair-mright-canvas");
      const cbR = document.getElementById("pair-mright-cbar");
      if (cL) {
        window.renderPhasePortraitCanvas(cL, c, mLeft, { confidenceMode: state.confidenceMode, showAxesLabels: true, highlightBin: state.selectedBin });
        window.attachPortraitInteractivity(cL, handleBinHover, clicked => updateClickedBinLive(clicked));
      }
      if (cbL) window.renderColorbarCanvas(cbL, mLeft);
      if (cR) {
        window.renderPhasePortraitCanvas(cR, c, mRight, { confidenceMode: state.confidenceMode, showAxesLabels: true, highlightBin: state.selectedBin });
        window.attachPortraitInteractivity(cR, handleBinHover, clicked => updateClickedBinLive(clicked));
      }
      if (cbR) window.renderColorbarCanvas(cbR, mRight);

      const selL = document.getElementById("sel-pair-mleft");
      const selR = document.getElementById("sel-pair-mright");
      if (selL) selL.addEventListener("change", e => { state.pairMetricLeft = e.target.value; updateUI(); });
      if (selR) selR.addEventListener("change", e => { state.pairMetricRight = e.target.value; updateUI(); });
    } else if (state.focus.startsWith("m_")) {
      const mKey = state.focus.substring(2);
      const pSpec = window.PORTRAIT_METRIC_MAP[mKey] || window.PORTRAIT_METRICS[0];
      const zCvs = document.getElementById("zoomed-portrait-canvas");
      const zCbar = document.getElementById("zoomed-portrait-cbar");
      if (zCvs) {
        window.renderPhasePortraitCanvas(zCvs, c, pSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: true,
          showSummaryBadge: true,
          highlightBin: state.selectedBin
        });
        window.attachPortraitInteractivity(zCvs, handleBinHover, clicked => updateClickedBinLive(clicked));
      }
      if (zCbar) window.renderColorbarCanvas(zCbar, pSpec);
      const btnBack = document.getElementById("btn-back-all-portraits");
      if (btnBack) btnBack.addEventListener("click", () => { state.focus = "all_portraits"; updateUI(); });
    }

    // Populate the live Bin Inspector Dock canvases & text
    updateClickedBinLive(null);
  }

  /**
   * MODE 2: 3x3 Family Explorer
   */
  function renderFamily3x3Mode(container) {
    const fam = FAMILIES.find(f => f.id === state.familyId && f.id !== "TAmut_ctrl") || FAMILIES[0];
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];
    const sz = getAdaptiveTileSize("family3x3");

    let cellsHTML = `
      <div class="matrix-hdr-cell">MinD \\ Cargo</div>
      <div class="matrix-hdr-cell">1× Cargo Repeats</div>
      <div class="matrix-hdr-cell">2× Cargo Repeats</div>
      <div class="matrix-hdr-cell">3× Cargo Repeats</div>
    `;

    for (let r = 0; r < 3; r++) {
      cellsHTML += `<div class="matrix-hdr-cell">${r + 1}× MinD Carrier</div>`;
      for (let col = 0; col < 3; col++) {
        const valStr = VALENCY_GRID[r][col];
        const cid = `${valStr}_${fam.mutation}_${fam.topology}`;
        const c = CONSTRUCTS[cid];
        cellsHTML += `
          <div class="tile-card ${cid === state.selectedCircuitA ? "active-metric" : ""}">
            <div class="tile-card-header">
              <span>${valStr} ${fam.label} <span style="color:var(--muted);font-weight:400;">(${c ? c.design_id : ""})</span></span>
              <button class="zoom-btn-mini" data-open-single="${cid}">Inspect ↗</button>
            </div>
            <canvas id="fam3x3-canvas-${cid}" class="live-portrait-canvas" data-axes="true" data-w="${sz.w}" data-h="${sz.h}" width="${sz.w}" height="${sz.h}" style="cursor:pointer;"></canvas>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="fov-card">
        <div class="fov-card-header">
          <div>
            <span class="badge ${fam.badgeClass}">${fam.label.toUpperCase()} FAMILY (3×3 MATRIX)</span>
            <strong style="margin-left:8px;font-size:14px;">
              ${state.viewType === "portraits" ? pSpec.title : `${qSpec.shortLabel} (${state.dataSource.toUpperCase()} Mode)`}
            </strong>
            <span style="color:var(--muted);margin-left:8px;font-size:12px;">${fam.subtitle}</span>
          </div>
          <div>
            ${state.viewType === "portraits"
              ? `<canvas id="fam3x3-cbar" width="270" height="30"></canvas>`
              : `<div class="quad-legend-row">
                   <span><span class="quad-dot q1"></span>Q1: Slow+HiLoad</span>
                   <span><span class="quad-dot q3"></span>Q3: Slow+LoLoad</span>
                   <span><span class="quad-dot q2"></span>Q2: Fast+HiLoad</span>
                   <span><span class="quad-dot q4"></span>Q4: Fast+LoLoad</span>
                 </div>`
            }
          </div>
        </div>
        <div class="matrix-3x3-grid">
          ${cellsHTML}
        </div>
      </div>
    `;

    if (state.viewType === "portraits") {
      const cbar = document.getElementById("fam3x3-cbar");
      if (cbar) window.renderColorbarCanvas(cbar, pSpec);
    }

    for (const v of VALENCIES_9) {
      const cid = `${v}_${fam.mutation}_${fam.topology}`;
      const c = CONSTRUCTS[cid];
      const cvs = document.getElementById(`fam3x3-canvas-${cid}`);
      if (!cvs || !c) continue;
      if (state.viewType === "portraits") {
        window.renderPhasePortraitCanvas(cvs, c, pSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: true,
          showSummaryBadge: true
        });
        window.attachPortraitInteractivity(cvs, handleBinHover, clicked => {
          syncFamilyValencyFromCircuit(cid);
          state.selectedBin = { bx: clicked.bx, by: clicked.by, quadrant: clicked.quadrant };
          state.mode = "single";
          updateUI();
        });
      } else {
        window.renderQuadrantDoseCurveCanvas(cvs, c, {
          dataSource: state.dataSource,
          metricKey: state.quadMetricKey,
          showAxesLabels: true,
          showAnnotationBox: true
        });
        cvs.addEventListener("click", () => {
          syncFamilyValencyFromCircuit(cid);
          state.mode = "single";
          updateUI();
        });
      }
    }

    container.querySelectorAll("[data-open-single]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.openSingle);
        state.mode = "single";
        updateUI();
      });
    });
  }

  /**
   * MODE 3: Full 4 x (3x3) Library Overview
   */
  function renderLibrary6x6Mode(container) {
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];
    const sz6 = getAdaptiveTileSize("library6x6");

    const buildSuperQuadHTML = (mut, topo, bannerClass, titleText) => {
      let cells = "";
      for (const v of VALENCIES_9) {
        const cid = `${v}_${mut}_${topo}`;
        const c = CONSTRUCTS[cid];
        cells += `
          <div class="tile-card" style="padding:5px;">
            <div class="tile-card-header" style="font-size:10.5px;margin-bottom:3px;">
              <span>${v} <span style="color:var(--muted);font-weight:400;">${c ? c.design_id : ""}</span></span>
              <button class="zoom-btn-mini" data-open-single="${cid}">↗</button>
            </div>
            <canvas id="lib6x6-canvas-${cid}" data-w="${sz6.w}" data-h="${sz6.h}" width="${sz6.w}" height="${sz6.h}" style="cursor:pointer;"></canvas>
          </div>
        `;
      }
      return `
        <div class="superquad-card">
          <div class="superquad-banner ${bannerClass}">
            <span>${titleText}</span>
            <span>1×1 → 3×3</span>
          </div>
          <div class="superquad-3x3-inner">
            ${cells}
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="fov-card">
        <div class="fov-card-header">
          <div>
            <strong style="font-size:14.5px;color:var(--accent);">
              Full 36-Construct Library (4 × 3×3 Layout) —
              ${state.viewType === "portraits" ? pSpec.title : `${qSpec.shortLabel} (${state.dataSource.toUpperCase()} Mode)`}
            </strong>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Click any construct tile or stoichiometry bin to jump directly to its Single-Circuit Inspector.
            </div>
          </div>
          <div>
            ${state.viewType === "portraits"
              ? `<canvas id="lib6x6-cbar" data-w="270" data-h="28" width="270" height="28"></canvas>`
              : `<div class="quad-legend-row">
                   <span><span class="quad-dot q1"></span>Q1: Slow+HiLoad</span>
                   <span><span class="quad-dot q3"></span>Q3: Slow+LoLoad</span>
                   <span><span class="quad-dot q2"></span>Q2: Fast+HiLoad</span>
                   <span><span class="quad-dot q4"></span>Q4: Fast+LoLoad</span>
                 </div>`
            }
          </div>
        </div>

        <div class="supergrid-2x2">
          ${buildSuperQuadHTML("WT", "inverse", "wt-inv", "WT INVERSE (PKAsub on MinD | FHA1-WT on Cargo)")}
          ${buildSuperQuadHTML("WT", "upright", "wt-upr", "WT UPRIGHT (FHA1-WT on MinD | PKAsub on Cargo)")}
          ${buildSuperQuadHTML("R70A", "inverse", "r70a-inv", "R70A INVERSE (PKAsub on MinD | FHA1-R70A on Cargo)")}
          ${buildSuperQuadHTML("R70A", "upright", "r70a-upr", "R70A UPRIGHT (FHA1-R70A on MinD | PKAsub on Cargo)")}
        </div>

        <!-- T->A Negative Controls Strip -->
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <span class="badge badge-tamut">NEGATIVE CONTROLS</span>
            <strong style="margin-left:8px;">1×1 &amp; 2×2 Non-Phosphorylatable PKAsub(T→A) Inverse Controls</strong>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Abolishes PKA phosphorylation of PKAsub on MinD (<code>1x1_TAmut_inverse</code> &amp; <code>2x2_TAmut_inverse</code>), confirming that cAMP-induced coupling, FM shifts, and carrier power gain require phospho-threonine binding.
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            ${["1x1_TAmut_inverse", "2x2_TAmut_inverse"].map(cid => `
              <div class="tile-card" style="padding:5px;">
                <div class="tile-card-header" style="font-size:10.5px;">
                  <span>${cid.replace(/_/g, " ")}</span>
                  <button class="zoom-btn-mini" data-open-single="${cid}">↗</button>
                </div>
                <canvas id="lib6x6-canvas-${cid}" data-w="${sz6.w}" data-h="${sz6.h}" width="${sz6.w}" height="${sz6.h}" style="cursor:pointer;"></canvas>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    if (state.viewType === "portraits") {
      const cbar = document.getElementById("lib6x6-cbar");
      if (cbar) window.renderColorbarCanvas(cbar, pSpec);
    }

    for (const c of getOrderedConstructs(true)) {
      const cvs = document.getElementById(`lib6x6-canvas-${c.id}`);
      if (!cvs) continue;
      if (state.viewType === "portraits") {
        window.renderPhasePortraitCanvas(cvs, c, pSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: false,
          showSummaryBadge: true
        });
        window.attachPortraitInteractivity(cvs, handleBinHover, clicked => {
          syncFamilyValencyFromCircuit(c.id);
          state.selectedBin = { bx: clicked.bx, by: clicked.by, quadrant: clicked.quadrant };
          state.mode = "single";
          updateUI();
        });
      } else {
        window.renderQuadrantDoseCurveCanvas(cvs, c, {
          dataSource: state.dataSource,
          metricKey: state.quadMetricKey,
          showAxesLabels: false,
          showAnnotationBox: true
        });
        cvs.addEventListener("click", () => {
          syncFamilyValencyFromCircuit(c.id);
          state.mode = "single";
          updateUI();
        });
      }
    }

    container.querySelectorAll("[data-open-single]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.openSingle);
        state.mode = "single";
        updateUI();
      });
    });
  }

  /**
   * MODE 4: Side-by-Side Pairwise Comparator
   */
  function renderPairwiseMode(container) {
    const cA = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_upright"];
    const cB = CONSTRUCTS[state.selectedCircuitB] || CONSTRUCTS["2x2_WT_inverse"];
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];

    const pairPresets = [
      { label: "2×2 WT Upright vs 2×2 WT Inverse", a: "2x2_WT_upright", b: "2x2_WT_inverse" },
      { label: "3×3 WT Upright vs 3×3 R70A Upright", a: "3x3_WT_upright", b: "3x3_R70A_upright" },
      { label: "3×2 WT Inverse vs 3×3 WT Inverse (Wave Awakening)", a: "3x2_WT_inverse", b: "3x3_WT_inverse" },
      { label: "2×2 WT Inverse vs 2×2 T→A Inverse (Control)", a: "2x2_WT_inverse", b: "2x2_TAmut_inverse" },
      { label: "1×1 WT Inverse vs 1×1 T→A Inverse (Control)", a: "1x1_WT_inverse", b: "1x1_TAmut_inverse" },
      { label: "1×1 WT Upright vs 3×3 WT Upright (Valency Scaling)", a: "1x1_WT_upright", b: "3x3_WT_upright" }
    ];

    container.innerHTML = `
      <div class="fov-card">
        <div class="fov-card-header">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span class="ctrl-label">Pair Presets:</span>
            ${pairPresets.map(p => `
              <button class="pill-btn ${cA.id === p.a && cB.id === p.b ? "active" : ""}" data-pair-a="${p.a}" data-pair-b="${p.b}">
                ${p.label}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- 3-Column Phase Portrait Comparison: Circuit A | Difference Δ(A - B) | Circuit B -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(330px, 1fr));gap:14px;margin-bottom:16px;">
          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#60a5fa;">Circuit A: ${cA.valency} ${cA.mutation} ${cA.topology.toUpperCase()} (${cA.design_id})</span>
              <span class="mono-tag">${pSpec.shortLabel}</span>
            </div>
            <canvas id="pair-pcanvas-a" width="340" height="280"></canvas>
            <canvas id="pair-pcbar-a" width="310" height="30"></canvas>
          </div>

          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#fde047;">Difference Map: Δ(Circuit A − Circuit B)</span>
              <span class="mono-tag">Red: A &gt; B | Blue: B &gt; A</span>
            </div>
            <canvas id="pair-pcanvas-diff" width="340" height="280"></canvas>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted);margin-top:6px;">
              Bin-by-bin subtraction across shared (bx, by) coordinates
            </div>
          </div>

          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#f87171;">Circuit B: ${cB.valency} ${cB.mutation} ${cB.topology.toUpperCase()} (${cB.design_id})</span>
              <span class="mono-tag">${pSpec.shortLabel}</span>
            </div>
            <canvas id="pair-pcanvas-b" width="340" height="280"></canvas>
            <canvas id="pair-pcbar-b" width="310" height="30"></canvas>
          </div>
        </div>

        <!-- 2-Column 4-Quadrant Dose-Response Curves + Schematics + Tables -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="tile-card" style="align-items:stretch;">
            <div class="tile-card-header">
              <span style="color:#60a5fa;">Circuit A — 4-Quadrant ${qSpec.shortLabel} (${state.dataSource.toUpperCase()})</span>
              <span class="mono-tag">${cA.valency} ${cA.mutation} ${cA.topology.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:10px;">
              <canvas id="pair-qcanvas-a" width="300" height="235"></canvas>
              ${window.renderAntennaSchematicHTML(cA, true)}
            </div>
            ${buildQuadrantFitTableHTML(cA, state.quadMetricKey, state.dataSource)}
          </div>

          <div class="tile-card" style="align-items:stretch;">
            <div class="tile-card-header">
              <span style="color:#f87171;">Circuit B — 4-Quadrant ${qSpec.shortLabel} (${state.dataSource.toUpperCase()})</span>
              <span class="mono-tag">${cB.valency} ${cB.mutation} ${cB.topology.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:10px;">
              <canvas id="pair-qcanvas-b" width="300" height="235"></canvas>
              ${window.renderAntennaSchematicHTML(cB, true)}
            </div>
            ${buildQuadrantFitTableHTML(cB, state.quadMetricKey, state.dataSource)}
          </div>
        </div>
      </div>
    `;

    const pA = document.getElementById("pair-pcanvas-a");
    const pB = document.getElementById("pair-pcanvas-b");
    const pD = document.getElementById("pair-pcanvas-diff");
    const cbA = document.getElementById("pair-pcbar-a");
    const cbB = document.getElementById("pair-pcbar-b");

    if (pA) {
      window.renderPhasePortraitCanvas(pA, cA, pSpec, { confidenceMode: state.confidenceMode, showAxesLabels: true });
      window.attachPortraitInteractivity(pA, handleBinHover, null);
    }
    if (pB) {
      window.renderPhasePortraitCanvas(pB, cB, pSpec, { confidenceMode: state.confidenceMode, showAxesLabels: true });
      window.attachPortraitInteractivity(pB, handleBinHover, null);
    }
    if (pD) window.renderDifferencePortraitCanvas(pD, cA, cB, pSpec, { showAxesLabels: true });
    if (cbA) window.renderColorbarCanvas(cbA, pSpec);
    if (cbB) window.renderColorbarCanvas(cbB, pSpec);

    const qA = document.getElementById("pair-qcanvas-a");
    const qB = document.getElementById("pair-qcanvas-b");
    if (qA) window.renderQuadrantDoseCurveCanvas(qA, cA, { dataSource: state.dataSource, metricKey: state.quadMetricKey });
    if (qB) window.renderQuadrantDoseCurveCanvas(qB, cB, { dataSource: state.dataSource, metricKey: state.quadMetricKey });

    container.querySelectorAll("[data-pair-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.pairA);
        state.selectedCircuitB = btn.dataset.pairB;
        updateUI();
      });
    });
  }

  /**
   * MODE 5: Target Response Finder ("Inverse Design")
   */
  function renderTargetMode(container) {
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const refConstruct = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_upright"];
    const ranked = window.rankCircuitsByTarget(CONSTRUCTS, state.targetRegionSpec, state.targetCriteria, false);
    const topMatches = ranked.slice(0, 9);
    const critKeys = Object.keys(state.targetCriteria);

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:390px 1fr;gap:16px;align-items:start;">
        <!-- Left Column: Presets, Interactive 2D Pad, Sliders -->
        <div class="fov-card">
          <div class="fov-card-header">
            <strong style="color:var(--accent);">1. Biophysical Archetype Presets</strong>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${window.TARGET_PRESETS.map(pr => `
              <button class="pill-btn ${state.targetPresetId === pr.id ? "active" : ""}" data-preset-id="${pr.id}">
                ${pr.name}
              </button>
            `).join("")}
          </div>
          <div style="font-size:12px;color:var(--muted);background:var(--panel-deep);padding:8px 10px;border-radius:6px;border:1px solid var(--border);margin-bottom:14px;">
            ${(window.TARGET_PRESETS.find(p => p.id === state.targetPresetId) || {}).desc || "Custom user-defined target specification."}
          </div>

          <div class="fov-card-header">
            <strong style="color:var(--accent);">2. Click Target Region on 2D Stoichiometry Pad</strong>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q1_Slow_HiLoad" ? "active" : ""}" data-reg-q="Q1_Slow_HiLoad">Q1 (Slow+HiLoad)</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q3_Slow_LoLoad" ? "active" : ""}" data-reg-q="Q3_Slow_LoLoad">Q3 (Slow+LoLoad)</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q2_Fast_HiLoad" ? "active" : ""}" data-reg-q="Q2_Fast_HiLoad">Q2 (Fast+HiLoad)</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q4_Fast_LoLoad" ? "active" : ""}" data-reg-q="Q4_Fast_LoLoad">Q4 (Fast+LoLoad)</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "all" ? "active" : ""}" data-reg-all="1">All Bins</button>
          </div>
          <div style="display:flex;justify-content:center;margin-bottom:14px;">
            <canvas id="target-pad-canvas" width="330" height="270" style="cursor:crosshair;"></canvas>
          </div>

          <div class="fov-card-header">
            <strong style="color:var(--accent);">3. Target Feature Specifications</strong>
          </div>
          ${critKeys.map(k => {
            const cObj = state.targetCriteria[k];
            return `
              <div class="target-slider-row" style="opacity:${cObj.enabled ? "1.0" : "0.5"};">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:4px;">
                  <label style="cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" class="crit-cb" data-crit-key="${k}" ${cObj.enabled ? "checked" : ""}/>
                    ${cObj.label}
                  </label>
                  <span style="font-family:var(--font-mono);color:var(--accent);" id="crit-lbl-${k}">
                    ${cObj.target.toFixed(cObj.step < 0.1 ? 2 : 1)}${cObj.unit}
                  </span>
                </div>
                <input type="range" class="crit-sl" data-crit-key="${k}" min="${cObj.min}" max="${cObj.max}" step="${cObj.step}" value="${cObj.target}"/>
              </div>
            `;
          }).join("")}
        </div>

        <!-- Right Column: Ranked Matches -->
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong style="font-size:14.5px;color:var(--accent);">Closest Matching Antenna-Circuit Designs (Top 9 of 36)</strong>
              <div style="font-size:12px;color:var(--muted);">
                Evaluated in <strong>${state.targetRegionSpec.mode === "quadrant" ? state.targetRegionSpec.quadrant.replace(/_/g, " ") : (state.targetRegionSpec.mode === "bin" ? `Stoichiometry Bin (${state.targetRegionSpec.bx}, ${state.targetRegionSpec.by}) ± 1` : "All Populated Bins")}</strong>
              </div>
            </div>
          </div>

          <div class="portrait-grid-9">
            ${topMatches.map((item, idx) => {
              const mc = item.construct;
              const st = item.stats;
              return `
                <div class="tile-card ${idx === 0 ? "active-metric" : ""}" style="align-items:stretch;">
                  <div class="tile-card-header">
                    <span>#${idx + 1} — ${mc.valency} ${mc.mutation} ${mc.topology.toUpperCase()}</span>
                    <span class="badge ${getBadgeClassForConstruct(mc)}">${item.matchScore.toFixed(1)}% Match</span>
                  </div>
                  <div style="display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center;">
                    <canvas id="match-canvas-${mc.id}" width="150" height="130"></canvas>
                    <div style="font-family:var(--font-mono);font-size:11px;line-height:1.5;color:var(--text);">
                      <div><span style="color:var(--muted);">C₅ₘₘ / C₀:</span> <strong>${formatNum(st.coup_5mM, 2)}</strong> / ${formatNum(st.coup_y0, 2)}</div>
                      <div><span style="color:var(--muted);">ΔC / EC₅₀:</span> <strong>${formatNum(st.coup_dy, 2, "", true)}</strong> / ${formatNum(st.coup_ec50, 2, "mM")}</div>
                      <div><span style="color:var(--muted);">ΔF₅ₘₘ:</span> <strong style="color:#fbbf24;">${formatNum(st.fm_5mM_pct, 1, "%", true)}</strong></div>
                      <div><span style="color:var(--muted);">ΔD₅ₘₘ:</span> <strong style="color:#c084fc;">${formatNum(st.cr_5mM_pct, 1, "%", true)}</strong></div>
                      <div><span style="color:var(--muted);">ΔOsc%:</span> <strong>${formatNum(st.osc_dy_pct, 1, "%", true)}</strong></div>
                      <button class="zoom-btn-mini" data-open-single="${mc.id}" style="margin-top:6px;width:100%;padding:4px;">Open Inspector ↗</button>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;

    const padCvs = document.getElementById("target-pad-canvas");
    if (padCvs) {
      window.renderPhasePortraitCanvas(padCvs, refConstruct, pSpec, {
        confidenceMode: state.confidenceMode,
        showAxesLabels: true,
        showSummaryBadge: false,
        highlightBin: state.targetRegionSpec.mode === "bin" ? { bx: state.targetRegionSpec.bx, by: state.targetRegionSpec.by } : null,
        highlightQuadrant: state.targetRegionSpec.mode === "quadrant" ? state.targetRegionSpec.quadrant : null
      });
      window.attachPortraitInteractivity(padCvs, handleBinHover, clicked => {
        state.targetRegionSpec = { mode: "bin", bx: clicked.bx, by: clicked.by, quadrant: clicked.quadrant };
        state.targetPresetId = "custom";
        updateUI();
      });
    }

    for (const item of topMatches) {
      const mc = item.construct;
      const mCvs = document.getElementById(`match-canvas-${mc.id}`);
      if (mCvs) {
        window.renderPhasePortraitCanvas(mCvs, mc, pSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: false,
          showSummaryBadge: false,
          highlightBin: state.targetRegionSpec.mode === "bin" ? { bx: state.targetRegionSpec.bx, by: state.targetRegionSpec.by } : null,
          highlightQuadrant: state.targetRegionSpec.mode === "quadrant" ? state.targetRegionSpec.quadrant : null
        });
      }
    }

    container.querySelectorAll("[data-preset-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pr = window.TARGET_PRESETS.find(p => p.id === btn.dataset.presetId);
        if (!pr) return;
        state.targetPresetId = pr.id;
        state.targetRegionSpec = { mode: pr.regionMode || "quadrant", quadrant: pr.quadrant || "Q1_Slow_HiLoad", bx: 2, by: 7 };
        for (const k of critKeys) {
          if (pr.criteria[k]) {
            state.targetCriteria[k].enabled = true;
            state.targetCriteria[k].target = pr.criteria[k].target;
          } else {
            state.targetCriteria[k].enabled = false;
          }
        }
        updateUI();
      });
    });

    container.querySelectorAll("[data-reg-q]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.targetRegionSpec = { mode: "quadrant", quadrant: btn.dataset.regQ, bx: null, by: null };
        updateUI();
      });
    });
    const btnAll = container.querySelector("[data-reg-all]");
    if (btnAll) {
      btnAll.addEventListener("click", () => {
        state.targetRegionSpec = { mode: "all", quadrant: null, bx: null, by: null };
        updateUI();
      });
    }

    container.querySelectorAll(".crit-cb").forEach(cb => {
      cb.addEventListener("change", () => {
        state.targetCriteria[cb.dataset.critKey].enabled = cb.checked;
        state.targetPresetId = "custom";
        updateUI();
      });
    });

    container.querySelectorAll(".crit-sl").forEach(sl => {
      sl.addEventListener("input", () => {
        const k = sl.dataset.critKey;
        const cObj = state.targetCriteria[k];
        cObj.target = parseFloat(sl.value);
        cObj.enabled = true;
        const lbl = document.getElementById(`crit-lbl-${k}`);
        if (lbl) lbl.textContent = `${cObj.target.toFixed(cObj.step < 0.1 ? 2 : 1)}${cObj.unit}`;
      });
      sl.addEventListener("change", () => {
        state.targetPresetId = "custom";
        updateUI();
      });
    });

    container.querySelectorAll("[data-open-single]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.openSingle);
        state.mode = "single";
        updateUI();
      });
    });
  }

  /**
   * MODE 6: Sortable 38-Construct Library Table (Modeled after Mode 5 in H9_FOV_Physiology_Atlas_Viewer.html)
   */
  function renderSortableTableMode(container) {
    const rowsData = getOrderedConstructs(true).map(c => {
      const gs = c.global_summary || {};
      const q1Coup = (((c.quadrants_pixel || {}).Q1_Slow_HiLoad || {}).metrics || {}).coupling?.fit || {};
      const q4Coup = (((c.quadrants_pixel || {}).Q4_Fast_LoLoad || {}).metrics || {}).coupling?.fit || {};
      return {
        id: c.id,
        design_id: c.design_id,
        valency: c.valency,
        family: `${c.mutation} ${c.topology.toUpperCase()}`,
        badgeClass: getBadgeClassForConstruct(c),
        c0_basal: gs.c0_basal ?? -999,
        c5mM_sat: gs.c5mM_sat ?? -999,
        delta_coup: gs.delta_coup ?? -999,
        q1_ec50: q1Coup.ec50 ?? 999,
        q4_c5mM: q4Coup.y5mM ?? -999,
        fm_5mM_pct: gs.fm_5mM_pct ?? -999,
        cr_5mM_pct: gs.cr_5mM_pct ?? -999,
        load_5mM_fold: gs.load_5mM_fold ?? -999,
        active_cells_5mM_pct: gs.active_cells_5mM_pct ?? -999,
        cell_territory_5mM_pct: gs.cell_territory_5mM_pct ?? -999,
        n_cells_total: gs.n_cells_total ?? 0
      };
    });

    rowsData.sort((a, b) => {
      const va = a[state.sortCol];
      const vb = b[state.sortCol];
      if (typeof va === "string") return state.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return state.sortAsc ? va - vb : vb - va;
    });

    const fmtCell = (v, dec = 2, u = "", signed = false) => {
      if (v === null || v === undefined || Math.abs(v) >= 900) return "—";
      return formatNum(v, dec, u, signed);
    };

    const trHTML = rowsData.map(r => `
      <tr data-jump-cid="${r.id}" style="cursor:pointer;">
        <td><span class="badge ${r.badgeClass}">${r.family}</span></td>
        <td><strong>${r.valency}</strong></td>
        <td><code>${r.design_id}</code></td>
        <td style="color:#fbbf24;">${fmtCell(r.c0_basal, 3)}</td>
        <td style="color:#38bdf8;font-weight:700;">${fmtCell(r.c5mM_sat, 3)}</td>
        <td style="color:#34d399;font-weight:700;">${fmtCell(r.delta_coup, 3, "", true)}</td>
        <td>${fmtCell(r.q1_ec50, 2, " mM")}</td>
        <td style="color:#34d399;">${fmtCell(r.q4_c5mM, 3)}</td>
        <td style="color:${r.fm_5mM_pct >= 0 ? "#f87171" : "#60a5fa"};font-weight:700;">${fmtCell(r.fm_5mM_pct, 1, "%", true)}</td>
        <td style="color:#c084fc;font-weight:700;">${fmtCell(r.cr_5mM_pct, 1, "%", true)}</td>
        <td>${fmtCell(r.load_5mM_fold, 2, "×")}</td>
        <td>${fmtCell(r.active_cells_5mM_pct, 1, "%")}</td>
        <td>${fmtCell(r.cell_territory_5mM_pct, 1, "%")}</td>
        <td>${r.n_cells_total.toLocaleString()}</td>
      </tr>
    `).join("");

    container.innerHTML = `
      <p style="color:var(--muted);margin-top:0;font-size:12.5px;">
        Click any column header to sort all 38 constructs (36 active + 2 T→A controls), or click any row to jump directly to its Single-Circuit Inspector.
      </p>
      <table class="fov-table">
        <thead>
          <tr>
            <th data-sort="family">Family</th>
            <th data-sort="valency">Valency</th>
            <th data-sort="design_id">Design ID</th>
            <th data-sort="c0_basal">Basal C₀ (0 mM)</th>
            <th data-sort="c5mM_sat">Sat. C₅ₘₘ (5 mM)</th>
            <th data-sort="delta_coup">Inducible ΔC</th>
            <th data-sort="q1_ec50">Q1 Hill EC₅₀</th>
            <th data-sort="q4_c5mM">Q4 Fast C₅ₘₘ</th>
            <th data-sort="fm_5mM_pct">5 mM ΔF%</th>
            <th data-sort="cr_5mM_pct">5 mM ΔD_amp%</th>
            <th data-sort="load_5mM_fold">Loading Fold</th>
            <th data-sort="active_cells_5mM_pct">Active Cells (5 mM)</th>
            <th data-sort="cell_territory_5mM_pct">Wave Territory f_osc</th>
            <th data-sort="n_cells_total">Total ultrack Cells</th>
          </tr>
        </thead>
        <tbody>${trHTML}</tbody>
      </table>
    `;

    container.querySelectorAll("[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (state.sortCol === col) state.sortAsc = !state.sortAsc;
        else { state.sortCol = col; state.sortAsc = false; }
        updateUI();
      });
    });

    container.querySelectorAll("[data-jump-cid]").forEach(tr => {
      tr.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(tr.dataset.jumpCid);
        state.mode = "single";
        updateUI();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  /**
   * Master UI render dispatcher
   */
  function updateUI() {
    if (tooltipEl) tooltipEl.style.display = "none";
    renderControlBars();

    const container = document.getElementById("view-container");
    if (!container) return;

    if (state.mode === "single") {
      renderSingleMode(container);
    } else if (state.mode === "family3x3") {
      renderFamily3x3Mode(container);
    } else if (state.mode === "library6x6") {
      renderLibrary6x6Mode(container);
    } else if (state.mode === "pairwise") {
      renderPairwiseMode(container);
    } else if (state.mode === "target") {
      renderTargetMode(container);
    } else if (state.mode === "table") {
      renderSortableTableMode(container);
    }
  }

  // Bind top header mode tabs & keyboard shortcuts
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.mode;
        updateUI();
      });
    });

    window.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "1") { state.familyId = "WT_upright"; syncCircuitFromFamilyValency(); updateUI(); }
      else if (e.key === "2") { state.familyId = "WT_inverse"; syncCircuitFromFamilyValency(); updateUI(); }
      else if (e.key === "3") { state.familyId = "R70A_upright"; syncCircuitFromFamilyValency(); updateUI(); }
      else if (e.key === "4") { state.familyId = "R70A_inverse"; syncCircuitFromFamilyValency(); updateUI(); }
      else if (e.key === "ArrowRight") {
        const idx = VALENCIES_9.indexOf(state.valency);
        if (idx >= 0) {
          state.valency = VALENCIES_9[(idx + 1) % VALENCIES_9.length];
          syncCircuitFromFamilyValency();
          updateUI();
        }
      } else if (e.key === "ArrowLeft") {
        const idx = VALENCIES_9.indexOf(state.valency);
        if (idx >= 0) {
          state.valency = VALENCIES_9[(idx - 1 + VALENCIES_9.length) % VALENCIES_9.length];
          syncCircuitFromFamilyValency();
          updateUI();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const mKeys = window.PORTRAIT_METRICS.map(m => m.key);
        const curIdx = mKeys.indexOf(state.portraitMetricKey);
        const nextIdx = e.key === "ArrowDown"
          ? (curIdx + 1) % mKeys.length
          : (curIdx - 1 + mKeys.length) % mKeys.length;
        state.portraitMetricKey = mKeys[nextIdx];
        const mSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey];
        if (mSpec && mSpec.quadCurveKey) state.quadMetricKey = mSpec.quadCurveKey;
        if (state.focus.startsWith("m_")) state.focus = `m_${state.portraitMetricKey}`;
        updateUI();
      } else if (e.key.toLowerCase() === "c") {
        state.confidenceMode = state.confidenceMode === "vsup_contour" ? "vsup_only" : "vsup_contour";
        updateUI();
      } else if (e.key.toLowerCase() === "m") {
        state.dataSource = state.dataSource === "pixel" ? "cell" : "pixel";
        updateUI();
      }
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateUI();
      }, 150);
    });

    updateUI();
  });
})();
