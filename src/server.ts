/**
 * WorldView Development Server
 * Builds SolidJS app with Bun and serves with HMR.
 */

import { join } from "node:path";
import { SolidPlugin } from "bun-plugin-solid";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";

// Static vendor directories that need to be served directly
const VENDOR_ROUTES: Record<string, string> = {
  "/cesium/": join(ROOT, "node_modules/cesium/Build/Cesium"),
};

// Build the app bundle
async function buildApp() {
  const result = await Bun.build({
    entrypoints: [join(ROOT, "src/index.tsx")],
    outdir: join(ROOT, "dist"),
    naming: "[dir]/app.[ext]",
    sourcemap: "linked",
    minify: false,
    plugins: [SolidPlugin()],
  });
  
  if (!result.success) {
    console.error("Build failed:", result.logs);
    throw new Error("Build failed");
  }
  
  return result;
}

// Initial build
await buildApp();
console.log("Initial build complete");

Bun.serve({
  port: PORT,

  async fetch(req) {
    const { pathname } = new URL(req.url);

    // Serve index.html for root
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(Bun.file(join(ROOT, "public/index.html")));
    }

    // Serve built app bundle (rebuild on each request in dev)
    if (pathname === "/app.js" || pathname === "/app.js.map") {
      await buildApp();
      const filename = pathname.slice(1); // Remove leading /
      return new Response(Bun.file(join(ROOT, "dist", filename)));
    }

    // Serve Cesium from node_modules
    for (const [prefix, baseDir] of Object.entries(VENDOR_ROUTES)) {
      if (pathname.startsWith(prefix)) {
        const filePath = join(baseDir, pathname.slice(prefix.length));
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
      }
    }

    // Serve other public assets
    const publicPath = join(ROOT, "public", pathname);
    const publicFile = Bun.file(publicPath);
    if (await publicFile.exists()) {
      return new Response(publicFile);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`WorldView dev server running at http://localhost:${PORT}`);
console.log(`Ensure proxy is running on port 3001 for Google 3D Tiles`);
console.log(`Note: Refresh browser to pick up code changes (no HMR)`);
