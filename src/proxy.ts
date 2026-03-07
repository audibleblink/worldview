/**
 * WorldView - Google 3D Tiles Proxy Server
 * Proxies requests to Google Maps Tile API with API key injection
 * Runs on port 3001
 */

const PROXY_PORT = 3001;
const GOOGLE_TILES_URL = "https://tile.googleapis.com";

// CORS headers used in multiple responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

// Get API key from environment
const apiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;

if (!apiKey) {
  console.error("ERROR: GOOGLE_MAPS_TILE_API_KEY environment variable is not set");
  console.error("Please create a .env file with your API key");
  process.exit(1);
}

console.log(`Starting Google 3D Tiles proxy on port ${PROXY_PORT}...`);

/** Create a response with CORS headers */
function corsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...init.headers },
  });
}

/** Create a JSON response with CORS headers */
function jsonResponse(data: object, status = 200): Response {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: PROXY_PORT,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return corsResponse(null);
    if (url.pathname === "/health") return jsonResponse({ status: "ok" });

    // TLE proxy: forward to CelesTrak
    if (url.pathname === "/tle") {
      const group = url.searchParams.get("group");
      if (!group) return jsonResponse({ error: "Missing ?group= parameter" }, 400);

      try {
        const response = await fetch(
          `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
        );
        return corsResponse(response.body, {
          status: response.status,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (error) {
        console.error("TLE proxy error:", error);
        return jsonResponse({ error: "TLE proxy error" }, 502);
      }
    }

    // Proxy to Google 3D Tiles
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
