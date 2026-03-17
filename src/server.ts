/**
 * WorldView Development Server
 * Uses Bun's native HTML imports with automatic bundling and HMR.
 */

import { join } from "node:path";
import homepage from "../public/index.html";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";

// Static vendor directories that need to be served directly
const VENDOR_ROUTES: Record<string, string> = {
  "/cesium/": join(ROOT, "node_modules/cesium/Build/Cesium"),
};

Bun.serve({
  port: PORT,
  
  routes: {
    // Bun automatically bundles the HTML and its script/link tags
    "/": homepage,
  },

  // Development mode: HMR, source maps, re-bundle on each request
  development: {
    hmr: true,
    console: true,
  },

  // Handle vendor files and other static assets
  async fetch(req) {
    const { pathname } = new URL(req.url);

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
