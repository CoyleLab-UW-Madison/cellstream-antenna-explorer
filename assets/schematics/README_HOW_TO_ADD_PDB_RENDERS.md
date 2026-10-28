# How to Backfill AlphaFold / PDB Structural Renderings

The **Cellstream Antenna-Circuit Explorer** includes an interactive vector schematic generator (`js/antenna_schematics.js`) that draws the exact domain topology (`mCherry-MinD` carrier, `MinE-EBFP` wave regulator, `FHA1` WT/R70A pockets, `PKAsub` phosphorylation sites, and `EGFP` cargo) for all 38 constructs out of the box:
- **Upright (`WT Upright`, `R70A Upright`)**: `PKAsub`×M fused to `mCherry-MinD` carrier + `FHA1`×N fused to `EGFP` cargo (`PKAsubxM-mCherry-MinD/MinE-EBFP/EGFP-FHA1xN`).
- **Inverse (`WT Inverse`, `R70A Inverse`, `TAmut Inverse`)**: `FHA1`×M fused to `mCherry-MinD` carrier + `PKAsub`×N fused to `EGFP` cargo (`FHA1xM-mCherry-MinD/MinE-EBFP/PKAsubxN-EGFP`).

## Adding Custom PDB / AlphaFold Images

1. Save your rendered image (`.png`, `.webp`, or `.svg`) into this folder (`assets/schematics/`), for example:
   - `assets/schematics/2x2_WT_upright.png`
   - `assets/schematics/3x2_WT_inverse.png`
2. Open [`manifest.js`](file:///C:/Users/smcoyle/Dropbox/CODEBASE/cellstream_antenna_explorer/assets/schematics/manifest.js) and set the corresponding construct key to the relative file path:
   ```javascript
   "2x2_WT_upright": "assets/schematics/2x2_WT_upright.png",
   ```
3. Reload `index.html`. Any construct with a non-null entry in `manifest.js` will automatically display your AlphaFold/PDB structural rendering with a toggle button to switch between the **3D Structure Render** and the **2D Domain Topology Schematic**.
