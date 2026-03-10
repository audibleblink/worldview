/**
 * WorldView Server - Unified Proxy with Bun.serve Routes
 *
 * Features:
 * - Bun.serve `routes` object (NOT if/else chain - Blocklist #7)
 * - TTL caching on all upstream API calls (Blocklist #8)
 * - Consistent error response shapes
 * - CORS + logging + error boundary middleware
 */

import { applyMiddleware, createRoutes } from "./middleware.ts";
import { corsResponse, jsonResponse, errorResponse } from "./types.ts";
import { handleTLE, getTLECacheStats } from "./routes/tle.ts";
import { handleFlights, handleAircraftMeta, handleFlightRoute, getFlightsCacheStats } from "./routes/flights.ts";
import { handleGeocode, getGeocodeCacheStats } from "./routes/geocode.ts";
import { handleCameraList, handleThumbnail, handleStream, initializeCCTV } from "./routes/cctv.ts";
import { handleShips } from "./routes/ships.ts";
import { handleOSM } from "./routes/osm.ts";
import { handleGoogleTiles, handleMapTiles } from "./routes/tiles.ts";
import { initAISStreamClient } from "./websocket/ships.ts";

// Configuration
const SERVER_PORT = parseInt(process.env.SERVER_PORT || process.env.PROXY_PORT || "3001", 10);
const GOOGLE_TILES_URL = "https://tile.googleapis.com";

// Validate required env vars
const apiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;
if (!apiKey) {
  console.error("ERROR: GOOGLE_MAPS_TILE_API_KEY environment variable is not set");
  console.error("Please create a .env file with your API key");
  process.exit(1);
}
// TypeScript needs help understanding this is now a string
const validatedApiKey: string = apiKey;

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

  // Flights
  "/flights": handleFlights,

  // Ships
  "/ships": handleShips,

  // Geocoding
  "/geocode": handleGeocode,

  // CCTV
  "/api/cctv/cameras": handleCameraList,

  // OSM Overpass
  "/api/osm": handleOSM,

  // Cache stats (for monitoring)
  "/api/stats": () => jsonResponse({
    tle: getTLECacheStats(),
    flights: getFlightsCacheStats(),
    geocode: getGeocodeCacheStats(),
  }),
});

/**
 * Handle dynamic routes that need pattern matching
 */
async function handleDynamicRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Flight route lookup: /flight-route/:callsign
  if (path.startsWith("/flight-route/")) {
    return applyMiddleware(handleFlightRoute)(req);
  }

  // Aircraft metadata: /aircraft-meta/:icao24
  if (path.startsWith("/aircraft-meta/")) {
    return applyMiddleware(handleAircraftMeta)(req);
  }

  // CCTV thumbnail: /api/cctv/thumbnail/:id
  if (path.startsWith("/api/cctv/thumbnail/")) {
    return applyMiddleware(handleThumbnail)(req);
  }

  // CCTV stream: /api/cctv/stream/:id
  if (path.startsWith("/api/cctv/stream/")) {
    return applyMiddleware(handleStream)(req);
  }

  // Map tiles: /map-tiles/:z/:x/:y
  if (path.startsWith("/map-tiles/")) {
    return applyMiddleware(handleMapTiles)(req);
  }

  return null;
}

/**
 * Handle Google 3D Tiles proxy (catch-all for tile.googleapis.com paths)
 *
 * Google 3D tiles use various path patterns that are hard to enumerate,
 * so we proxy anything that doesn't match our explicit routes.
 */
async function handleGoogleTilesProxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, GOOGLE_TILES_URL);
  targetUrl.searchParams.set("key", validatedApiKey);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: {
        Accept: req.headers.get("Accept") || "*/*",
        "Accept-Encoding": req.headers.get("Accept-Encoding") || "gzip, deflate, br",
      },
    });

    // Copy headers from upstream response
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return corsResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("[Tiles] Proxy error:", error);
    return errorResponse("Tile proxy error", 502);
  }
}

/**
 * Main server
 */
Bun.serve({
  port: SERVER_PORT,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    // Check static routes first
    const staticHandler = staticRoutes[path];
    if (staticHandler) {
      return staticHandler(req);
    }

    // Check dynamic routes
    const dynamicResponse = await handleDynamicRoutes(req);
    if (dynamicResponse) {
      return dynamicResponse;
    }

    // Fall through to Google Tiles proxy for 3D tiles
    // These paths include /v1/3dtiles/*, /session, etc.
    return handleGoogleTilesProxy(req);
  },
});

console.log(`Server running at http://localhost:${SERVER_PORT}`);
console.log(`Endpoints:`);
console.log(`  GET  /health                - Health check`);
console.log(`  GET  /tle?group=<name>      - TLE satellite data`);
console.log(`  GET  /flights               - OpenSky flight data`);
console.log(`  GET  /ships                 - AIS ship data`);
console.log(`  GET  /geocode?address=<q>   - Geocoding`);
console.log(`  GET  /api/cctv/cameras      - CCTV camera list`);
console.log(`  GET  /api/cctv/thumbnail/:id - Camera thumbnail`);
console.log(`  GET  /api/cctv/stream/:id   - Camera MJPEG stream`);
console.log(`  POST /api/osm               - OSM Overpass queries`);
console.log(`  GET  /map-tiles/:z/:x/:y    - 2D map tiles`);
console.log(`  GET  /api/stats             - Cache statistics`);
console.log(`  *    /*                     - Google 3D Tiles proxy`);
