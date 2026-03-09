/**
 * WorldView - Development Server
 * Serves the frontend with HMR support
 */

import { join } from "node:path";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";
const CESIUM_PATH = join(ROOT, "node_modules/cesium/Build/Cesium");
const SATELLITE_JS_PATH = join(ROOT, "node_modules/satellite.js/dist");
const HLS_JS_PATH = join(ROOT, "node_modules/hls.js/dist");
const PUBLIC_PATH = join(ROOT, "public");

console.log(`Starting WorldView dev server on port ${PORT}...`);

// Content type mapping by file extension
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".ts": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const getContentType = (path: string): string => 
  CONTENT_TYPES[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";

/** Serve a static file with appropriate content type */
const serveFile = async (filePath: string, notFoundMsg: string): Promise<Response> => {
  const file = Bun.file(filePath);
  return (await file.exists())
    ? new Response(file, { headers: { "Content-Type": getContentType(filePath) } })
    : new Response(notFoundMsg, { status: 404 });
};

/** Transpile TypeScript file on the fly */
const serveTranspiledTS = async (filePath: string): Promise<Response | null> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  return new Response(transpiler.transformSync(await file.text()), {
    headers: { "Content-Type": "application/javascript" },
  });
};

// Route handlers for different path prefixes
const routeHandlers: Record<string, (pathname: string) => Promise<Response>> = {
  "/satellite.js/": (p) => serveFile(join(SATELLITE_JS_PATH, p.slice(14)), `satellite.js asset not found: ${p}`),
  "/hls.js/": (p) => serveFile(join(HLS_JS_PATH, p.slice(8)), `hls.js asset not found: ${p}`),
  "/cesium/": (p) => serveFile(join(CESIUM_PATH, p.slice(8)), `Cesium asset not found: ${p}`),
};

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

    // Check prefix-based route handlers
    for (const [prefix, handler] of Object.entries(routeHandlers)) {
      if (pathname.startsWith(prefix)) return handler(pathname);
    }

    // Transpile TypeScript files from src/
    if (pathname.startsWith("/src/") && pathname.endsWith(".ts")) {
      const response = await serveTranspiledTS(join(ROOT, pathname));
      if (response) return response;
    }

    // Serve JSON files from src/
    if (pathname.startsWith("/src/") && pathname.endsWith(".json")) {
      return serveFile(join(ROOT, pathname), `JSON file not found: ${pathname}`);
    }

    // Serve public assets
    return serveFile(join(PUBLIC_PATH, pathname), `Not Found: ${pathname}`);
  },
});

console.log(`WorldView running at http://localhost:${PORT}`);
console.log(`Make sure proxy is running on port 3001 for Google 3D Tiles`);
