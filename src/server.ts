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

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;

    // Serve index.html at root
    if (pathname === "/" || pathname === "/index.html") {
      const file = Bun.file(join(PUBLIC_PATH, "index.html"));
      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Serve satellite.js ES module from node_modules
    if (pathname.startsWith("/satellite.js/")) {
      const filePath = join(SATELLITE_JS_PATH, pathname.replace("/satellite.js/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "application/javascript" } });
      }
      return new Response("satellite.js asset not found: " + pathname, { status: 404 });
    }

    // Serve Cesium assets from node_modules
    if (pathname.startsWith("/cesium/")) {
      const filePath = join(CESIUM_PATH, pathname.replace("/cesium/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": getContentType(filePath) },
        });
      }
      return new Response("Cesium asset not found: " + pathname, { status: 404 });
    }

    // Serve TypeScript files from src/ - transpile on the fly
    if (pathname.startsWith("/src/") && pathname.endsWith(".ts")) {
      const filePath = join(ROOT, pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        // Use Bun's built-in transpiler
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const code = await file.text();
        const result = transpiler.transformSync(code);
        return new Response(result, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
    }

    // Serve public assets (styles.css, etc.)
    const publicFilePath = join(PUBLIC_PATH, pathname);
    const publicFile = Bun.file(publicFilePath);
    if (await publicFile.exists()) {
      return new Response(publicFile, {
        headers: { "Content-Type": getContentType(publicFilePath) },
      });
    }

    // 404 for other requests
    return new Response("Not Found: " + pathname, { status: 404 });
  },
});

console.log(`WorldView running at http://localhost:${PORT}`);
console.log(`Make sure proxy is running on port 3001 for Google 3D Tiles`);
