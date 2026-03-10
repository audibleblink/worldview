/**
 * WorldView - Development Server
 * Serves the frontend with HMR support and SolidJS JSX transpilation
 */

import { join } from "node:path";
import * as babel from "@babel/core";

const PORT = 3000;
const ROOT = import.meta.dir + "/..";
const CESIUM_PATH = join(ROOT, "node_modules/cesium/Build/Cesium");
const SATELLITE_JS_PATH = join(ROOT, "node_modules/satellite.js/dist");
const HLS_JS_PATH = join(ROOT, "node_modules/hls.js/dist");
const SOLID_JS_PATH = join(ROOT, "node_modules/solid-js");
const PUBLIC_PATH = join(ROOT, "public");

console.log(`Starting WorldView dev server on port ${PORT}...`);

// Content type mapping by file extension
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".ts": "application/javascript",
  ".tsx": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
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

/**
 * Rewrite relative imports to include file extensions for browser ES modules.
 * Converts "./Foo" to "./Foo.tsx" or "./Foo.ts" based on what exists.
 */
const rewriteImports = async (code: string, currentFilePath: string): Promise<string> => {
  const dir = currentFilePath.slice(0, currentFilePath.lastIndexOf("/"));
  
  // Match various import/export patterns with relative paths
  // 1. import { x } from "./path"
  // 2. import x from "./path"
  // 3. import "./path" (side-effect)
  // 4. export { x } from "./path"
  const importFromRegex = /(import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s+['"])(\.[^'"]+)(['"])/g;
  const sideEffectImportRegex = /(import\s+['"])(\.[^'"]+)(['"])/g;
  const exportFromRegex = /(export\s+(?:\{[^}]*\}|\*)\s+from\s+['"])(\.[^'"]+)(['"])/g;
  
  const resolveExtension = async (importPath: string): Promise<string> => {
    // Skip if already has extension
    if (/\.(tsx?|js|mjs|json|css)$/.test(importPath)) {
      return importPath;
    }
    
    // Try .tsx first, then .ts, then /index.tsx, then /index.ts
    const basePath = join(dir, importPath);
    const candidates = [
      { path: basePath + ".tsx", ext: ".tsx" },
      { path: basePath + ".ts", ext: ".ts" },
      { path: join(basePath, "index.tsx"), ext: "/index.tsx" },
      { path: join(basePath, "index.ts"), ext: "/index.ts" },
    ];
    
    for (const { path, ext } of candidates) {
      if (await Bun.file(path).exists()) {
        return importPath + ext;
      }
    }
    
    // Fallback: assume .tsx
    return importPath + ".tsx";
  };
  
  // Collect all matches and their replacements
  const replacements: Map<string, string> = new Map();
  
  const processMatches = async (regex: RegExp) => {
    for (const match of code.matchAll(regex)) {
      const [full, prefix, importPath, suffix] = match;
      const resolved = await resolveExtension(importPath);
      replacements.set(full, prefix + resolved + suffix);
    }
  };
  
  await processMatches(importFromRegex);
  await processMatches(sideEffectImportRegex);
  await processMatches(exportFromRegex);
  
  // Apply all replacements
  let result = code;
  for (const [original, replacement] of replacements) {
    result = result.replace(original, replacement);
  }
  
  return result;
};

/** Transpile TypeScript file on the fly */
const serveTranspiledTS = async (filePath: string): Promise<Response | null> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  let code = transpiler.transformSync(await file.text());
  code = await rewriteImports(code, filePath);
  return new Response(code, {
    headers: { "Content-Type": "application/javascript" },
  });
};

/** Transpile TSX (SolidJS JSX) file on the fly using Babel */
const serveTranspiledTSX = async (filePath: string): Promise<Response | null> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  
  const source = await file.text();
  
  // Use Babel with babel-preset-solid for proper SolidJS JSX transformation
  const result = await babel.transformAsync(source, {
    filename: filePath,
    presets: [
      ["babel-preset-solid", { generate: "dom", hydratable: false }],
      ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
    ],
  });
  
  if (!result?.code) {
    return new Response("Transpilation failed", { status: 500 });
  }
  
  // Rewrite relative imports to include extensions
  const code = await rewriteImports(result.code, filePath);
  
  return new Response(code, {
    headers: { "Content-Type": "application/javascript" },
  });
};

// Map solid-js subpath imports to their dist files
const solidJsResolver = (pathname: string): Promise<Response> => {
  const subpath = pathname.slice(10); // remove "/solid-js/"
  if (subpath === "solid.js") {
    return serveFile(join(SOLID_JS_PATH, "dist/dev.js"), `solid-js not found`);
  } else if (subpath === "web.js") {
    return serveFile(join(SOLID_JS_PATH, "web/dist/dev.js"), `solid-js/web not found`);
  } else if (subpath === "store.js") {
    return serveFile(join(SOLID_JS_PATH, "store/dist/dev.js"), `solid-js/store not found`);
  }
  return serveFile(join(SOLID_JS_PATH, subpath), `solid-js asset not found: ${pathname}`);
};

// Route handlers for different path prefixes
const routeHandlers: Record<string, (pathname: string) => Promise<Response>> = {
  "/solid-js/": solidJsResolver,
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

    // Transpile TSX files (SolidJS) from src/
    if (pathname.startsWith("/src/") && pathname.endsWith(".tsx")) {
      const response = await serveTranspiledTSX(join(ROOT, pathname));
      if (response) return response;
    }

    // Transpile TypeScript files from src/
    if (pathname.startsWith("/src/") && pathname.endsWith(".ts")) {
      const response = await serveTranspiledTS(join(ROOT, pathname));
      if (response) return response;
    }

    // Serve JSON files from src/ as ES modules (wrap in export default)
    if (pathname.startsWith("/src/") && pathname.endsWith(".json")) {
      const file = Bun.file(join(ROOT, pathname));
      if (await file.exists()) {
        const json = await file.text();
        return new Response(`export default ${json};`, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      return new Response(`JSON file not found: ${pathname}`, { status: 404 });
    }

    // Serve public assets (including models/)
    return serveFile(join(PUBLIC_PATH, pathname), `Not Found: ${pathname}`);
  },
});

console.log(`WorldView running at http://localhost:${PORT}`);
console.log(`Make sure proxy is running on port 3001 for Google 3D Tiles`);
