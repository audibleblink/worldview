/**
 * WorldView - Development Server
 * Serves the frontend with HMR support
 */

import { join } from "node:path";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";
const CESIUM_PATH = join(ROOT, "node_modules/cesium/Build/Cesium");
const SATELLITE_JS_PATH = join(ROOT, "node_modules/satellite.js/dist");
const PUBLIC_PATH = join(ROOT, "public");
const SRC_PATH = join(ROOT, "src");

console.log(`Starting WorldView dev server on port ${PORT}...`);

// Content type mapping by file extension
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Serve a static file with appropriate content type */
async function serveFile(filePath: string, notFoundMsg: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, { headers: { "Content-Type": getContentType(filePath) } });
  }
  return new Response(notFoundMsg, { status: 404 });
}

/** Transpile TypeScript file on the fly */
async function serveTranspiledTS(filePath: string): Promise<Response | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const result = transpiler.transformSync(await file.text());
  return new Response(result, { headers: { "Content-Type": "application/javascript" } });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // Serve index.html at root
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(Bun.file(join(PUBLIC_PATH, "index.html")), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Serve satellite.js ES module from node_modules
    if (pathname.startsWith("/satellite.js/")) {
      const filePath = join(SATELLITE_JS_PATH, pathname.slice(14));
      return serveFile(filePath, `satellite.js asset not found: ${pathname}`);
    }

    // Serve Cesium assets from node_modules
    if (pathname.startsWith("/cesium/")) {
      const filePath = join(CESIUM_PATH, pathname.slice(8));
      return serveFile(filePath, `Cesium asset not found: ${pathname}`);
    }

    // Transpile TypeScript files from src/
    if (pathname.startsWith("/src/") && pathname.endsWith(".ts")) {
      const response = await serveTranspiledTS(join(ROOT, pathname));
      if (response) return response;
    }

    // Serve public assets
    return serveFile(join(PUBLIC_PATH, pathname), `Not Found: ${pathname}`);
  },
});

console.log(`WorldView running at http://localhost:${PORT}`);
console.log(`Make sure proxy is running on port 3001 for Google 3D Tiles`);
