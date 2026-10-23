# How to Backfill AlphaFold / PDB Structural Renderings

The **Cellstream Antenna-Circuit Explorer** includes an interactive vector schematic generator (`js/antenna_schematics.js`) that draws the exact domain topology (`cterm` anchor, `FHA1` WT/R70A pockets, `PKAsub` phosphorylation sites, `mCherry` cargo, and `mTurquoise2-MinD` carrier carpet) for all 36 constructs out of the box.

## Adding Custom PDB / AlphaFold Images

1. Save your rendered image (`.png`, `.webp`, or `.svg`) into this folder (`assets/schematics/`), for example:
   - `assets/schematics/2x2_WT_upright.png`
   - `assets/schematics/3x2_WT_inverse.png`
2. Open [`manifest.js`](file:///C:/Users/smcoyle/Dropbox/CODEBASE/cellstream_antenna_explorer/assets/schematics/manifest.js) and set the corresponding construct key to the relative file path:
   ```javascript
   "2x2_WT_upright": "assets/schematics/2x2_WT_upright.png",
   ```
3. Reload `index.html`. Any construct with a non-null entry in `manifest.js` will automatically display your AlphaFold/PDB structural rendering with a toggle button to switch between the **3D Structure Render** and the **2D Domain Topology Schematic**.
