/**
 * WorldView - Unified Proxy Server
 * 
 * Modular proxy server handling:
 * - Google 3D Tiles
 * - TLE satellite data
 * - OpenSky flight data
 * - FlightAware routes
 * - CCTV cameras
 * - Geocoding
 * - OSM road data
 */

import { corsResponse, jsonResponse } from "./types.ts";
import { openSkyClient } from "./opensky.ts";
import { flightAwareClient } from "./flights.ts";
import { cctvProxyManager } from "./cctv.ts";
import { handleGeocode } from "./geocode.ts";
import { handleTLE } from "./tle.ts";
import { handleOSM } from "./osm.ts";

const PROXY_PORT = 3001;
const GOOGLE_TILES_URL = "https://tile.googleapis.com";

// Get API key from environment
const apiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;

if (!apiKey) {
  console.error("ERROR: GOOGLE_MAPS_TILE_API_KEY environment variable is not set");
  console.error("Please create a .env file with your API key");
  process.exit(1);
}

// Initialize CCTV camera caches
cctvProxyManager.initialize();

console.log(`Starting proxy server on port ${PROXY_PORT}...`);

Bun.serve({
  port: PROXY_PORT,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") return corsResponse(null);

    // Health check
    if (url.pathname === "/health") return jsonResponse({ status: "ok" });

    // TLE proxy
    if (url.pathname === "/tle") {
      return handleTLE(url);
    }

    // OpenSky flights
    if (url.pathname === "/flights") {
      return openSkyClient.fetchStates();
    }

    // FlightAware route lookup
    const routeMatch = url.pathname.match(/^\/flight-route\/(.+)$/);
    if (routeMatch?.[1]) {
      return flightAwareClient.lookupRoute(routeMatch[1]);
    }

    // Aircraft metadata
    const metaMatch = url.pathname.match(/^\/aircraft-meta\/([a-f0-9]+)$/i);
    if (metaMatch?.[1]) {
      return openSkyClient.fetchMetadata(metaMatch[1]);
    }

    // CCTV camera list
    if (url.pathname === "/api/cctv/cameras") {
      return cctvProxyManager.handleCameraList(url);
    }

    // CCTV thumbnail
    const thumbnailMatch = url.pathname.match(/^\/api\/cctv\/thumbnail\/(.+)$/);
    if (thumbnailMatch?.[1]) {
      return cctvProxyManager.handleThumbnail(thumbnailMatch[1]);
    }

    // CCTV stream
    const streamMatch = url.pathname.match(/^\/api\/cctv\/stream\/(.+)$/);
    if (streamMatch?.[1]) {
      return cctvProxyManager.handleStream(streamMatch[1]);
    }

    // OSM Overpass
    if (url.pathname === "/api/osm") {
      return handleOSM(req);
    }

    // Geocoding
    if (url.pathname === "/geocode") {
      return handleGeocode(url, apiKey);
    }

    // Google Maps 2D tiles (full map view with roads, labels, towns, etc.)
    // lyrs options: m=roadmap, s=satellite, p=terrain, y=hybrid, h=roads-only
    const mapTileMatch = url.pathname.match(/^\/map-tiles\/(\d+)\/(\d+)\/(\d+)$/);
    if (mapTileMatch) {
      const [, z, x, y] = mapTileMatch;
      const lyrs = url.searchParams.get("lyrs") || "m"; // default to roadmap
      
      // Use Google Maps tile server
      // lyrs: m=roadmap, s=satellite, p=terrain, y=hybrid (sat+labels), h=roads only
      const mtTileUrl = `https://mt1.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${z}`;
      
      try {
        const response = await fetch(mtTileUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          },
        });
        
        if (!response.ok) {
          console.error(`Map tile fetch failed: ${response.status}`);
          return corsResponse(null, { status: response.status });
        }
        
        return corsResponse(response.body, {
          status: 200,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch (error) {
        console.error("Map tile proxy error:", error);
        return jsonResponse({ error: "Map tile proxy error" }, 502);
      }
    }

    // Google Tiles proxy (default)
    const targetUrl = new URL(url.pathname + url.search, GOOGLE_TILES_URL);
    targetUrl.searchParams.set("key", apiKey);

    try {
      const response = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: {
          Accept: req.headers.get("Accept") || "*/*",
          "Accept-Encoding": req.headers.get("Accept-Encoding") || "gzip, deflate, br",
        },
      });
      return corsResponse(response.body, {
        status: response.status,
        headers: Object.fromEntries(response.headers),
      });
    } catch (error) {
      console.error("Proxy error:", error);
      return jsonResponse({ error: "Proxy error" }, 502);
    }
  },
});

console.log(`Proxy server running at http://localhost:${PROXY_PORT}`);
