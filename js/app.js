/**
 * app.js
 * Main controller for the Cellstream Antenna-Circuit Explorer.
 * Layout:
 *   - Top Line HUD Bar (`#hud-telemetry`): Active construct summary & live clicked-bin telemetry
 *   - Left Sidebar (`#sidebar-controls` + `#sidebar-architecture`): Smart pulldown selectors,
 *     segmented toggles, and pinned Active Architecture molecular schematic
 *   - Right Main Viewing Area (`#main-viewer` -> `#view-container`):
 *       1. Single-Circuit Inspector ("single" — defaults to 2×2 Dashboard: Portrait, 4-Quad+Bin Curve,
 *          Fit Information Table, and Clicked-Bin Co-Dosing Curve; also supports All 9 Portraits 3×3 & All 6 Curves)
 *       2. 3×3 Family Explorer ("family3x3")
 *       3. Full 4×(3×3) Library ("library6x6")
 *       4. Side-by-Side Circuit Comparator ("pairwise")
 *       5. Target Response Finder ("target")
 *       6. Sortable 38-Construct Summary Table ("table")
 */

(function() {
  const DATA = window.ANTENNA_LIBRARY_DATA;
  if (!DATA || !DATA.constructs) {
    console.error("ANTENNA_LIBRARY_DATA failed to load.");
    return;
  }

  const CONSTRUCTS = DATA.constructs;
  const PROJECTION_DEFS = DATA.projection_defs || {};
  const PROJECTION_ORDER = ["ed_vs_load", "damp_vs_cargo", "d_vs_e", "d_vs_cargo"];

  const FAMILIES = [
    { id: "WT_upright",   mutation: "WT",    topology: "upright", label: "WT Upright",   badgeClass: "badge-wt-upr",   subtitle: "FHA1(WT) on MinD Carrier | PKAsub on Diffusive GFP Cargo" },
    { id: "WT_inverse",   mutation: "WT",    topology: "inverse", label: "WT Inverse",   badgeClass: "badge-wt-inv",   subtitle: "PKAsub on MinD Carrier | FHA1(WT) on Diffusive GFP Cargo" },
    { id: "R70A_upright", mutation: "R70A",  topology: "upright", label: "R70A Upright", badgeClass: "badge-r70a-upr", subtitle: "FHA1(R70A) Weak Reader on MinD | PKAsub on GFP Cargo" },
    { id: "R70A_inverse", mutation: "R70A",  topology: "inverse", label: "R70A Inverse", badgeClass: "badge-r70a-inv", subtitle: "PKAsub on MinD Carrier | FHA1(R70A) Weak Reader on GFP Cargo" },
    { id: "TAmut_ctrl",   mutation: "TAmut", topology: "inverse", label: "T→A Controls", badgeClass: "badge-tamut",    subtitle: "Non-Phosphorylatable PKAsub(T→A) Negative Controls (1×1 & 2×2 Inverse)" }
  ];

  const VALENCIES_9 = ["1x1", "1x2", "1x3", "2x1", "2x2", "2x3", "3x1", "3x2", "3x3"];
  const VALENCY_GRID = [
    ["1x1", "1x2", "1x3"],
    ["2x1", "2x2", "2x3"],
    ["3x1", "3x2", "3x3"]
  ];

  const state = {
    mode: "single",                 // "single" | "family3x3" | "library6x6" | "pairwise" | "target" | "table"
    familyId: "WT_inverse",
    valency: "2x2",
    selectedCircuitA: "2x2_WT_inverse",
    selectedCircuitB: "2x2_WT_upright",

    // Active 2D Coordinate Projection ("ed_vs_load" | "damp_vs_cargo" | "d_vs_e" | "d_vs_cargo")
    projectionKey: "ed_vs_load",

    // Single-Circuit sub-view layout ("dashboard_2x2" matches the user's mockup!)
    focus: "dashboard_2x2",         // "dashboard_2x2" | "all_portraits" | "all_quads" | "pair_metrics"
    pairMetricLeft: "coup_5mM",
    pairMetricRight: "fm_5mM_pct",
    scalePct: 100,                  // User scale multiplier (65% to 140%) on top of viewport-adaptive sizing

    // Global plot settings
    viewType: "portraits",          // "portraits" | "quadrants" (used in 3x3 Family & 6x6 Library modes)
    portraitMetricKey: "coup_5mM",
    quadMetricKey: "coupling",
    dataSource: "pixel",            // "pixel" | "cell"
    confidenceMode: "vsup_contour", // "vsup_contour" | "vsup_only" | "raw"

    // Interactive Clicked-Bin state (persists & updates live without layout jump)
    selectedBin: { bx: 5, by: 5, quadrant: "Q2_Fast_HiLoad" },

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

  /**
   * Synchronizes the active 2D coordinate projection (`state.projectionKey`) across all constructs
   * and updates `window.ACTIVE_PROJECTION_SPEC` + `DATA.grid_spec`.
   */
  function syncActiveProjection() {
    const pSpec = PROJECTION_DEFS[state.projectionKey] || PROJECTION_DEFS.ed_vs_load || {
      key: "ed_vs_load",
      short_title: "Cargo/D_amp vs E/D (Stoichiometric Ratio)",
      subtitle: "X: Δlog₁₀(MinE/MinD) vs Y: Δlog₁₀(Cargo/D_amp,0)",
      x_label: "Δlog₁₀(MinE / MinD) [Driver Frequency Axis]",
      y_label: "Δlog₁₀(Cargo / D_amp,0) [Relative Client Load]",
      x_canvas_label: "Δlog₁₀(MinE / MinD) [Slow ← 0 → Fast]",
      y_canvas_label: "Δlog₁₀(Cargo / D_amp)",
      x_short: "Δlog₁₀(E/D)",
      y_short: "Δlog₁₀(Cargo/D)",
      x_edges: [-0.32, -0.256, -0.192, -0.128, -0.064, 0, 0.064, 0.128, 0.192, 0.256, 0.32],
      y_edges: [-0.42, -0.336, -0.252, -0.168, -0.084, 0, 0.084, 0.168, 0.252, 0.336, 0.42],
      x_ticks: [["-0.32", 0.0], ["0.0", 0.5], ["+0.32", 1.0]],
      y_ticks: [["-0.4", 0.024], ["0.0", 0.5], ["+0.4", 0.976]],
      quad_labels: {
        Q1_Slow_HiLoad: "Q1: Slow (Hi D/E) + Hi Load",
        Q3_Slow_LoLoad: "Q3: Slow (Hi D/E) + Lo Load",
        Q2_Fast_HiLoad: "Q2: Fast (Hi E/D) + Hi Load",
        Q4_Fast_LoLoad: "Q4: Fast (Hi E/D) + Lo Load"
      },
      quad_short: {
        Q1_Slow_HiLoad: "Q1: Slow+HiLoad",
        Q3_Slow_LoLoad: "Q3: Slow+LoLoad",
        Q2_Fast_HiLoad: "Q2: Fast+HiLoad",
        Q4_Fast_LoLoad: "Q4: Fast+LoLoad"
      }
    };
    window.ACTIVE_PROJECTION_SPEC = pSpec;
    if (DATA.grid_spec) {
      DATA.grid_spec.x_edges = pSpec.x_edges;
      DATA.grid_spec.y_edges = pSpec.y_edges;
      DATA.grid_spec.x_label = pSpec.x_label;
      DATA.grid_spec.y_label = pSpec.y_label;
    }
    for (const c of Object.values(CONSTRUCTS)) {
      if (c && c.projections) {
        const projData = c.projections[state.projectionKey] || c.projections.ed_vs_load;
        if (projData) {
          c.bins_2d = projData.bins_2d || [];
          c.quadrants_pixel = projData.quadrants_pixel || {};
          c.quadrants_cell = projData.quadrants_cell || {};
        }
      }
    }
    return pSpec;
  }

  syncActiveProjection();

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
   * Computes viewport-adaptive (w, h) logical pixel dimensions for canvases inside `#main-viewer`
   * (accounting for the 300px Left Sidebar and 54px Top HUD bar).
   */
  function getAdaptiveTileSize(kind = "dashboard2x2") {
    const vw = Math.max(640, (window.innerWidth || 1440) - 335);
    const vh = Math.max(500, (window.innerHeight || 900) - 74);
    const sc = (state.scalePct || 100) / 100.0;

    if (kind === "dashboard2x2") {
      // 2x2 grid in Single-Circuit Inspector: 2 columns wide, 2 rows tall
      const availW = Math.floor((vw - 60) / 2.08);
      const availH = Math.floor((vh - 140) / 2.05);
      const baseH = Math.max(195, Math.min(310, Math.min(availH, Math.round(availW * 0.78))));
      const baseW = Math.round(baseH * 1.24);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "family3x3") {
      // Fit 3 rows + headers comfortably inside main viewer height & width
      const availW = Math.floor((vw - 110) / 3.15);
      const availH = Math.floor((vh - 125) / 3.0) - 30;
      const baseH = Math.max(135, Math.min(220, Math.min(availH, Math.round(availW * 0.82))));
      const baseW = Math.round(baseH * 1.22);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "single3x3") {
      // 3x3 grid of 9 phase portraits or 6 quadrant curves in Single-Circuit mode
      const availW = Math.floor((vw - 60) / 3.15);
      const availH = Math.floor((vh - 110) / 3.0) - 42;
      const baseH = Math.max(135, Math.min(210, Math.min(availH, Math.round(availW * 0.83))));
      const baseW = Math.round(baseH * 1.20);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "library6x6") {
      // 6 columns across (2 superquads x 3 cols)
      const availW = Math.floor((vw - 80) / 6.3);
      const availH = Math.floor((vh - 165) / 4.8);
      const baseW = Math.max(115, Math.min(185, Math.min(availW, Math.round(availH * 1.22))));
      const baseH = Math.round(baseW * 0.81);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    if (kind === "pairwise3col") {
      const availW = Math.floor((vw - 70) / 3.15);
      const availH = Math.floor((vh - 180) / 2.2);
      const baseW = Math.max(220, Math.min(340, Math.min(availW, Math.round(availH * 1.22))));
      const baseH = Math.round(baseW * 0.82);
      return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) };
    }
    return { w: Math.round(260 * sc), h: Math.round(210 * sc) };
  }

  // Tooltip manager for 2D Phase Portrait bins
  const tooltipEl = document.getElementById("portrait-tooltip");

  function getBinQuadKey(bx, by) {
    return bx < 5
      ? (by >= 5 ? "Q1_Slow_HiLoad" : "Q3_Slow_LoLoad")
      : (by >= 5 ? "Q2_Fast_HiLoad" : "Q4_Fast_LoLoad");
  }

  function handleBinHover(event, info) {
    if (!tooltipEl) return;
    if (!info) {
      tooltipEl.style.display = "none";
      return;
    }
    const { bx, by, bin, inCore, construct } = info;
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const xEdges = projSpec.x_edges || [-0.32, -0.256, -0.192, -0.128, -0.064, 0, 0.064, 0.128, 0.192, 0.256, 0.32];
    const yEdges = projSpec.y_edges || [-0.42, -0.336, -0.252, -0.168, -0.084, 0, 0.084, 0.168, 0.252, 0.336, 0.42];
    const xRanges = [xEdges[bx] ?? 0, xEdges[bx + 1] ?? 0];
    const yRanges = [yEdges[by] ?? 0, yEdges[by + 1] ?? 0];
    const qKey = getBinQuadKey(bx, by);
    const qLabel = (projSpec.quad_labels && projSpec.quad_labels[qKey]) || qKey;

    let html = `
      <div class="tt-title">${construct.valency} ${construct.mutation} ${construct.topology.toUpperCase()} — Bin (${bx}, ${by}) [Click to Plot Curve]</div>
      <div class="tt-row"><span>Projection:</span><span class="tt-val" style="color:var(--accent);">${projSpec.short_title}</span></div>
      <div class="tt-row"><span>Quadrant:</span><span class="tt-val">${qLabel}</span></div>
      <div class="tt-row"><span>${projSpec.x_short || "X"}:</span><span class="tt-val">[${xRanges[0].toFixed(2)}, ${xRanges[1].toFixed(2)}]</span></div>
      <div class="tt-row"><span>${projSpec.y_short || "Y"}:</span><span class="tt-val">[${yRanges[0].toFixed(2)}, ${yRanges[1].toFixed(2)}]</span></div>
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
   * 1. Renders the Top Line HUD Bar (`#hud-telemetry`)
   */
  function renderTopHud() {
    const hudEl = document.getElementById("hud-telemetry");
    if (!hudEl) return;

    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_inverse"];
    const gs = c.global_summary || {};
    const badgeCls = getBadgeClassForConstruct(c);
    const bx = state.selectedBin.bx;
    const by = state.selectedBin.by;
    const binObj = (c.bins_2d || []).find(b => b.bx === bx && b.by === by);
    const qKey = getBinQuadKey(bx, by);
    const qShort = (projSpec.quad_short && projSpec.quad_short[qKey]) ? projSpec.quad_short[qKey] : (bx < 5 ? (by >= 5 ? "Q1" : "Q3") : (by >= 5 ? "Q2" : "Q4"));

    hudEl.innerHTML = `
      <div class="hud-chip" style="border-color:#3b4c73;">
        <span class="hud-chip-lbl">Active Circuit</span>
        <span class="hud-chip-val">
          <span class="badge ${badgeCls}" style="margin-right:4px;">${c.valency} ${c.mutation} ${c.topology.toUpperCase()}</span>
          <span style="color:var(--muted);font-size:10.5px;">${c.plasmids}</span>
        </span>
      </div>
      <div class="hud-chip">
        <span class="hud-chip-lbl">2D Projection (Key: P)</span>
        <span class="hud-chip-val" style="color:var(--accent);font-size:11.5px;">${projSpec.short_title}</span>
      </div>
      <div class="hud-chip">
        <span class="hud-chip-lbl">Coupling C₀ → C₅ₘₘ (ΔC)</span>
        <span class="hud-chip-val">
          <span style="color:#fbbf24;">${c.is_clamped_0mM ? "Clamp" : formatNum(gs.c0_basal, 2)}</span>
          → <span style="color:#38bdf8;">${formatNum(gs.c5mM_sat, 2)}</span>
          <span style="color:#34d399;font-size:11px;">(${formatNum(gs.delta_coup, 2, "", true)})</span>
        </span>
      </div>
      <div class="hud-chip">
        <span class="hud-chip-lbl">Clock F₀ | 5mM ΔF%</span>
        <span class="hud-chip-val">
          ${formatNum(gs.f0_mHz, 1, "mHz")} |
          <span style="color:${(gs.fm_5mM_pct || 0) >= 0 ? "#f87171" : "#60a5fa"};">${formatNum(gs.fm_5mM_pct, 1, "%", true)}</span>
        </span>
      </div>
      <div class="hud-chip">
        <span class="hud-chip-lbl">5mM Carrier ΔD_amp</span>
        <span class="hud-chip-val" style="color:#c084fc;">${formatNum(gs.cr_5mM_pct, 1, "%", true)}</span>
      </div>
      <div class="hud-chip" style="border-color:var(--accent);">
        <span class="hud-chip-lbl" style="color:var(--accent);">Clicked Bin (${bx}, ${by}) · ${qShort}</span>
        <span class="hud-chip-val" id="hud-bin-readout" style="color:#38bdf8;">
          ${binObj ? `C: ${formatNum(binObj.coup_y0, 2)}→${formatNum(binObj.coup_5mM, 2)} | ΔF: ${formatNum(binObj.fm_5mM_pct, 1, "%", true)}` : "Unpopulated Bin"}
        </span>
      </div>
    `;
  }

  /**
   * 2. Renders the Left Sidebar (`#sidebar-controls` + `#sidebar-architecture`)
   *    using clean pulldowns and toggles, plus the pinned Active Architecture schematic at bottom!
   */
  function renderSidebar() {
    const sbCtrl = document.getElementById("sidebar-controls");
    const sbArch = document.getElementById("sidebar-architecture");
    if (!sbCtrl || !sbArch) return;

    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_inverse"];
    const allConstructs = getOrderedConstructs(true);

    // Build configuration options for current family
    let configOptionsHTML = "";
    if (state.familyId === "TAmut_ctrl") {
      configOptionsHTML = `
        <option value="1x1_TAmut_inverse" ${state.selectedCircuitA === "1x1_TAmut_inverse" ? "selected" : ""}>1×1 T→A Inverse (pCL334)</option>
        <option value="2x2_TAmut_inverse" ${state.selectedCircuitA === "2x2_TAmut_inverse" ? "selected" : ""}>2×2 T→A Inverse (pCL335)</option>
      `;
    } else {
      const fam = FAMILIES.find(f => f.id === state.familyId) || FAMILIES[0];
      configOptionsHTML = VALENCIES_9.map(v => {
        const [md, cg] = v.split("x");
        const cid = `${v}_${fam.mutation}_${fam.topology}`;
        const cObj = CONSTRUCTS[cid];
        const c5 = cObj?.global_summary?.c5mM_sat;
        const c5Txt = (c5 !== null && c5 !== undefined) ? ` — C₅ₘₘ=${c5.toFixed(2)}` : "";
        return `<option value="${v}" ${state.valency === v ? "selected" : ""}>${v} (${md}×MinD : ${cg}×Cargo)${c5Txt}</option>`;
      }).join("");
    }

    // Sub-view pulldown or plot-type toggle depending on mode
    let subViewControlHTML = "";
    if (state.mode === "single") {
      subViewControlHTML = `
        <div class="sb-group">
          <div class="sb-label"><span>Single-Viewer Layout</span></div>
          <select id="sb-sel-focus" class="sb-select">
            <option value="dashboard_2x2" ${state.focus === "dashboard_2x2" ? "selected" : ""}>2×2 Inspector Dashboard (Default)</option>
            <option value="all_portraits" ${state.focus === "all_portraits" ? "selected" : ""}>All 9 Phase Portraits (3×3 Grid)</option>
            <option value="all_quads" ${state.focus === "all_quads" ? "selected" : ""}>All 6 Quadrant Dose Curves (3×2)</option>
            <option value="pair_metrics" ${state.focus === "pair_metrics" ? "selected" : ""}>Side-by-Side Metric Pair (2 Portraits)</option>
          </select>
        </div>
      `;
    } else if (state.mode === "family3x3" || state.mode === "library6x6") {
      subViewControlHTML = `
        <div class="sb-group">
          <div class="sb-label"><span>Matrix Plot Representation</span></div>
          <div class="sb-seg-row">
            <button class="sb-seg-btn ${state.viewType === "portraits" ? "active" : ""}" data-sb-viewtype="portraits">2D Phase Portraits</button>
            <button class="sb-seg-btn ${state.viewType === "quadrants" ? "active" : ""}" data-sb-viewtype="quadrants">4-Quad Dose Curves</button>
          </div>
        </div>
      `;
    } else if (state.mode === "pairwise") {
      subViewControlHTML = `
        <div class="sb-group">
          <div class="sb-label">
            <span style="color:#f87171;">Compare Against (Circuit B)</span>
            <button class="zoom-btn-mini" id="sb-btn-swap-pair" title="Swap Circuit A and Circuit B">⇄ Swap</button>
          </div>
          <select id="sb-sel-circuit-b" class="sb-select">
            ${allConstructs.map(cb => `<option value="${cb.id}" ${cb.id === state.selectedCircuitB ? "selected" : ""}>${cb.valency} ${cb.mutation} ${cb.topology.toUpperCase()} (${cb.design_id})</option>`).join("")}
          </select>
        </div>
      `;
    }

    sbCtrl.innerHTML = `
      <div class="sb-section-title">
        <span>1. Navigation &amp; Selection</span>
        <span style="color:var(--muted);font-family:var(--font-mono);font-size:10px;">38 Constructs</span>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>Explorer View Mode</span></div>
        <select id="sb-sel-mode" class="sb-select">
          <option value="single" ${state.mode === "single" ? "selected" : ""}>1. Single-Circuit Inspector</option>
          <option value="family3x3" ${state.mode === "family3x3" ? "selected" : ""}>2. 3×3 Family Explorer</option>
          <option value="library6x6" ${state.mode === "library6x6" ? "selected" : ""}>3. Full 4×(3×3) Library</option>
          <option value="pairwise" ${state.mode === "pairwise" ? "selected" : ""}>4. Side-by-Side Comparator</option>
          <option value="target" ${state.mode === "target" ? "selected" : ""}>5. Target Response Finder</option>
          <option value="table" ${state.mode === "table" ? "selected" : ""}>6. Sortable 38-Construct Table</option>
        </select>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>Circuit Family (FHA1 × Topology)</span></div>
        <select id="sb-sel-family" class="sb-select">
          ${FAMILIES.map(f => `<option value="${f.id}" ${state.familyId === f.id ? "selected" : ""}>${f.label} — ${f.mutation === "TAmut" ? "Non-Phospho" : (f.topology === "upright" ? "Anchor FHA1" : "Anchor PKAsub")}</option>`).join("")}
        </select>
      </div>

      <div class="sb-group">
        <div class="sb-label">
          <span>Configuration (MinD × Cargo)</span>
          <span style="font-family:var(--font-mono);color:var(--accent);font-size:10.5px;">${c.design_id}</span>
        </div>
        <div class="sb-row-inline">
          <button class="sb-step-btn" id="sb-val-prev" title="Previous Valency (←)">◀</button>
          <select id="sb-sel-config" class="sb-select">
            ${configOptionsHTML}
          </select>
          <button class="sb-step-btn" id="sb-val-next" title="Next Valency (→)">▶</button>
        </div>
      </div>

      ${subViewControlHTML}

      <hr class="sb-divider" />

      <div class="sb-section-title">
        <span>2. Metric &amp; Display Options</span>
      </div>

      <div class="sb-group">
        <div class="sb-label">
          <span>2D Coordinate Projection</span>
          <span style="font-family:var(--font-mono);color:var(--accent);font-size:10px;">Key: P</span>
        </div>
        <select id="sb-sel-projection" class="sb-select" style="border-color:#3b4c73;">
          ${PROJECTION_ORDER.map((pk, idx) => {
            const p = PROJECTION_DEFS[pk] || {};
            return `<option value="${pk}" ${state.projectionKey === pk ? "selected" : ""}>${idx + 1}. ${p.short_title || pk}</option>`;
          }).join("")}
        </select>
        <div style="font-size:10.2px;color:var(--muted);font-family:var(--font-mono);margin-top:3px;line-height:1.35;">
          ${projSpec.subtitle || ""}
        </div>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>2D Phase Portrait Metric</span></div>
        <select id="sb-sel-pmetric" class="sb-select">
          ${window.PORTRAIT_METRICS.map((m, idx) => `<option value="${m.key}" ${state.portraitMetricKey === m.key ? "selected" : ""}>${idx + 1}. ${m.shortLabel}</option>`).join("")}
        </select>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>4-Quadrant Dose-Curve Metric</span></div>
        <select id="sb-sel-qmetric" class="sb-select">
          ${window.QUADRANT_METRICS.map((m, idx) => `<option value="${m.key}" ${state.quadMetricKey === m.key ? "selected" : ""}>${idx + 1}. ${m.shortLabel}</option>`).join("")}
        </select>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>Dose-Response Granularity (Key: M)</span></div>
        <div class="sb-seg-row">
          <button class="sb-seg-btn ${state.dataSource === "pixel" ? "active" : ""}" data-sb-source="pixel" title="64×64 Superpixel Wave Voxels">Pixel-Voxel</button>
          <button class="sb-seg-btn ${state.dataSource === "cell" ? "active" : ""}" data-sb-source="cell" title="Single-Cell ultrack Masks (1 Cell = 1 Vote)">ultrack Cell-Mask</button>
        </div>
      </div>

      <div class="sb-group">
        <div class="sb-label"><span>Response Zone Filter (Key: C)</span></div>
        <div class="sb-seg-row">
          <button class="sb-seg-btn ${state.confidenceMode === "vsup_contour" ? "active" : ""}" data-sb-conf="vsup_contour">Contour ON</button>
          <button class="sb-seg-btn ${state.confidenceMode === "vsup_only" ? "active" : ""}" data-sb-conf="vsup_only">Contour OFF</button>
          <button class="sb-seg-btn ${state.confidenceMode === "raw" ? "active" : ""}" data-sb-conf="raw">Raw</button>
        </div>
      </div>

      <div class="sb-group">
        <div class="sb-label">
          <span>Plot / Grid Scale</span>
          <span id="sb-scale-lbl" style="font-family:var(--font-mono);color:var(--accent);">${state.scalePct}%</span>
        </div>
        <div class="sb-row-inline">
          <input type="range" id="sb-slider-scale" min="65" max="140" step="5" value="${state.scalePct}" style="flex:1;accent-color:var(--accent);cursor:pointer;" />
          <button class="zoom-btn-mini" id="sb-btn-scale-reset" title="Reset to 100% Auto-Fit">100%</button>
        </div>
      </div>
    `;

    // Render pinned Active Architecture card at bottom of sidebar (matching user mockup!)
    sbArch.innerHTML = `
      <div class="sb-section-title" style="margin-bottom:6px;">
        <span>Active Architecture</span>
        <button class="zoom-btn-mini" id="sb-btn-compare-topo" title="Compare Upright vs Inverse Counterpart">
          ${c.mutation === "TAmut" ? "vs WT ⇄" : "Upright ⇄ Inverse"}
        </button>
      </div>
      ${window.renderAntennaSchematicHTML(c, true)}
    `;

    // Wire Sidebar Event Listeners
    const selMode = document.getElementById("sb-sel-mode");
    if (selMode) {
      selMode.addEventListener("change", e => {
        state.mode = e.target.value;
        updateUI();
      });
    }

    const selFam = document.getElementById("sb-sel-family");
    if (selFam) {
      selFam.addEventListener("change", e => {
        state.familyId = e.target.value;
        syncCircuitFromFamilyValency();
        updateUI();
      });
    }

    const selCfg = document.getElementById("sb-sel-config");
    if (selCfg) {
      selCfg.addEventListener("change", e => {
        if (state.familyId === "TAmut_ctrl") {
          syncFamilyValencyFromCircuit(e.target.value);
        } else {
          state.valency = e.target.value;
          syncCircuitFromFamilyValency();
        }
        updateUI();
      });
    }

    const btnPrevVal = document.getElementById("sb-val-prev");
    if (btnPrevVal) {
      btnPrevVal.addEventListener("click", () => {
        if (state.familyId === "TAmut_ctrl") {
          state.selectedCircuitA = state.selectedCircuitA === "1x1_TAmut_inverse" ? "2x2_TAmut_inverse" : "1x1_TAmut_inverse";
          state.valency = CONSTRUCTS[state.selectedCircuitA].valency;
        } else {
          const idx = VALENCIES_9.indexOf(state.valency);
          state.valency = VALENCIES_9[(idx - 1 + VALENCIES_9.length) % VALENCIES_9.length];
          syncCircuitFromFamilyValency();
        }
        updateUI();
      });
    }

    const btnNextVal = document.getElementById("sb-val-next");
    if (btnNextVal) {
      btnNextVal.addEventListener("click", () => {
        if (state.familyId === "TAmut_ctrl") {
          state.selectedCircuitA = state.selectedCircuitA === "1x1_TAmut_inverse" ? "2x2_TAmut_inverse" : "1x1_TAmut_inverse";
          state.valency = CONSTRUCTS[state.selectedCircuitA].valency;
        } else {
          const idx = VALENCIES_9.indexOf(state.valency);
          state.valency = VALENCIES_9[(idx + 1) % VALENCIES_9.length];
          syncCircuitFromFamilyValency();
        }
        updateUI();
      });
    }

    const selFocus = document.getElementById("sb-sel-focus");
    if (selFocus) {
      selFocus.addEventListener("change", e => {
        state.focus = e.target.value;
        updateUI();
      });
    }

    sbCtrl.querySelectorAll("[data-sb-viewtype]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.viewType = btn.dataset.sbViewtype;
        updateUI();
      });
    });

    const selCircuitB = document.getElementById("sb-sel-circuit-b");
    if (selCircuitB) {
      selCircuitB.addEventListener("change", e => {
        state.selectedCircuitB = e.target.value;
        updateUI();
      });
    }

    const btnSwapPair = document.getElementById("sb-btn-swap-pair");
    if (btnSwapPair) {
      btnSwapPair.addEventListener("click", () => {
        const tmp = state.selectedCircuitA;
        syncFamilyValencyFromCircuit(state.selectedCircuitB);
        state.selectedCircuitB = tmp;
        updateUI();
      });
    }

    const selProj = document.getElementById("sb-sel-projection");
    if (selProj) {
      selProj.addEventListener("change", e => {
        state.projectionKey = e.target.value;
        syncActiveProjection();
        updateUI();
      });
    }

    const selPmetric = document.getElementById("sb-sel-pmetric");
    if (selPmetric) {
      selPmetric.addEventListener("change", e => {
        state.portraitMetricKey = e.target.value;
        const mSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey];
        if (mSpec && mSpec.quadCurveKey) {
          state.quadMetricKey = mSpec.quadCurveKey;
        }
        updateUI();
      });
    }

    const selQmetric = document.getElementById("sb-sel-qmetric");
    if (selQmetric) {
      selQmetric.addEventListener("change", e => {
        state.quadMetricKey = e.target.value;
        if (state.quadMetricKey === "cell_territory_pct") {
          state.dataSource = "cell";
        }
        updateUI();
      });
    }

    sbCtrl.querySelectorAll("[data-sb-source]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.dataSource = btn.dataset.sbSource;
        updateUI();
      });
    });

    sbCtrl.querySelectorAll("[data-sb-conf]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.confidenceMode = btn.dataset.sbConf;
        updateUI();
      });
    });

    const sliderScale = document.getElementById("sb-slider-scale");
    if (sliderScale) {
      sliderScale.addEventListener("input", e => {
        state.scalePct = parseInt(e.target.value, 10);
        const lbl = document.getElementById("sb-scale-lbl");
        if (lbl) lbl.textContent = `${state.scalePct}%`;
      });
      sliderScale.addEventListener("change", () => updateUI());
    }

    const btnScaleReset = document.getElementById("sb-btn-scale-reset");
    if (btnScaleReset) {
      btnScaleReset.addEventListener("click", () => {
        state.scalePct = 100;
        updateUI();
      });
    }

    const btnCompTopo = document.getElementById("sb-btn-compare-topo");
    if (btnCompTopo) {
      btnCompTopo.addEventListener("click", () => {
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
  }

  /**
   * Builds a Quantitative 4-Quadrant + Clicked-Bin Hill Fit Table (`table.fov-table`).
   */
  function buildQuadrantFitTableHTML(construct, metricKey, dataSource, selectedBin = null) {
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const qLabels = projSpec.quad_labels || {};
    const qDict = dataSource === "cell" ? (construct.quadrants_cell || {}) : (construct.quadrants_pixel || {});
    const qSpec = window.QUADRANT_METRIC_MAP[metricKey] || window.QUADRANT_METRICS[0];
    const quads = [
      { key: "Q1_Slow_HiLoad", short: qLabels.Q1_Slow_HiLoad || "Q1: Slow (Hi D/E) + Hi Load", dot: "q1" },
      { key: "Q3_Slow_LoLoad", short: qLabels.Q3_Slow_LoLoad || "Q3: Slow (Hi D/E) + Lo Load", dot: "q3" },
      { key: "Q2_Fast_HiLoad", short: qLabels.Q2_Fast_HiLoad || "Q2: Fast (Hi E/D) + Hi Load", dot: "q2" },
      { key: "Q4_Fast_LoLoad", short: qLabels.Q4_Fast_LoLoad || "Q4: Fast (Hi E/D) + Lo Load", dot: "q4" }
    ];

    const dec = qSpec.decimals;
    const u = qSpec.unit;

    let rowsHTML = quads.map(q => {
      const qObj = qDict[q.key] || {};
      const mObj = (qObj.metrics || {})[metricKey] || {};
      const f = mObj.fit || {};
      const nCount = dataSource === "cell" ? qObj.n_cells : qObj.n_voxels;
      const nVal = Array.isArray(nCount)
        ? Math.round(nCount.reduce((a, b) => a + (b || 0), 0) / Math.max(1, nCount.length))
        : nCount;
      return `
        <tr>
          <td><span class="quad-dot ${q.dot}"></span><strong>${q.short}</strong></td>
          <td>${nVal !== undefined && nVal !== null ? `${nVal.toLocaleString()}/d` : "—"}</td>
          <td>${formatNum(f.y0, dec, u)}</td>
          <td style="color:#38bdf8;font-weight:700;">${formatNum(f.y5mM, dec, u)}</td>
          <td>${formatNum(f.dy, dec, u, true)}</td>
          <td style="color:#fde047;font-weight:700;">${formatNum(f.ec50, 2, " mM")}</td>
          <td>${formatNum(f.nhill, 2)}</td>
          <td>${formatNum(f.r2, 2)}</td>
        </tr>
      `;
    }).join("");

    // Append highlighted row for Clicked Bin (bx, by) if available
    if (selectedBin && selectedBin.bx !== null && selectedBin.bx !== undefined) {
      const binObj = (construct.bins_2d || []).find(b => b.bx === selectedBin.bx && b.by === selectedBin.by);
      const bf = window.extractBinHillParams ? window.extractBinHillParams(binObj, metricKey) : null;
      if (binObj && bf) {
        rowsHTML += `
          <tr class="bin-highlight-row">
            <td><span class="quad-dot bin"></span><strong style="color:#38bdf8;">Clicked Bin (${selectedBin.bx}, ${selectedBin.by})</strong></td>
            <td>${binObj.nvox ? `~${Math.round(binObj.nvox)}/d` : "—"}</td>
            <td>${formatNum(bf.y0, dec, u)}</td>
            <td style="color:#38bdf8;font-weight:700;">${formatNum(bf.y5mM, dec, u)}</td>
            <td>${formatNum(bf.dy, dec, u, true)}</td>
            <td style="color:#fde047;font-weight:700;">${formatNum(bf.ec50, 2, " mM")}</td>
            <td>${formatNum(bf.nhill, 2)}</td>
            <td>${formatNum(bf.r2, 2)}</td>
          </tr>
        `;
      }
    }

    return `
      <table class="fov-table">
        <thead>
          <tr>
            <th>Quadrant Regime (${projSpec.short_title})</th>
            <th>${dataSource === "cell" ? "Cells" : "Voxels"}</th>
            <th>Basal y₀</th>
            <th>5mM y₅ₘₘ</th>
            <th>Swing Δy</th>
            <th>EC₅₀</th>
            <th>n_H</th>
            <th>R²</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    `;
  }

  /**
   * Builds the HTML for the Bottom-Left "Fit Information" Card in the Single-Viewer 2x2 Dashboard!
   */
  function buildFitInformationPanelHTML(construct, bx, by) {
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const binObj = (construct.bins_2d || []).find(b => b.bx === bx && b.by === by);
    const qKey = getBinQuadKey(bx, by);
    const qLabel = (projSpec.quad_labels && projSpec.quad_labels[qKey]) || qKey;

    let binSummaryHTML = "";
    if (!binObj) {
      binSummaryHTML = `
        <div style="background:var(--panel-alt);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:8px;font-family:var(--font-mono);font-size:11.5px;color:#f87171;">
          <strong>Clicked Bin (${bx}, ${by}) [${qLabel.split(":")[0]}]</strong> is unpopulated or non-oscillating in ${construct.valency} ${construct.mutation} ${construct.topology} (${projSpec.short_title}). Click any colored bin in the 2D Phase Portrait above to inspect its Hill fits.
        </div>
      `;
    } else {
      binSummaryHTML = `
        <div style="background:var(--panel-alt);border:1px solid var(--border-light);border-radius:6px;padding:8px 10px;margin-bottom:8px;font-family:var(--font-mono);font-size:11.2px;line-height:1.55;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;border-bottom:1px solid var(--border);padding-bottom:3px;">
            <strong style="color:#38bdf8;">Clicked Bin (${bx}, ${by}) Multi-Metric Hill Summary</strong>
            <span style="color:var(--muted);">${projSpec.x_short || "X"}=<strong>${formatNum(binObj.x, 2, "", true)}</strong>, ${projSpec.y_short || "Y"}=<strong>${formatNum(binObj.y, 2, "", true)}</strong> · ${qLabel.split(":")[0]}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
            <div><span style="color:var(--muted);">Coupling C(c):</span> <strong style="color:#38bdf8;">${formatNum(binObj.coup_y0, 2)} → ${formatNum(binObj.coup_5mM, 2)}</strong> (EC₅₀=${formatNum(binObj.coup_ec50, 2, "mM")}, R²=${formatNum(binObj.coup_r2, 2)})</div>
            <div><span style="color:var(--muted);">Freq Shift ΔF:</span> <strong style="color:#fbbf24;">${formatNum(binObj.fm_5mM_pct, 1, "%", true)}</strong> (EC₅₀=${formatNum(binObj.fm_ec50, 2, "mM")}, R²=${formatNum(binObj.fm_r2, 2)})</div>
            <div><span style="color:var(--muted);">Carrier ΔD_amp:</span> <strong style="color:#c084fc;">${formatNum(binObj.cr_5mM_pct, 1, "%", true)}</strong> (${formatNum(binObj.cr_5mM_fold, 2, "×")})</div>
            <div><span style="color:var(--muted);">Loading / AM:</span> <strong>${formatNum(binObj.load_5mM_fold, 2, "×")}</strong> / <strong>${formatNum(binObj.am_5mM_fold, 2, "×")}</strong> | <span style="color:var(--muted);">ΔOsc:</span> <strong>${formatNum(binObj.osc_dy_pct, 1, "%", true)}</strong></div>
          </div>
        </div>
      `;
    }

    return `
      ${binSummaryHTML}
      ${buildQuadrantFitTableHTML(construct, state.quadMetricKey, state.dataSource, { bx, by })}
    `;
  }

  /**
   * Updates the Live Clicked-Bin panels, Top HUD telemetry, and cyan bin highlight in-place
   * (without rebuilding the entire DOM or losing scroll position!).
   */
  function updateClickedBinLive(clickedInfo) {
    if (clickedInfo) {
      state.selectedBin = {
        bx: clickedInfo.bx,
        by: clickedInfo.by,
        quadrant: clickedInfo.quadrant
      };
      if (clickedInfo.metricSpec && state.focus !== "dashboard_2x2") {
        state.portraitMetricKey = clickedInfo.metricSpec.key;
        if (clickedInfo.metricSpec.quadCurveKey) {
          state.quadMetricKey = clickedInfo.metricSpec.quadCurveKey;
        }
      }
    }

    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_inverse"];
    const bx = state.selectedBin.bx;
    const by = state.selectedBin.by;
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];

    // 1. Update Top HUD Bar
    renderTopHud();

    // 2. Update Bottom-Left Fit Information Panel (`#bin-fit-info-panel`)
    const fitInfoEl = document.getElementById("bin-fit-info-panel");
    if (fitInfoEl) {
      fitInfoEl.innerHTML = buildFitInformationPanelHTML(c, bx, by);
    }

    // 3. Update Top-Right 4-Quadrant + Clicked Bin Dose-Response Canvas (`#dash-quad-canvas`)
    const dashQuadTitle = document.getElementById("dash-quad-title");
    if (dashQuadTitle) {
      dashQuadTitle.textContent = `4-Quadrant + Clicked Bin (${bx}, ${by}) Dose-Response — ${qSpec.shortLabel}`;
    }
    const dashQuadLegendBin = document.getElementById("dash-quad-legend-bin");
    if (dashQuadLegendBin) {
      dashQuadLegendBin.textContent = `Clicked Bin (${bx}, ${by})`;
    }
    const dashQuadCvs = document.getElementById("dash-quad-canvas");
    if (dashQuadCvs) {
      window.renderQuadrantDoseCurveCanvas(dashQuadCvs, c, {
        dataSource: state.dataSource,
        metricKey: state.quadMetricKey,
        showAxesLabels: true,
        showAnnotationBox: true,
        selectedBin: state.selectedBin
      });
    }

    // 4. Update Bottom-Right Clicked Bin Joint Co-Dosing Curve (`#dock-bin-multi-canvas`)
    const dockMultiCvs = document.getElementById("dock-bin-multi-canvas");
    if (dockMultiCvs) {
      window.renderSingleBinMultiCurveCanvas(dockMultiCvs, c, bx, by);
    }

    // 5. Redraw all currently mounted 2D phase portrait canvases in-place so the cyan highlight box moves to (bx, by)
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
   * MODE 1: Single-Circuit Inspector
   * Defaults to the clean 2×2 Dashboard drawn in the user's mockup:
   *   - Top-Left:    2D Stoichiometry Phase Portrait (Click any bin to plot curve)
   *   - Top-Right:   4-Quadrant + Clicked Bin (bx, by) Dose-Response
   *   - Bottom-Left: Fit Information (Clicked Bin Summary + 4-Quadrant Hill Fit Table)
   *   - Bottom-Right: Clicked Bin Joint Curve: C(c), ΔF%, ΔD% (Shared 0mM Origin + IQR Bars)
   */
  function renderSingleMode(container) {
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const qShortMap = projSpec.quad_short || {};
    const c = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_inverse"];
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];
    const bx = state.selectedBin.bx;
    const by = state.selectedBin.by;

    const szDash = getAdaptiveTileSize("dashboard2x2");
    const sz3x3 = getAdaptiveTileSize("single3x3");

    if (state.focus === "dashboard_2x2") {
      container.innerHTML = `
        <div class="single-2x2-grid">
          <!-- TOP-LEFT: 2D Stoichiometry Phase Portrait -->
          <div class="tile-card" style="align-items:center;justify-content:space-between;">
            <div class="tile-card-header">
              <span>2D Portrait: ${projSpec.short_title} (Click any bin)</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <span class="mono-tag">${c.valency} ${c.mutation} ${c.topology.toUpperCase()}</span>
                <button class="zoom-btn-mini" id="btn-show-all-9-portraits" title="View All 9 Phase Portraits (3×3 Grid)">All 9 ⊞</button>
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px;width:100%;display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:var(--accent);">${pSpec.title}</strong>
              <span style="font-family:var(--font-mono);font-size:11px;" id="dash-p-stat"></span>
            </div>
            <canvas id="dash-portrait-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szDash.w}" data-h="${szDash.h}" width="${szDash.w}" height="${szDash.h}" style="cursor:crosshair;"></canvas>
            <canvas id="dash-portrait-cbar" data-w="${szDash.w - 24}" data-h="28" width="${szDash.w - 24}" height="28" style="margin-top:4px;"></canvas>
          </div>

          <!-- TOP-RIGHT: 4-Quadrant + Clicked Bin (bx, by) Dose-Response -->
          <div class="tile-card" style="align-items:center;justify-content:space-between;">
            <div class="tile-card-header">
              <span id="dash-quad-title">4-Quadrant + Clicked Bin (${bx}, ${by}) Dose-Response — ${qSpec.shortLabel}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <span class="mono-tag">${state.dataSource.toUpperCase()} MODE</span>
                <button class="zoom-btn-mini" id="btn-show-all-6-quads" title="View All 6 Quadrant Dose-Response Curves">All 6 ⊞</button>
              </div>
            </div>
            <canvas id="dash-quad-canvas" data-w="${szDash.w}" data-h="${szDash.h}" width="${szDash.w}" height="${szDash.h}"></canvas>
            <div class="quad-legend-row" style="margin-top:6px;width:100%;justify-content:center;">
              <span><span class="quad-dot q1"></span>${qShortMap.Q1_Slow_HiLoad || "Q1"}</span>
              <span><span class="quad-dot q3"></span>${qShortMap.Q3_Slow_LoLoad || "Q3"}</span>
              <span><span class="quad-dot q2"></span>${qShortMap.Q2_Fast_HiLoad || "Q2"}</span>
              <span><span class="quad-dot q4"></span>${qShortMap.Q4_Fast_LoLoad || "Q4"}</span>
              <span><span class="quad-dot bin"></span><strong style="color:#38bdf8;" id="dash-quad-legend-bin">Clicked Bin (${bx}, ${by})</strong></span>
            </div>
          </div>

          <!-- BOTTOM-LEFT: Fit Information (Clicked Bin Multi-Metric Summary + 4-Quad Fit Table) -->
          <div class="tile-card" style="align-items:stretch;justify-content:flex-start;">
            <div class="tile-card-header">
              <span>Hill Fit Information: 4 Quadrants &amp; Clicked Bin</span>
              <span class="mono-tag">${qSpec.shortLabel} (${state.dataSource.toUpperCase()})</span>
            </div>
            <div id="bin-fit-info-panel" style="width:100%;">
              ${buildFitInformationPanelHTML(c, bx, by)}
            </div>
          </div>

          <!-- BOTTOM-RIGHT: Clicked Bin Joint Curve: C(c), ΔF%, ΔD% -->
          <div class="tile-card" style="align-items:center;justify-content:space-between;">
            <div class="tile-card-header">
              <span>Clicked Bin Joint Curve: C(c), ΔF%, ΔD%</span>
              <span class="mono-tag">Shared 0mM Origin · IQR Bars</span>
            </div>
            <canvas id="dock-bin-multi-canvas" data-w="${szDash.w}" data-h="${szDash.h}" width="${szDash.w}" height="${szDash.h}"></canvas>
            <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:4px;text-align:center;">
              Left Axis (Cyan): Coupling C(c) anchored at C₀ | Right Axis (Amber/Purple): ΔF% &amp; ΔD_amp% anchored at 0%
            </div>
          </div>
        </div>
      `;

      const pCvs = document.getElementById("dash-portrait-canvas");
      const pCbar = document.getElementById("dash-portrait-cbar");
      if (pCvs) {
        const res = window.renderPhasePortraitCanvas(pCvs, c, pSpec, {
          confidenceMode: state.confidenceMode,
          showAxesLabels: true,
          showSummaryBadge: true,
          highlightBin: state.selectedBin
        });
        const stEl = document.getElementById("dash-p-stat");
        if (stEl) stEl.textContent = `${res.activeBins} active bins`;
        window.attachPortraitInteractivity(pCvs, handleBinHover, clicked => updateClickedBinLive(clicked));
      }
      if (pCbar) window.renderColorbarCanvas(pCbar, pSpec);

      const btnAll9 = document.getElementById("btn-show-all-9-portraits");
      if (btnAll9) btnAll9.addEventListener("click", () => { state.focus = "all_portraits"; updateUI(); });
      const btnAll6 = document.getElementById("btn-show-all-6-quads");
      if (btnAll6) btnAll6.addEventListener("click", () => { state.focus = "all_quads"; updateUI(); });

      updateClickedBinLive(null);
      return;
    }

    // Optional expanded sub-views inside Single-Circuit Mode (All 9 Portraits 3x3, All 6 Quads 3x2, or Metric Pair)
    let subBodyHTML = "";
    if (state.focus === "all_portraits") {
      subBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong>All 9 Phase Portraits (${c.valency} ${c.mutation} ${c.topology.toUpperCase()}) — ${projSpec.short_title}</strong>
              <span style="color:var(--muted);margin-left:10px;font-size:12px;">
                Click any <strong>(bx, by) bin</strong> or click <strong>2×2 Dashboard ⤢</strong> to inspect its dose-response curves.
              </span>
            </div>
            <button class="pill-btn active" id="btn-back-2x2">← Back to 2×2 Inspector Dashboard</button>
          </div>
          <div class="portrait-grid-9">
            ${window.PORTRAIT_METRICS.map((m, idx) => `
              <div class="tile-card ${m.key === state.portraitMetricKey ? "active-metric" : ""}">
                <div class="tile-card-header">
                  <span>${idx + 1}. ${m.shortLabel}</span>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <span class="mono-tag" id="stat-tag-${m.key}"></span>
                    <button class="zoom-btn-mini" data-zoom-metric="${m.key}">2×2 ⤢</button>
                  </div>
                </div>
                <canvas id="single-pcanvas-${m.key}" class="live-portrait-canvas" data-axes="true" data-w="${sz3x3.w}" data-h="${sz3x3.h}" width="${sz3x3.w}" height="${sz3x3.h}" style="cursor:crosshair;"></canvas>
                <canvas id="single-pcbar-${m.key}" data-w="${sz3x3.w - 16}" data-h="24" width="${sz3x3.w - 16}" height="24"></canvas>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (state.focus === "all_quads") {
      subBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div>
              <strong>All 6 4-Quadrant + Clicked Bin (${bx}, ${by}) Dose-Response Curves — ${projSpec.short_title} (${state.dataSource.toUpperCase()} MODE)</strong>
            </div>
            <button class="pill-btn active" id="btn-back-2x2">← Back to 2×2 Inspector Dashboard</button>
          </div>
          <div class="portrait-grid-9">
            ${window.QUADRANT_METRICS.map((qm, idx) => `
              <div class="tile-card ${qm.key === state.quadMetricKey ? "active-metric" : ""}">
                <div class="tile-card-header">
                  <span>${idx + 1}. ${qm.shortLabel}</span>
                  <button class="zoom-btn-mini" data-zoom-qmetric="${qm.key}">2×2 ⤢</button>
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
      subBodyHTML = `
        <div class="fov-card">
          <div class="fov-card-header">
            <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
              <strong>Side-by-Side Metric Comparison (${c.valency} ${c.mutation} ${c.topology.toUpperCase()} · ${projSpec.short_title})</strong>
              <label style="font-size:12px;color:var(--muted);">Left:
                <select id="sel-pair-mleft" class="dark-select">
                  ${window.PORTRAIT_METRICS.map(m => `<option value="${m.key}" ${m.key === state.pairMetricLeft ? "selected" : ""}>${m.shortLabel}</option>`).join("")}
                </select>
              </label>
              <label style="font-size:12px;color:var(--muted);">Right:
                <select id="sel-pair-mright" class="dark-select">
                  ${window.PORTRAIT_METRICS.map(m => `<option value="${m.key}" ${m.key === state.pairMetricRight ? "selected" : ""}>${m.shortLabel}</option>`).join("")}
                </select>
              </label>
            </div>
            <button class="pill-btn active" id="btn-back-2x2">← Back to 2×2 Inspector Dashboard</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;">
            <div class="tile-card">
              <div class="tile-card-header"><span>${mLeft.title}</span></div>
              <canvas id="pair-mleft-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szDash.w}" data-h="${szDash.h}" width="${szDash.w}" height="${szDash.h}" style="cursor:crosshair;"></canvas>
              <canvas id="pair-mleft-cbar" data-w="${szDash.w - 24}" data-h="28" width="${szDash.w - 24}" height="28"></canvas>
            </div>
            <div class="tile-card">
              <div class="tile-card-header"><span>${mRight.title}</span></div>
              <canvas id="pair-mright-canvas" class="live-portrait-canvas" data-axes="true" data-w="${szDash.w}" data-h="${szDash.h}" width="${szDash.w}" height="${szDash.h}" style="cursor:crosshair;"></canvas>
              <canvas id="pair-mright-cbar" data-w="${szDash.w - 24}" data-h="28" width="${szDash.w - 24}" height="28"></canvas>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = subBodyHTML;

    const btnBack = document.getElementById("btn-back-2x2");
    if (btnBack) btnBack.addEventListener("click", () => { state.focus = "dashboard_2x2"; updateUI(); });

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
          if (tag) tag.textContent = `${res.activeBins}b`;
          window.attachPortraitInteractivity(cvs, handleBinHover, clicked => {
            state.portraitMetricKey = m.key;
            if (m.quadCurveKey) state.quadMetricKey = m.quadCurveKey;
            state.selectedBin = { bx: clicked.bx, by: clicked.by, quadrant: clicked.quadrant };
            state.focus = "dashboard_2x2";
            updateUI();
          });
        }
        if (cbar) window.renderColorbarCanvas(cbar, m);
      }
      container.querySelectorAll("[data-zoom-metric]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const mKey = btn.dataset.zoomMetric;
          state.portraitMetricKey = mKey;
          const mSpec = window.PORTRAIT_METRIC_MAP[mKey];
          if (mSpec && mSpec.quadCurveKey) state.quadMetricKey = mSpec.quadCurveKey;
          state.focus = "dashboard_2x2";
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
      container.querySelectorAll("[data-zoom-qmetric]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.quadMetricKey = btn.dataset.zoomQmetric;
          state.focus = "dashboard_2x2";
          updateUI();
        });
      });
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
    }
  }

  /**
   * MODE 2: 3x3 Family Explorer
   */
  function renderFamily3x3Mode(container) {
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const qShortMap = projSpec.quad_short || {};
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
      <div class="fov-card" style="margin-bottom:0;">
        <div class="fov-card-header">
          <div>
            <span class="badge ${fam.badgeClass}">${fam.label.toUpperCase()} FAMILY (3×3 MATRIX)</span>
            <strong style="margin-left:8px;font-size:13.5px;">
              ${state.viewType === "portraits" ? `${pSpec.title} [${projSpec.short_title}]` : `${qSpec.shortLabel} [${projSpec.short_title} · ${state.dataSource.toUpperCase()}]`}
            </strong>
            <span style="color:var(--muted);margin-left:8px;font-size:11.5px;">${fam.subtitle}</span>
          </div>
          <div>
            ${state.viewType === "portraits"
              ? `<canvas id="fam3x3-cbar" data-w="250" data-h="26" width="250" height="26"></canvas>`
              : `<div class="quad-legend-row">
                   <span><span class="quad-dot q1"></span>${qShortMap.Q1_Slow_HiLoad || "Q1"}</span>
                   <span><span class="quad-dot q3"></span>${qShortMap.Q3_Slow_LoLoad || "Q3"}</span>
                   <span><span class="quad-dot q2"></span>${qShortMap.Q2_Fast_HiLoad || "Q2"}</span>
                   <span><span class="quad-dot q4"></span>${qShortMap.Q4_Fast_LoLoad || "Q4"}</span>
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
          state.focus = "dashboard_2x2";
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
          state.focus = "dashboard_2x2";
          updateUI();
        });
      }
    }

    container.querySelectorAll("[data-open-single]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.openSingle);
        state.mode = "single";
        state.focus = "dashboard_2x2";
        updateUI();
      });
    });
  }

  /**
   * MODE 3: Full 4 x (3x3) Library Overview
   */
  function renderLibrary6x6Mode(container) {
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const qShortMap = projSpec.quad_short || {};
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const qSpec = window.QUADRANT_METRIC_MAP[state.quadMetricKey] || window.QUADRANT_METRICS[0];
    const sz6 = getAdaptiveTileSize("library6x6");

    const buildSuperQuadHTML = (mut, topo, bannerClass, titleText) => {
      let cells = "";
      for (const v of VALENCIES_9) {
        const cid = `${v}_${mut}_${topo}`;
        const c = CONSTRUCTS[cid];
        cells += `
          <div class="tile-card" style="padding:4px 5px;">
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
      <div class="fov-card" style="margin-bottom:0;">
        <div class="fov-card-header">
          <div>
            <strong style="font-size:13.5px;color:var(--accent);">
              Full 36-Construct Library (4 × 3×3 Layout) —
              ${state.viewType === "portraits" ? `${pSpec.title} [${projSpec.short_title}]` : `${qSpec.shortLabel} [${projSpec.short_title} · ${state.dataSource.toUpperCase()}]`}
            </strong>
            <span style="font-size:11.5px;color:var(--muted);margin-left:8px;">
              Click any construct tile or coordinate bin to open its 2×2 Inspector.
            </span>
          </div>
          <div>
            ${state.viewType === "portraits"
              ? `<canvas id="lib6x6-cbar" data-w="250" data-h="26" width="250" height="26"></canvas>`
              : `<div class="quad-legend-row">
                   <span><span class="quad-dot q1"></span>${qShortMap.Q1_Slow_HiLoad || "Q1"}</span>
                   <span><span class="quad-dot q3"></span>${qShortMap.Q3_Slow_LoLoad || "Q3"}</span>
                   <span><span class="quad-dot q2"></span>${qShortMap.Q2_Fast_HiLoad || "Q2"}</span>
                   <span><span class="quad-dot q4"></span>${qShortMap.Q4_Fast_LoLoad || "Q4"}</span>
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
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <span class="badge badge-tamut">NEGATIVE CONTROLS</span>
            <strong style="margin-left:8px;font-size:12.5px;">1×1 &amp; 2×2 Non-Phosphorylatable PKAsub(T→A) Inverse Controls</strong>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
              Abolishes PKA phosphorylation of PKAsub on MinD (<code>1x1_TAmut_inverse</code> &amp; <code>2x2_TAmut_inverse</code>), confirming that cAMP-induced coupling requires phospho-threonine binding.
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            ${["1x1_TAmut_inverse", "2x2_TAmut_inverse"].map(cid => `
              <div class="tile-card" style="padding:4px 5px;">
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
          state.focus = "dashboard_2x2";
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
          state.focus = "dashboard_2x2";
          updateUI();
        });
      }
    }

    container.querySelectorAll("[data-open-single]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncFamilyValencyFromCircuit(btn.dataset.openSingle);
        state.mode = "single";
        state.focus = "dashboard_2x2";
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
    const szPair = getAdaptiveTileSize("pairwise3col");

    const pairPresets = [
      { label: "2×2 WT Upright vs 2×2 WT Inverse", a: "2x2_WT_upright", b: "2x2_WT_inverse" },
      { label: "3×3 WT Upright vs 3×3 R70A Upright", a: "3x3_WT_upright", b: "3x3_R70A_upright" },
      { label: "3×2 WT Inverse vs 3×3 WT Inverse (Wave Awakening)", a: "3x2_WT_inverse", b: "3x3_WT_inverse" },
      { label: "2×2 WT Inverse vs 2×2 T→A Inverse (Control)", a: "2x2_WT_inverse", b: "2x2_TAmut_inverse" },
      { label: "1×1 WT Inverse vs 1×1 T→A Inverse (Control)", a: "1x1_WT_inverse", b: "1x1_TAmut_inverse" },
      { label: "1×1 WT Upright vs 3×3 WT Upright (Valency Scaling)", a: "1x1_WT_upright", b: "3x3_WT_upright" }
    ];

    container.innerHTML = `
      <div class="fov-card" style="margin-bottom:0;">
        <div class="fov-card-header">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <strong style="color:var(--accent);margin-right:4px;">Quick Pair Presets:</strong>
            ${pairPresets.map(p => `
              <button class="pill-btn ${cA.id === p.a && cB.id === p.b ? "active" : ""}" data-pair-a="${p.a}" data-pair-b="${p.b}">
                ${p.label}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- 3-Column Phase Portrait Comparison: Circuit A | Difference Δ(A - B) | Circuit B -->
        <div style="display:grid;grid-template-columns:repeat(3, minmax(240px, 1fr));gap:10px;margin-bottom:12px;">
          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#60a5fa;">Circuit A: ${cA.valency} ${cA.mutation} ${cA.topology.toUpperCase()}</span>
              <span class="mono-tag">${pSpec.shortLabel}</span>
            </div>
            <canvas id="pair-pcanvas-a" data-w="${szPair.w}" data-h="${szPair.h}" width="${szPair.w}" height="${szPair.h}"></canvas>
            <canvas id="pair-pcbar-a" data-w="${szPair.w - 24}" data-h="26" width="${szPair.w - 24}" height="26"></canvas>
          </div>

          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#fde047;">Difference: Δ(Circuit A − Circuit B)</span>
              <span class="mono-tag">Red: A&gt;B | Blue: B&gt;A</span>
            </div>
            <canvas id="pair-pcanvas-diff" data-w="${szPair.w}" data-h="${szPair.h}" width="${szPair.w}" height="${szPair.h}"></canvas>
            <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted);margin-top:4px;">
              Bin-by-bin subtraction across shared (bx, by) coordinates
            </div>
          </div>

          <div class="tile-card">
            <div class="tile-card-header">
              <span style="color:#f87171;">Circuit B: ${cB.valency} ${cB.mutation} ${cB.topology.toUpperCase()}</span>
              <span class="mono-tag">${pSpec.shortLabel}</span>
            </div>
            <canvas id="pair-pcanvas-b" data-w="${szPair.w}" data-h="${szPair.h}" width="${szPair.w}" height="${szPair.h}"></canvas>
            <canvas id="pair-pcbar-b" data-w="${szPair.w - 24}" data-h="26" width="${szPair.w - 24}" height="26"></canvas>
          </div>
        </div>

        <!-- 2-Column 4-Quadrant Dose-Response Curves + Schematics + Tables -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="tile-card" style="align-items:stretch;">
            <div class="tile-card-header">
              <span style="color:#60a5fa;">Circuit A — 4-Quadrant ${qSpec.shortLabel} (${state.dataSource.toUpperCase()})</span>
              <span class="mono-tag">${cA.valency} ${cA.mutation} ${cA.topology.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:8px;">
              <canvas id="pair-qcanvas-a" data-w="${szPair.w}" data-h="${szPair.h}" width="${szPair.w}" height="${szPair.h}"></canvas>
              ${window.renderAntennaSchematicHTML(cA, true)}
            </div>
            ${buildQuadrantFitTableHTML(cA, state.quadMetricKey, state.dataSource)}
          </div>

          <div class="tile-card" style="align-items:stretch;">
            <div class="tile-card-header">
              <span style="color:#f87171;">Circuit B — 4-Quadrant ${qSpec.shortLabel} (${state.dataSource.toUpperCase()})</span>
              <span class="mono-tag">${cB.valency} ${cB.mutation} ${cB.topology.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:8px;">
              <canvas id="pair-qcanvas-b" data-w="${szPair.w}" data-h="${szPair.h}" width="${szPair.w}" height="${szPair.h}"></canvas>
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
    const projSpec = window.ACTIVE_PROJECTION_SPEC || syncActiveProjection();
    const qShortMap = projSpec.quad_short || {};
    const pSpec = window.PORTRAIT_METRIC_MAP[state.portraitMetricKey] || window.PORTRAIT_METRICS[0];
    const refConstruct = CONSTRUCTS[state.selectedCircuitA] || CONSTRUCTS["2x2_WT_upright"];
    const ranked = window.rankCircuitsByTarget(CONSTRUCTS, state.targetRegionSpec, state.targetCriteria, false);
    const topMatches = ranked.slice(0, 9);
    const critKeys = Object.keys(state.targetCriteria);

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:360px 1fr;gap:14px;align-items:start;">
        <!-- Left Column: Presets, Interactive 2D Pad, Sliders -->
        <div class="fov-card" style="margin-bottom:0;">
          <div class="fov-card-header">
            <strong style="color:var(--accent);">1. Biophysical Archetype Presets</strong>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">
            ${window.TARGET_PRESETS.map(pr => `
              <button class="pill-btn ${state.targetPresetId === pr.id ? "active" : ""}" data-preset-id="${pr.id}">
                ${pr.name}
              </button>
            `).join("")}
          </div>
          <div style="font-size:11.5px;color:var(--muted);background:var(--panel-deep);padding:7px 9px;border-radius:6px;border:1px solid var(--border);margin-bottom:12px;">
            ${(window.TARGET_PRESETS.find(p => p.id === state.targetPresetId) || {}).desc || "Custom user-defined target specification."}
          </div>

          <div class="fov-card-header">
            <strong style="color:var(--accent);">2. Click Target Region (${projSpec.short_title})</strong>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q1_Slow_HiLoad" ? "active" : ""}" data-reg-q="Q1_Slow_HiLoad">${qShortMap.Q1_Slow_HiLoad || "Q1"}</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q3_Slow_LoLoad" ? "active" : ""}" data-reg-q="Q3_Slow_LoLoad">${qShortMap.Q3_Slow_LoLoad || "Q3"}</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q2_Fast_HiLoad" ? "active" : ""}" data-reg-q="Q2_Fast_HiLoad">${qShortMap.Q2_Fast_HiLoad || "Q2"}</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "quadrant" && state.targetRegionSpec.quadrant === "Q4_Fast_LoLoad" ? "active" : ""}" data-reg-q="Q4_Fast_LoLoad">${qShortMap.Q4_Fast_LoLoad || "Q4"}</button>
            <button class="pill-btn ${state.targetRegionSpec.mode === "all" ? "active" : ""}" data-reg-all="1">All Bins</button>
          </div>
          <div style="display:flex;justify-content:center;margin-bottom:12px;">
            <canvas id="target-pad-canvas" data-w="310" data-h="250" width="310" height="250" style="cursor:crosshair;"></canvas>
          </div>

          <div class="fov-card-header">
            <strong style="color:var(--accent);">3. Target Feature Specifications</strong>
          </div>
          ${critKeys.map(k => {
            const cObj = state.targetCriteria[k];
            return `
              <div class="target-slider-row" style="opacity:${cObj.enabled ? "1.0" : "0.5"};">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:600;margin-bottom:3px;">
                  <label style="cursor:pointer;display:flex;align-items:center;gap:5px;">
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
        <div class="fov-card" style="margin-bottom:0;">
          <div class="fov-card-header">
            <div>
              <strong style="font-size:14px;color:var(--accent);">Closest Matching Antenna-Circuit Designs (Top 9 of 36)</strong>
              <span style="font-size:11.5px;color:var(--muted);margin-left:8px;">
                Evaluated in <strong>${state.targetRegionSpec.mode === "quadrant" ? ((projSpec.quad_labels && projSpec.quad_labels[state.targetRegionSpec.quadrant]) || state.targetRegionSpec.quadrant) : (state.targetRegionSpec.mode === "bin" ? `Coordinate Bin (${state.targetRegionSpec.bx}, ${state.targetRegionSpec.by}) ± 1` : "All Populated Bins")}</strong>
              </span>
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
                    <span class="badge ${getBadgeClassForConstruct(mc)}">${item.matchScore.toFixed(1)}%</span>
                  </div>
                  <div style="display:grid;grid-template-columns:145px 1fr;gap:8px;align-items:center;">
                    <canvas id="match-canvas-${mc.id}" data-w="145" data-h="125" width="145" height="125"></canvas>
                    <div style="font-family:var(--font-mono);font-size:10.5px;line-height:1.45;color:var(--text);">
                      <div><span style="color:var(--muted);">C₅ₘₘ / C₀:</span> <strong>${formatNum(st.coup_5mM, 2)}</strong> / ${formatNum(st.coup_y0, 2)}</div>
                      <div><span style="color:var(--muted);">ΔC / EC₅₀:</span> <strong>${formatNum(st.coup_dy, 2, "", true)}</strong> / ${formatNum(st.coup_ec50, 2, "mM")}</div>
                      <div><span style="color:var(--muted);">ΔF₅ₘₘ:</span> <strong style="color:#fbbf24;">${formatNum(st.fm_5mM_pct, 1, "%", true)}</strong></div>
                      <div><span style="color:var(--muted);">ΔD₅ₘₘ:</span> <strong style="color:#c084fc;">${formatNum(st.cr_5mM_pct, 1, "%", true)}</strong></div>
                      <div><span style="color:var(--muted);">ΔOsc%:</span> <strong>${formatNum(st.osc_dy_pct, 1, "%", true)}</strong></div>
                      <button class="zoom-btn-mini" data-open-single="${mc.id}" style="margin-top:5px;width:100%;padding:3px;">Inspect 2×2 ↗</button>
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
        state.focus = "dashboard_2x2";
        updateUI();
      });
    });
  }

  /**
   * MODE 6: Sortable 38-Construct Library Table
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
      <div class="fov-card" style="margin-bottom:0;">
        <div class="fov-card-header">
          <strong>Sortable 38-Construct Library Summary Table (36 Active Designs + 2 T→A Negative Controls)</strong>
          <span style="color:var(--muted);font-size:11.5px;">Click any column header to sort, or click any row to open its 2×2 Single-Circuit Inspector.</span>
        </div>
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
      </div>
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
        state.focus = "dashboard_2x2";
        updateUI();
      });
    });
  }

  /**
   * Master UI render dispatcher
   */
  function updateUI() {
    if (tooltipEl) tooltipEl.style.display = "none";
    syncActiveProjection();
    renderTopHud();
    renderSidebar();

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

  // Bind keyboard shortcuts & window resize
  document.addEventListener("DOMContentLoaded", () => {
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
        updateUI();
      } else if (e.key.toLowerCase() === "c") {
        state.confidenceMode = state.confidenceMode === "vsup_contour" ? "vsup_only" : "vsup_contour";
        updateUI();
      } else if (e.key.toLowerCase() === "m") {
        state.dataSource = state.dataSource === "pixel" ? "cell" : "pixel";
        updateUI();
      } else if (e.key.toLowerCase() === "p") {
        const curIdx = PROJECTION_ORDER.indexOf(state.projectionKey);
        state.projectionKey = PROJECTION_ORDER[(curIdx + 1) % PROJECTION_ORDER.length];
        syncActiveProjection();
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
