/**
 * WorldView - Production Build Script
 * Bundles the application for production deployment
 * Supports SolidJS JSX transpilation
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";
const DIST = join(ROOT, "dist");
const PUBLIC = join(ROOT, "public");
const NODE_MODULES = join(ROOT, "node_modules");

console.log("Building WorldView for production...\n");

// Clean dist directory
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}
mkdirSync(DIST, { recursive: true });

// Bundle the SolidJS application
console.log("Bundling SolidJS application...");
const result = await Bun.build({
  entrypoints: [join(ROOT, "src/index.tsx")],
  outdir: DIST,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "external",
  naming: {
    entry: "[name].[hash].js",
  },
  // SolidJS JSX configuration
  // Bun handles this automatically when jsxImportSource is set in tsconfig.json
});

if (!result.success) {
  console.error("Build failed:");
  result.logs.forEach((log) => console.error(log));
  process.exit(1);
}

// Get the output filename
const mainBundle = result.outputs.find((o) => o.path.includes("index"));
const bundleFilename = mainBundle ? mainBundle.path.split("/").pop() : "index.js";

console.log(`  Created: ${bundleFilename}`);

// Copy and process HTML
console.log("Processing HTML...");
const htmlSource = await Bun.file(join(PUBLIC, "index.html")).text();
const htmlProcessed = htmlSource
  .replace('/src/index.tsx', `./${bundleFilename}`)
  .replace('/cesium/Cesium.js', './cesium/Cesium.js')
  .replace('/cesium/Widgets/widgets.css', './cesium/Widgets/widgets.css');

await Bun.write(join(DIST, "index.html"), htmlProcessed);
console.log("  Created: index.html");

// Copy CSS
console.log("Copying styles...");
copyFileSync(join(PUBLIC, "styles.css"), join(DIST, "styles.css"));
console.log("  Created: styles.css");

// Copy CesiumJS assets
console.log("Copying CesiumJS assets...");
const cesiumSource = join(NODE_MODULES, "cesium/Build/Cesium");
const cesiumDest = join(DIST, "cesium");

if (existsSync(cesiumSource)) {
  cpSync(cesiumSource, cesiumDest, { recursive: true });
  console.log("  Copied: cesium/");
} else {
  console.warn("  WARNING: CesiumJS assets not found at", cesiumSource);
}

// Copy local models
console.log("Copying local models...");
const modelsSource = join(PUBLIC, "models");
const modelsDest = join(DIST, "models");

if (existsSync(modelsSource)) {
  cpSync(modelsSource, modelsDest, { recursive: true });
  console.log("  Copied: models/");
} else {
  console.warn("  WARNING: Models not found at", modelsSource);
}

// Build proxy server (separate bundle)
console.log("Bundling proxy server...");
const proxyResult = await Bun.build({
  entrypoints: [join(ROOT, "src/proxy.ts")],
  outdir: DIST,
  target: "bun",
  format: "esm",
  minify: false,
  naming: {
    entry: "proxy.js",
  },
});

if (proxyResult.success) {
  console.log("  Created: proxy.js");
} else {
  console.warn("  WARNING: Proxy build failed");
}

console.log("\nBuild complete! Output in ./dist/");
console.log("\nTo run production:");
console.log("  1. Serve ./dist/ with any static file server");
console.log("  2. Run: bun ./dist/proxy.js");
