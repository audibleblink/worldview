/**
 * Tile Route Handlers
 *
 * Proxies requests to Google Maps tile servers for:
 * - 3D Photorealistic tiles (via tile.googleapis.com)
 * - 2D Map tiles (via mt1.google.com)
 */

import { corsResponse, errorResponse, imageResponse } from "../types.ts";

const GOOGLE_TILES_URL = "https://tile.googleapis.com";

/**
 * Proxy a request to tile.googleapis.com with API key injection.
 * Used for both the catch-all 3D tiles proxy and explicit tile routes.
 */
export async function proxyGoogleTiles(req: Request, apiKey: string): Promise<Response> {
  const url = new URL(req.url);
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
 * Handle 2D map tile requests
 *
 * Route: /map-tiles/:z/:x/:y
 * Query: ?lyrs=m (roadmap), s (satellite), p (terrain), y (hybrid), h (roads-only)
 */
export async function handleMapTiles(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/map-tiles\/(\d+)\/(\d+)\/(\d+)$/);

  if (!match) {
    return errorResponse("Invalid tile path", 400);
  }

  const [, z, x, y] = match;
  const lyrs = url.searchParams.get("lyrs") || "m";

  try {
    const response = await fetch(
      `https://mt1.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${z}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        },
      }
    );

    if (!response.ok) {
      console.error(`[Tiles] Map tile fetch failed: ${response.status}`);
      return corsResponse(null, { status: response.status });
    }

    const data = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("Content-Type") || "image/png";

    return imageResponse(data, contentType, {
      "Cache-Control": "public, max-age=86400",
    });
  } catch (error) {
    console.error("[Tiles] Map tile proxy error:", error);
    return errorResponse("Map tile proxy error", 502);
  }
}
