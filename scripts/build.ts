/**
 * WorldView - Production Build Script
 * Bundles the SolidJS application and copies static assets for deployment.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = import.meta.dir + "/..";
const DIST = join(ROOT, "dist");
const PUBLIC = join(ROOT, "public");

console.log("Building WorldView for production...\n");

// Clean & create dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });

// Bundle SolidJS application
console.log("Bundling SolidJS application...");
const result = await Bun.build({
  entrypoints: [join(ROOT, "src/index.tsx")],
  outdir: DIST,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "external",
  naming: { entry: "[name].[hash].js" },
});

if (!result.success) {
  console.error("Build failed:");
  result.logs.forEach((log) => console.error(log));
  process.exit(1);
}

const bundleFilename = basename(
  result.outputs.find((o) => o.kind === "entry-point")!.path
);
console.log(`  Created: ${bundleFilename}`);

// Process and write HTML with production asset paths
console.log("Processing HTML...");
const html = (await Bun.file(join(PUBLIC, "index.html")).text())
  .replace("/src/index.tsx", `./${bundleFilename}`)
  .replace("/cesium/Cesium.js", "./cesium/Cesium.js")
  .replace("/cesium/Widgets/widgets.css", "./cesium/Widgets/widgets.css");
await Bun.write(join(DIST, "index.html"), html);
console.log("  Created: index.html");

// Copy static assets
const ASSETS_TO_COPY: Array<{ label: string; src: string; dest: string }> = [
  { label: "styles.css", src: join(PUBLIC, "styles.css"), dest: join(DIST, "styles.css") },
  { label: "cesium/", src: join(ROOT, "node_modules/cesium/Build/Cesium"), dest: join(DIST, "cesium") },
  { label: "models/", src: join(PUBLIC, "models"), dest: join(DIST, "models") },
];

for (const { label, src, dest } of ASSETS_TO_COPY) {
  if (!existsSync(src)) {
    console.warn(`  WARNING: ${label} not found at ${src}`);
    continue;
  }
  cpSync(src, dest, { recursive: true });
  console.log(`  Copied: ${label}`);
}

// Bundle production server
console.log("Bundling server...");
const serverResult = await Bun.build({
  entrypoints: [join(ROOT, "src/server/index.ts")],
  outdir: DIST,
  target: "bun",
  format: "esm",
  minify: false,
  naming: { entry: "server.js" },
});

if (serverResult.success) {
  console.log("  Created: server.js");
} else {
  console.warn("  WARNING: Server build failed");
  serverResult.logs.forEach((log) => console.warn(log));
}

console.log("\nBuild complete! Output in ./dist/");
console.log("\nTo run production:");
console.log("  1. Serve ./dist/ with any static file server");
console.log("  2. Run: bun ./dist/server.js");
