/**
 * Quick icon generator — run with Node.js to create PNG icons from the SVG.
 * Usage: node generate-icons.js
 * 
 * If you don't have Node canvas, you can manually convert icon.svg to PNGs
 * using any online SVG-to-PNG converter at sizes 16x16, 48x48, 128x128.
 * 
 * OR simply use the SVG directly — Chrome Manifest V3 also accepts SVG icons
 * by updating manifest.json icon paths to "icons/icon.svg".
 */

const fs = require("fs");
const path = require("path");

// For now, create simple colored square PNGs as placeholders
// These are valid 1x1 PNG files scaled — replace with real icons before store submission

// Minimal valid PNG (purple pixel) — use as placeholder
// In production, convert icon.svg to proper PNGs using Sharp, Canvas, or an online tool
const PLACEHOLDER_NOTE = `
To generate proper PNG icons:
1. Open icons/icon.svg in a browser
2. Use an online converter (e.g., svgtopng.com) to export at:
   - 16x16   → icon16.png
   - 48x48   → icon48.png  
   - 128x128 → icon128.png
3. Save them in this icons/ folder
4. Reload the extension in chrome://extensions

Alternatively, update manifest.json to use the SVG directly:
  "default_icon": "icons/icon.svg"
  "icons": { "128": "icons/icon.svg" }
`;

fs.writeFileSync(path.join(__dirname, "README.md"), PLACEHOLDER_NOTE.trim());
console.log("See icons/README.md for instructions on generating PNG icons.");
