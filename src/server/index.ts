/**
 * WorldView Server - Unified Proxy with Bun.serve
 *
 * Features:
 * - Route-based request handling (static + dynamic prefix matching)
 * - TTL caching with request coalescing on upstream API calls
 * - Consistent error response shapes
 * - Logging + error boundary middleware
 */

import { applyMiddleware, createRoutes } from "./middleware.ts";
import { corsResponse, jsonResponse } from "./types.ts";
import type { RouteHandler } from "./types.ts";
import { handleTLE, getTLECacheStats } from "./routes/tle.ts";
import { handleGeocode, getGeocodeCacheStats } from "./routes/geocode.ts";
import { handleCameraList, handleThumbnail, handleStream, handleHlsUrl, handleHlsRelay, initializeCCTV } from "./routes/cctv.ts";
import { handleShips } from "./routes/ships.ts";
import { handleRecordings } from "./recordings.ts";
import { handlePlanes, handlePlanesSearch } from "./routes/planes.ts";
import { handleOSM } from "./routes/osm.ts";
import { proxyGoogleTiles, handleMapTiles } from "./routes/tiles.ts";
import { initAISStreamClient } from "./websocket/ships.ts";

// Configuration
const SERVER_PORT = parseInt(process.env.SERVER_PORT || process.env.PROXY_PORT || "3001", 10);
// Validate required env vars
const validatedApiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;
if (!validatedApiKey) {
  console.error("ERROR: GOOGLE_MAPS_TILE_API_KEY environment variable is not set");
  console.error("Please create a .env file with your API key");
  process.exit(1);
}

// Initialize services
await initializeCCTV();
initAISStreamClient();

console.log(`Starting server on port ${SERVER_PORT}...`);

/**
 * Create static routes with middleware
 */
const staticRoutes = createRoutes({
  // Health check
  "/health": () => jsonResponse({ status: "ok" }),

  // TLE proxy
  "/tle": handleTLE,

  // Ships
  "/ships": handleShips,

  // Planes
  "/planes": handlePlanes,
  "/planes/search": handlePlanesSearch,

  // Geocoding
  "/geocode": handleGeocode,

  // CCTV
  "/api/cctv/cameras": handleCameraList,

  // OSM Overpass
  "/api/osm": handleOSM,

  // Cache stats (for monitoring)
  "/api/stats": () => jsonResponse({
    tle: getTLECacheStats(),
    geocode: getGeocodeCacheStats(),
  }),
});

/**
 * Dynamic routes that need prefix matching (parameterized paths).
 * Order matters: more specific prefixes must come before shorter ones
 * (e.g. /api/cctv/hls-relay/ before /api/cctv/hls/).
 */
const dynamicRoutes: Array<[prefix: string, handler: RouteHandler]> = [
  ["/api/recordings", handleRecordings],
  ["/api/cctv/thumbnail/", handleThumbnail],
  ["/api/cctv/stream/", handleStream],
  ["/api/cctv/hls-relay/", handleHlsRelay],
  ["/api/cctv/hls/", handleHlsUrl],
  ["/map-tiles/", handleMapTiles],
];

/**
 * Find handler for dynamic routes (prefix-matched paths)
 */
function findDynamicHandler(path: string): RouteHandler | null {
  for (const [prefix, handler] of dynamicRoutes) {
    if (path.startsWith(prefix)) return handler;
  }
  return null;
}

/**
 * Main server
 */
Bun.serve({
  port: SERVER_PORT,

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    // Static routes (exact match)
    const staticHandler = staticRoutes[path];
    if (staticHandler) {
      return staticHandler(req);
    }

    // Dynamic routes (prefix match)
    const dynamicHandler = findDynamicHandler(path);
    if (dynamicHandler) {
      return applyMiddleware(dynamicHandler)(req);
    }

    // Catch-all: Google 3D Tiles proxy
    // Paths include /v1/3dtiles/*, /session, etc.
    return proxyGoogleTiles(req, validatedApiKey);
  },
});

console.log(`Server running at http://localhost:${SERVER_PORT}`);
console.log(`Endpoints:`);
console.log(`  GET  /health                - Health check`);
console.log(`  GET  /tle?group=<name>      - TLE satellite data`);
console.log(`  GET  /ships                 - AIS ship data`);
console.log(`  GET  /planes                - OpenSky plane data`);
console.log(`  GET  /planes/search         - Search planes by callsign`);
console.log(`  GET  /geocode?address=<q>   - Geocoding`);
console.log(`  GET  /api/cctv/cameras      - CCTV camera list`);
console.log(`  GET  /api/cctv/thumbnail/:id - Camera thumbnail`);
console.log(`  GET  /api/cctv/stream/:id   - Camera MJPEG stream`);
console.log(`  GET  /api/cctv/hls/:id      - Signed HLS URL for token-gated streams`);
console.log(`  GET  /api/cctv/hls-relay/:id/:path - Server-side HLS proxy (avoids CORS)`);
console.log(`  POST /api/osm               - OSM Overpass queries`);
console.log(`  GET  /map-tiles/:z/:x/:y    - 2D map tiles`);
console.log(`  GET  /api/stats             - Cache statistics`);
console.log(`  *    /*                     - Google 3D Tiles proxy`);
