/**
 * WorldView - Google 3D Tiles Proxy Server
 * Proxies requests to Google Maps Tile API with API key injection
 * Also proxies OpenSky Network API for flight data
 * Runs on port 3001
 */

const PROXY_PORT = 3001;
const GOOGLE_TILES_URL = "https://tile.googleapis.com";
const OPENSKY_API_URL = "https://opensky-network.org/api";

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

// OpenSky OAuth2 credentials (optional - falls back to anonymous requests)
// Basic auth is deprecated as of March 18, 2026 - now requires OAuth2 client credentials flow
const openskyClientId = process.env.OPENSKY_CLIENT_ID;
const openskyClientSecret = process.env.OPENSKY_CLIENT_SECRET;

if (!openskyClientId || !openskyClientSecret) {
  console.warn("WARNING: OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET not set - using anonymous requests (rate limited)");
  console.warn("Create an API client at https://opensky-network.org/my-opensky/account to get credentials");
}

// OAuth2 token management
const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_REFRESH_MARGIN = 30; // seconds before expiry to refresh

interface TokenState {
  accessToken: string | null;
  expiresAt: number; // timestamp in ms
}

const tokenState: TokenState = {
  accessToken: null,
  expiresAt: 0,
};

/**
 * Get a valid OpenSky OAuth2 access token, refreshing if needed
 */
async function getOpenSkyToken(): Promise<string | null> {
  if (!openskyClientId || !openskyClientSecret) {
    return null;
  }

  // Return cached token if still valid
  if (tokenState.accessToken && Date.now() < tokenState.expiresAt) {
    return tokenState.accessToken;
  }

  // Fetch new token
  try {
    const response = await fetch(OPENSKY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: openskyClientId,
        client_secret: openskyClientSecret,
      }),
    });

    if (!response.ok) {
      console.error(`OpenSky token error: ${response.status} ${response.statusText}`);
      tokenState.accessToken = null;
      tokenState.expiresAt = 0;
      return null;
    }

    const data = await response.json();
    const expiresIn = data.expires_in ?? 1800; // default 30 minutes
    tokenState.accessToken = data.access_token;
    tokenState.expiresAt = Date.now() + (expiresIn - TOKEN_REFRESH_MARGIN) * 1000;

    console.log(`[OpenSky] Token refreshed, expires in ${expiresIn}s`);
    return tokenState.accessToken;
  } catch (error) {
    console.error("OpenSky token fetch error:", error);
    tokenState.accessToken = null;
    tokenState.expiresAt = 0;
    return null;
  }
}

// In-memory cache for aircraft metadata (never evicted)
const aircraftMetaCache = new Map<string, object>();

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

    // OpenSky flights proxy: forward to OpenSky Network API
    if (url.pathname === "/flights") {
      const openskyUrl = `${OPENSKY_API_URL}/states/all`;
      const headers: Record<string, string> = {};
      
      // Use OAuth2 Bearer token if credentials are configured
      const token = await getOpenSkyToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(openskyUrl, { headers });
        if (!response.ok) {
          console.error(`OpenSky API error: ${response.status} ${response.statusText}`);
          return jsonResponse({ error: "OpenSky API error", status: response.status }, 502);
        }
        const data = await response.json();
        return jsonResponse(data);
      } catch (error) {
        console.error("Flights proxy error:", error);
        return jsonResponse({ error: "Flights proxy error" }, 502);
      }
    }

    // OpenSky aircraft metadata proxy with caching
    const metaMatch = url.pathname.match(/^\/aircraft-meta\/([a-f0-9]+)$/i);
    if (metaMatch && metaMatch[1]) {
      const icao24 = metaMatch[1].toLowerCase();

      // Return cached response if available
      if (aircraftMetaCache.has(icao24)) {
        return jsonResponse(aircraftMetaCache.get(icao24)!);
      }

      const openskyUrl = `${OPENSKY_API_URL}/metadata/aircraft/icao/${icao24}`;
      const headers: Record<string, string> = {};
      
      // Use OAuth2 Bearer token if credentials are configured
      const token = await getOpenSkyToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(openskyUrl, { headers });
        if (!response.ok) {
          // Don't cache errors - return appropriate status
          if (response.status === 404) {
            return jsonResponse({ error: "Aircraft not found", icao24 }, 404);
          }
          console.error(`OpenSky metadata API error: ${response.status} ${response.statusText}`);
          return jsonResponse({ error: "OpenSky metadata API error", status: response.status }, 502);
        }
        const data = await response.json();
        // Cache successful response (never evicted)
        aircraftMetaCache.set(icao24, data);
        return jsonResponse(data);
      } catch (error) {
        console.error("Aircraft metadata proxy error:", error);
        return jsonResponse({ error: "Aircraft metadata proxy error" }, 502);
      }
    }

    // Proxy all other requests to Google
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
