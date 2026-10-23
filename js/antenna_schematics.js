/**
 * antenna_schematics.js
 * Renders an interactive, publication-grade dark-slate SVG schematic of the molecular antenna-circuit
 * architecture (Upright vs Inverse, MinD Valency 1x..3x, Cargo Valency 1x..3x, WT vs R70A FHA1 vs TAmut PKAsub),
 * with automatic support for custom AlphaFold / PDB image overrides defined in `assets/schematics/manifest.js`.
 */

window.renderAntennaSchematicHTML = function(construct, compact = false) {
  if (!construct) return '<div style="color:#94a3b8;">Select a construct</div>';

  const cid = construct.id;
  const mdVal = construct.minD_valency || 1;
  const cgVal = construct.cargo_valency || 1;
  const isUpright = construct.topology === "upright";
  const mut = construct.mutation || "WT";
  const isR70A = mut === "R70A";
  const isTAmut = mut === "TAmut";

  const customImg = (window.ANTENNA_SCHEMATIC_MANIFEST &&
                     window.ANTENNA_SCHEMATIC_MANIFEST.custom_images &&
                     window.ANTENNA_SCHEMATIC_MANIFEST.custom_images[cid]) || null;

  const w = compact ? 310 : 370;
  const h = compact ? 175 : 205;

  const fhaFill = isR70A ? "#7c3aed" : "#2563eb";
  const fhaStroke = isR70A ? "#c084fc" : "#60a5fa";

  const subFill = isTAmut ? "#475569" : "#d97706";
  const subStroke = isTAmut ? "#94a3b8" : "#fbbf24";

  function drawFHA1(cx, cy, scale = 1.0) {
    const rw = 26 * scale;
    const rh = 17 * scale;
    const notch = isR70A
      ? `<polygon points="${cx - 4*scale},${cy - rh/2} ${cx + 4*scale},${cy - rh/2} ${cx},${cy - rh/2 + 5.5*scale}" fill="#1e1b4b" stroke="${fhaStroke}" stroke-width="1"/>`
      : `<path d="M ${cx - 5*scale} ${cy - rh/2} A 5 5 0 0 0 ${cx + 5*scale} ${cy - rh/2}" fill="#0f172a" stroke="${fhaStroke}" stroke-width="1"/>`;
    return `
      <g class="domain-fha1">
        <rect x="${cx - rw/2}" y="${cy - rh/2}" width="${rw}" height="${rh}" rx="${4*scale}" fill="${fhaFill}" stroke="${fhaStroke}" stroke-width="1.3"/>
        ${notch}
        <text x="${cx}" y="${cy + 3.5*scale}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${7.2*scale}px" font-weight="700">${isR70A ? "R70A" : "FHA1"}</text>
      </g>
    `;
  }

  function drawPKAsub(cx, cy, scale = 1.0) {
    const rw = 24 * scale;
    const rh = 14 * scale;
    const pBadge = isTAmut
      ? `<circle cx="${cx + rw/2 - 2*scale}" cy="${cy - rh/2}" r="${4.4*scale}" fill="#64748b" stroke="#0f172a" stroke-width="0.9"/>
         <text x="${cx + rw/2 - 2*scale}" y="${cy - rh/2 + 2.4*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, monospace" font-size="${6*scale}px" font-weight="700">A</text>`
      : `<circle cx="${cx + rw/2 - 2*scale}" cy="${cy - rh/2}" r="${4.6*scale}" fill="#ef4444" stroke="#0f172a" stroke-width="0.9"/>
         <text x="${cx + rw/2 - 2*scale}" y="${cy - rh/2 + 2.4*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, monospace" font-size="${6*scale}px" font-weight="700">P</text>`;
    return `
      <g class="domain-pkasub">
        <rect x="${cx - rw/2}" y="${cy - rh/2}" width="${rw}" height="${rh}" rx="${5*scale}" fill="${subFill}" stroke="${subStroke}" stroke-width="1.2"/>
        <text x="${cx - 1*scale}" y="${cy + 3*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.8*scale}px" font-weight="700">sub</text>
        ${pBadge}
      </g>
    `;
  }

  const sc = compact ? 0.84 : 0.96;
  const memY = h - (compact ? 32 : 36);
  const anchorX = w * 0.33;
  const cargoX = w * 0.69;

  let anchorRepeatsSVG = "";
  const anchorBaseY = memY - 26 * sc;
  const stepY = 22 * sc;
  for (let i = 0; i < mdVal; i++) {
    const ry = anchorBaseY - (i + 1) * stepY;
    anchorRepeatsSVG += `<line x1="${anchorX}" y1="${ry + 8*sc}" x2="${anchorX}" y2="${ry + stepY - 7*sc}" stroke="#64748b" stroke-width="2"/>`;
    if (isUpright) {
      anchorRepeatsSVG += drawFHA1(anchorX, ry, sc);
    } else {
      anchorRepeatsSVG += drawPKAsub(anchorX, ry, sc);
    }
  }

  let cargoRepeatsSVG = "";
  const gfpY = compact ? 38 : 44;
  for (let j = 0; j < cgVal; j++) {
    const cy = gfpY + 24 * sc + j * stepY;
    const prevY = j === 0 ? (gfpY + 10 * sc) : (gfpY + 24 * sc + (j - 1) * stepY + 7 * sc);
    cargoRepeatsSVG += `<line x1="${cargoX}" y1="${prevY}" x2="${cargoX}" y2="${cy - 7*sc}" stroke="#34d399" stroke-width="2"/>`;
    if (isUpright) {
      cargoRepeatsSVG += drawPKAsub(cargoX, cy, sc);
    } else {
      cargoRepeatsSVG += drawFHA1(cargoX, cy, sc);
    }
  }

  const nArrows = Math.min(mdVal, cgVal);
  let arrowsSVG = "";
  for (let k = 0; k < nArrows; k++) {
    const yLeft = anchorBaseY - (k + 1) * stepY;
    const yRight = gfpY + 24 * sc + k * stepY;
    const strokeCol = isTAmut ? "#64748b" : (isR70A ? "#c084fc" : "#34d399");
    const dash = isTAmut ? "3,3" : (isR70A ? "4,2" : "none");
    arrowsSVG += `
      <path d="M ${anchorX + 16*sc} ${yLeft} C ${w*0.50} ${yLeft}, ${w*0.52} ${yRight}, ${cargoX - 16*sc} ${yRight}"
            fill="none" stroke="${strokeCol}" stroke-width="${isR70A ? 1.8 : 2.3}" stroke-dasharray="${dash}" opacity="0.9"/>
    `;
  }

  const svgContent = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="auto" style="background:#0f172a;border:1px solid #2a3655;border-radius:6px;display:block;">
      <rect x="10" y="6" width="84" height="15" rx="3" fill="${isUpright ? "rgba(59,130,246,0.22)" : "rgba(239,68,68,0.22)"}" stroke="${isUpright ? "#3b82f6" : "#ef4444"}" stroke-width="0.8"/>
      <text x="52" y="16.5" text-anchor="middle" fill="${isUpright ? "#93c5fd" : "#fca5a5"}" font-family="Inter, Arial, sans-serif" font-size="8.2px" font-weight="700">
        ${isUpright ? "UPRIGHT" : "INVERSE"} (${construct.valency})
      </text>

      <rect x="100" y="6" width="76" height="15" rx="3" fill="${isR70A ? "rgba(168,85,247,0.22)" : "rgba(16,185,129,0.22)"}" stroke="${isR70A ? "#a855f7" : "#10b981"}" stroke-width="0.8"/>
      <text x="138" y="16.5" text-anchor="middle" fill="${isR70A ? "#d8b4fe" : "#6ee7b7"}" font-family="JetBrains Mono, Consolas, monospace" font-size="8px" font-weight="700">
        ${isTAmut ? "PKAsub T→A" : `FHA1: ${mut}`}
      </text>

      <!-- Cellular Membranes + MinD Carrier Wave -->
      <rect x="10" y="${memY}" width="${w - 20}" height="15" rx="3" fill="#0c4a6e" stroke="#0284c7" stroke-width="1"/>
      <text x="${w / 2}" y="${memY + 10.5}" text-anchor="middle" fill="#7dd3fc" font-family="Inter, Arial, sans-serif" font-size="7.8px" font-weight="600">
        Cellular Membranes — MinDE Carrier Wave
      </text>

      <!-- MinD Anchor Base -->
      <rect x="${anchorX - 24*sc}" y="${memY - 24*sc}" width="${48*sc}" height="${22*sc}" rx="4" fill="#0284c7" stroke="#38bdf8" stroke-width="1.3"/>
      <text x="${anchorX}" y="${memY - 12*sc}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${7.5*sc}px" font-weight="700">MinD</text>
      <text x="${anchorX}" y="${memY - 4*sc}" text-anchor="middle" fill="#bae6fd" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.2*sc}px">cterm×${mdVal}</text>

      ${anchorRepeatsSVG}

      <!-- GFP Diffusive Cargo Client -->
      <circle cx="${cargoX}" cy="${gfpY}" r="${12*sc}" fill="#059669" stroke="#34d399" stroke-width="1.3"/>
      <text x="${cargoX}" y="${gfpY + 2.8*sc}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.6*sc}px" font-weight="700">GFP</text>
      <text x="${cargoX}" y="${gfpY - 15*sc}" text-anchor="middle" fill="#6ee7b7" font-family="Inter, Arial, sans-serif" font-size="${7.8*sc}px" font-weight="700">Cargo (${cgVal}×)</text>

      ${cargoRepeatsSVG}
      ${arrowsSVG}

      <!-- Footer Domain Readout -->
      <text x="10" y="${h - 6}" fill="#94a3b8" font-family="JetBrains Mono, Consolas, monospace" font-size="7.5px">
        ${construct.carrier_domain}  ⇄  ${construct.cargo_domain}
      </text>
    </svg>
  `;

  if (customImg) {
    return `
      <div>
        <img src="${customImg}" alt="${cid} AlphaFold/PDB render" style="width:100%;border-radius:6px;border:1px solid #2a3655;" />
      </div>
    `;
  }
  return svgContent;
};
