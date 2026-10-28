/**
 * antenna_schematics.js
 * Renders an interactive, publication-grade dark-slate SVG schematic of the molecular antenna-circuit
 * architecture verified against `library_manifest_verified.csv`:
 *   - UPRIGHT topology: PKAsub×M on mCherry-MinD carrier + MinE-EBFP + EGFP-FHA1×N diffusive cargo
 *   - INVERSE topology: FHA1×M on mCherry-MinD carrier + MinE-EBFP + PKAsub×N-EGFP diffusive cargo
 *   - Supports MinD Valency 1×..3×, Cargo Valency 1×..3×, WT vs R70A FHA1 vs T→A PKAsub controls,
 *     and custom AlphaFold / PDB image overrides defined in `assets/schematics/manifest.js`.
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
  const h = compact ? 178 : 208;

  const fhaFill = isR70A ? "#7c3aed" : "#2563eb";
  const fhaStroke = isR70A ? "#c084fc" : "#60a5fa";

  const subFill = isTAmut ? "#475569" : "#d97706";
  const subStroke = isTAmut ? "#94a3b8" : "#fbbf24";

  function drawFHA1(cx, cy, scale = 1.0) {
    const rw = 28 * scale;
    const rh = 17 * scale;
    const notch = isR70A
      ? `<polygon points="${cx - 4*scale},${cy - rh/2} ${cx + 4*scale},${cy - rh/2} ${cx},${cy - rh/2 + 5.5*scale}" fill="#1e1b4b" stroke="${fhaStroke}" stroke-width="1"/>`
      : `<path d="M ${cx - 5*scale} ${cy - rh/2} A 5 5 0 0 0 ${cx + 5*scale} ${cy - rh/2}" fill="#0f172a" stroke="${fhaStroke}" stroke-width="1"/>`;
    return `
      <g class="domain-fha1">
        <rect x="${cx - rw/2}" y="${cy - rh/2}" width="${rw}" height="${rh}" rx="${4*scale}" fill="${fhaFill}" stroke="${fhaStroke}" stroke-width="1.3"/>
        ${notch}
        <text x="${cx}" y="${cy + 3.5*scale}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${7.1*scale}px" font-weight="700">${isR70A ? "R70A" : "FHA1"}</text>
      </g>
    `;
  }

  function drawPKAsub(cx, cy, scale = 1.0) {
    const rw = 28 * scale;
    const rh = 14.5 * scale;
    const pBadge = isTAmut
      ? `<circle cx="${cx + rw/2 - 2*scale}" cy="${cy - rh/2}" r="${4.4*scale}" fill="#64748b" stroke="#0f172a" stroke-width="0.9"/>
         <text x="${cx + rw/2 - 2*scale}" y="${cy - rh/2 + 2.4*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, monospace" font-size="${6*scale}px" font-weight="700">A</text>`
      : `<circle cx="${cx + rw/2 - 2*scale}" cy="${cy - rh/2}" r="${4.6*scale}" fill="#ef4444" stroke="#0f172a" stroke-width="0.9"/>
         <text x="${cx + rw/2 - 2*scale}" y="${cy - rh/2 + 2.4*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, monospace" font-size="${6*scale}px" font-weight="700">P</text>`;
    return `
      <g class="domain-pkasub">
        <rect x="${cx - rw/2}" y="${cy - rh/2}" width="${rw}" height="${rh}" rx="${5*scale}" fill="${subFill}" stroke="${subStroke}" stroke-width="1.2"/>
        <text x="${cx - 1*scale}" y="${cy + 3*scale}" text-anchor="middle" fill="#fff" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.6*scale}px" font-weight="700">PKAsub</text>
        ${pBadge}
      </g>
    `;
  }

  const sc = compact ? 0.84 : 0.96;
  const memY = h - (compact ? 32 : 36);
  const anchorX = w * 0.31;
  const cargoX = w * 0.70;

  // MinD Carrier Repeats:
  //   - UPRIGHT: PKAsub×mdVal on mCherry-MinD (pCL340..342)
  //   - INVERSE: FHA1×mdVal on mCherry-MinD (pCL334..336 for WT; pCL368, pCL358, pCL371 for R70A)
  let anchorRepeatsSVG = "";
  const anchorBaseY = memY - 26 * sc;
  const stepY = 22 * sc;
  for (let i = 0; i < mdVal; i++) {
    const ry = anchorBaseY - (i + 1) * stepY;
    anchorRepeatsSVG += `<line x1="${anchorX}" y1="${ry + 8*sc}" x2="${anchorX}" y2="${ry + stepY - 7*sc}" stroke="#fb7185" stroke-width="2"/>`;
    if (isUpright) {
      anchorRepeatsSVG += drawPKAsub(anchorX, ry, sc);
    } else {
      anchorRepeatsSVG += drawFHA1(anchorX, ry, sc);
    }
  }
  const topAnchorY = anchorBaseY - mdVal * stepY - 12 * sc;
  const anchorHeaderLbl = isUpright
    ? `PKAsub (${mdVal}×)`
    : `${isR70A ? "FHA1[R70A]" : "FHA1[WT]"} (${mdVal}×)`;
  const anchorHeaderCol = isUpright ? "#fcd34d" : (isR70A ? "#d8b4fe" : "#93c5fd");

  // Diffusive EGFP Cargo Repeats:
  //   - UPRIGHT: EGFP-FHA1×cgVal (pCL347..349 for WT; pCL372..374 for R70A)
  //   - INVERSE: PKAsub×cgVal-EGFP (pCL354..356 for WT; pCW069, pCW073 for T→A)
  let cargoRepeatsSVG = "";
  const gfpY = compact ? 38 : 44;
  for (let j = 0; j < cgVal; j++) {
    const cy = gfpY + 24 * sc + j * stepY;
    const prevY = j === 0 ? (gfpY + 10 * sc) : (gfpY + 24 * sc + (j - 1) * stepY + 7 * sc);
    cargoRepeatsSVG += `<line x1="${cargoX}" y1="${prevY}" x2="${cargoX}" y2="${cy - 7*sc}" stroke="#34d399" stroke-width="2"/>`;
    if (isUpright) {
      cargoRepeatsSVG += drawFHA1(cargoX, cy, sc);
    } else {
      cargoRepeatsSVG += drawPKAsub(cargoX, cy, sc);
    }
  }
  const cargoHeaderLbl = isUpright
    ? `EGFP-${isR70A ? "FHA1[R70A]" : "FHA1"} (${cgVal}×)`
    : `${isTAmut ? "PKAsub[T→A]" : "PKAsub"}-EGFP (${cgVal}×)`;

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

  const constructDesc = construct.construct_desc || `${construct.carrier_domain}/MinE-EBFP/${construct.cargo_domain}`;

  const svgContent = `
    <div>
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="auto" style="background:#0f172a;border:1px solid #2a3655;border-radius:6px;display:block;">
        <rect x="8" y="6" width="88" height="15" rx="3" fill="${isUpright ? "rgba(59,130,246,0.22)" : "rgba(239,68,68,0.22)"}" stroke="${isUpright ? "#3b82f6" : "#ef4444"}" stroke-width="0.8"/>
        <text x="52" y="16.5" text-anchor="middle" fill="${isUpright ? "#93c5fd" : "#fca5a5"}" font-family="Inter, Arial, sans-serif" font-size="8.2px" font-weight="700">
          ${isUpright ? "UPRIGHT" : "INVERSE"} (${construct.valency})
        </text>

        <rect x="100" y="6" width="80" height="15" rx="3" fill="${isR70A ? "rgba(168,85,247,0.22)" : (isTAmut ? "rgba(100,116,139,0.28)" : "rgba(16,185,129,0.22)")}" stroke="${isR70A ? "#a855f7" : (isTAmut ? "#94a3b8" : "#10b981")}" stroke-width="0.8"/>
        <text x="140" y="16.5" text-anchor="middle" fill="${isR70A ? "#d8b4fe" : (isTAmut ? "#cbd5e1" : "#6ee7b7")}" font-family="JetBrains Mono, Consolas, monospace" font-size="7.8px" font-weight="700">
          ${isTAmut ? "PKAsub T→A" : `FHA1: ${mut}`}
        </text>

        <!-- Cellular Membranes + MinDE Carrier Wave -->
        <rect x="8" y="${memY}" width="${w - 16}" height="15" rx="3" fill="#0c4a6e" stroke="#0284c7" stroke-width="1"/>
        <text x="${w / 2}" y="${memY + 10.5}" text-anchor="middle" fill="#7dd3fc" font-family="Inter, Arial, sans-serif" font-size="7.5px" font-weight="600">
          Membrane Wave — mCherry-MinD + MinE-EBFP
        </text>

        <!-- mCherry-MinD Carrier Base -->
        <rect x="${anchorX - 31*sc}" y="${memY - 24*sc}" width="${62*sc}" height="${22*sc}" rx="4" fill="#9f1239" stroke="#fb7185" stroke-width="1.3"/>
        <text x="${anchorX}" y="${memY - 12.5*sc}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.9*sc}px" font-weight="700">mCh-MinD</text>
        <text x="${anchorX}" y="${memY - 3.8*sc}" text-anchor="middle" fill="#fecdd3" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.0*sc}px">Carrier (${mdVal}×)</text>

        ${anchorRepeatsSVG}
        <text x="${anchorX}" y="${Math.max(29, topAnchorY)}" text-anchor="middle" fill="${anchorHeaderCol}" font-family="Inter, Arial, sans-serif" font-size="${7.4*sc}px" font-weight="700">${anchorHeaderLbl}</text>

        <!-- EGFP Diffusive Cargo Client -->
        <circle cx="${cargoX}" cy="${gfpY}" r="${12.5*sc}" fill="#059669" stroke="#34d399" stroke-width="1.3"/>
        <text x="${cargoX}" y="${gfpY + 2.8*sc}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, Consolas, monospace" font-size="${6.5*sc}px" font-weight="700">EGFP</text>
        <text x="${cargoX}" y="${gfpY - 15*sc}" text-anchor="middle" fill="#6ee7b7" font-family="Inter, Arial, sans-serif" font-size="${7.4*sc}px" font-weight="700">${cargoHeaderLbl}</text>

        ${cargoRepeatsSVG}
        ${arrowsSVG}

        <!-- Footer Domain Readout -->
        <text x="${w / 2}" y="${h - 5.5}" text-anchor="middle" fill="#cbd5e1" font-family="JetBrains Mono, Consolas, monospace" font-size="7.3px" font-weight="600">
          ${construct.carrier_domain}  ⇄  ${construct.cargo_domain}
        </text>
      </svg>
      <div style="margin-top:4px;padding:4px 6px;background:#0a0f1d;border:1px solid #1e293b;border-radius:4px;font-family:var(--font-mono, monospace);font-size:9.6px;line-height:1.35;color:#94a3b8;">
        <div><span style="color:#64748b;">Plasmids:</span> <strong style="color:#e2e8f0;">${construct.plasmids || "—"}</strong></div>
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${constructDesc}"><span style="color:#64748b;">Manifest:</span> <span style="color:#38bdf8;">${constructDesc}</span></div>
      </div>
    </div>
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
