/**
 * WorldView - Development Server
 * Serves the frontend with HMR support
 */

import { join } from "node:path";
import index from "../public/index.html";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";
const CESIUM_PATH = join(ROOT, "node_modules/cesium/Build/Cesium");
const PUBLIC_PATH = join(ROOT, "public");

console.log(`Starting WorldView dev server on port ${PORT}...`);

Bun.serve({
  port: PORT,
  routes: {
    "/": index,
  },
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Serve Cesium assets
    if (pathname.startsWith("/cesium/")) {
      const filePath = join(CESIUM_PATH, pathname.replace("/cesium/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // Serve public assets (styles.css, etc.)
    if (pathname.endsWith(".css")) {
      const filePath = join(PUBLIC_PATH, pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "text/css" },
        });
      }
    }

    // 404 for other requests
    return new Response("Not Found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`WorldView running at http://localhost:${PORT}`);
console.log(`Make sure proxy is running on port 3001 for Google 3D Tiles`);
