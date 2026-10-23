# Cellstream Antenna-Circuit Explorer

Interactive web exploration interface for the **36-member (`4 × 3×3`) $\text{Bt}_2\text{cAMP}$-inducible MinDE antenna-circuit library** (plus $\text{T}\to\text{A}$ non-phosphorylatable controls).

---

## Quick Start (Local Viewing & GitHub Pages)

### 1. Open Directly in Any Browser (`file://` Ready)
Because the compiled library dataset is packaged as both `data/antenna_library_bundle.json` and `data/antenna_library_bundle.js` (`window.ANTENNA_LIBRARY_DATA`), you can double-click [`index.html`](index.html) directly in Windows Explorer/Finder without needing a local web server.

### 2. Optional Local HTTP Server
```bash
cd C:\Users\smcoyle\Dropbox\CODEBASE\cellstream_antenna_explorer
python -m http.server 8080
# Open http://localhost:8080 in your browser
```

### 3. Deploy to GitHub Pages
This repository is a zero-build static web app (`index.html`, `css/`, `js/`, `data/`, `assets/`):
1. Initialize a Git repository in `cellstream_antenna_explorer` (or push to a new GitHub repo):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Cellstream Antenna-Circuit Explorer"
   git branch -M main
   git remote add origin https://github.com/<your-username>/cellstream-antenna-explorer.git
   git push -u origin main
   ```
2. In your GitHub repository settings, go to **Settings → Pages**, set Source to **Deploy from a branch (`main` / `/root`)**, and save.

---

## 5 Interactive Exploration Modes

1. **Mode 1 — Single-Circuit Deep-Dive**:
   - View **all 9 intrinsic 2D stoichiometry phase portraits at once** (`Saturated 5 mM Coupling`, `Basal 0 mM Coupling`, `Inducible Coupling Swing ΔC`, `Coupling Hill EC₅₀`, `Frequency Shift ΔF%`, `MinD Carrier Amp Shift ΔD%`, `Per-Carrier Loading Fold`, `Total Cargo AM Fold`, and `Wave Awakening ΔOsc%`), **or** zoom in on any single metric paired side-by-side with its **4-Quadrant Dose-Response Curves (`0–5.0 mM Bt₂cAMP`)**.
   - Toggle the **High-Confidence Black Contour Filter** (`Black Contour ON`, `Contour OFF`, or `Raw Unfiltered`).
   - Switch between **Pixel-Voxel (`64×64` superpixels)** and **Single-Cell `ultrack` Mask (`1 Cell = 1 Vote`)** dose-response curves.
   - Inspect the interactive **Molecular Antenna Architecture Schematic** (`Upright` vs `Inverse`, `1×..3×` valency, `FHA1(WT)` vs `FHA1(R70A)` vs `PKAsub(T→A)`).

2. **Mode 2 — $3\times 3$ Family Explorer**:
   - Inspect repeat-valency scaling (`1×1 → 3×3`) within each of the 4 families (`WT Inverse`, `WT Upright`, `R70A Inverse`, `R70A Upright`) for either 2D Phase Portraits or 4-Quadrant Dose-Response Curves (`Pixel` or `Cell`).

3. **Mode 3 — Full $4 \times (3\times 3)$ Library Overview**:
   - View all 36 circuits simultaneously in the canonical $6\times 6$ layout (plus the `3x3 T→A` negative controls) for any 2D phase portrait metric or any 4-quadrant dose-response metric (`Pixel` or `Cell`).

4. **Mode 4 — Side-by-Side Pairwise Comparator**:
   - Compare any two circuits (`Circuit A` vs `Circuit B`) side-by-side with a live **$\Delta(A - B)$ Difference Phase Portrait**, paired 4-quadrant dose-response curves, antenna schematics, and quantitative `Q1..Q4` Hill parameter tables.

5. **Mode 5 — Target Response Finder ("Inverse Design")**:
   - Click any stoichiometry bin $(bx, by)$ or quadrant (`Q1..Q4`) on the 2D phase portrait pad and specify target response features (or pick a biophysical archetype preset) to rank and retrieve the closest matching circuits from the 36-member library.

---

## Back-Filling Custom AlphaFold / PDB Structure Renders

See [`assets/schematics/README_HOW_TO_ADD_PDB_RENDERS.md`](assets/schematics/README_HOW_TO_ADD_PDB_RENDERS.md). Drop PNG/SVG/WebP images into `assets/schematics/` and register them in [`assets/schematics/manifest.js`](assets/schematics/manifest.js) to display a **Vector Schematic / AlphaFold PDB** toggle in the UI.
