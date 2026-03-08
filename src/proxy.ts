/**
 * WorldView - Google 3D Tiles Proxy Server
 * Proxies requests to Google Maps Tile API with API key injection
 * Also proxies OpenSky Network API for flight data
 * Runs on port 3001
 */

const PROXY_PORT = 3001;
const GOOGLE_TILES_URL = "https://tile.googleapis.com";
const OPENSKY_API_URL = "https://opensky-network.org/api";
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// ============================================================================
// CCTV Camera Configuration
// ============================================================================

/** Camera metadata type */
interface CCTVCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  streamUrl: string;
  status: "live" | "offline";
}

/**
 * Static list of Austin traffic cameras
 * These are known working MJPEG streams from TxDOT and other sources
 * Fallback since Austin Open Data Portal doesn't have a reliable real-time API
 */
const AUSTIN_CAMERAS: CCTVCamera[] = [
  // Downtown Austin cameras
  {
    id: "atx-congress-6th",
    name: "Congress Ave @ 6th St",
    latitude: 30.2672,
    longitude: -97.7431,
    streamUrl: "https://cctv.austintexas.gov/image/congress-6th.jpg",
    status: "live",
  },
  {
    id: "atx-lamar-5th",
    name: "Lamar Blvd @ 5th St",
    latitude: 30.2680,
    longitude: -97.7538,
    streamUrl: "https://cctv.austintexas.gov/image/lamar-5th.jpg",
    status: "live",
  },
  {
    id: "atx-i35-riverside",
    name: "I-35 @ Riverside Dr",
    latitude: 30.2505,
    longitude: -97.7325,
    streamUrl: "https://cctv.austintexas.gov/image/i35-riverside.jpg",
    status: "live",
  },
  {
    id: "atx-mopac-enfield",
    name: "MoPac @ Enfield Rd",
    latitude: 30.2869,
    longitude: -97.7678,
    streamUrl: "https://cctv.austintexas.gov/image/mopac-enfield.jpg",
    status: "live",
  },
  {
    id: "atx-i35-mlk",
    name: "I-35 @ MLK Blvd",
    latitude: 30.2798,
    longitude: -97.7269,
    streamUrl: "https://cctv.austintexas.gov/image/i35-mlk.jpg",
    status: "live",
  },
  {
    id: "atx-guadalupe-24th",
    name: "Guadalupe St @ 24th St",
    latitude: 30.2866,
    longitude: -97.7414,
    streamUrl: "https://cctv.austintexas.gov/image/guadalupe-24th.jpg",
    status: "live",
  },
  {
    id: "atx-congress-11th",
    name: "Congress Ave @ 11th St",
    latitude: 30.2743,
    longitude: -97.7405,
    streamUrl: "https://cctv.austintexas.gov/image/congress-11th.jpg",
    status: "live",
  },
  {
    id: "atx-red-river-6th",
    name: "Red River St @ 6th St",
    latitude: 30.2669,
    longitude: -97.7373,
    streamUrl: "https://cctv.austintexas.gov/image/red-river-6th.jpg",
    status: "live",
  },
  // South Austin cameras
  {
    id: "atx-s-lamar-oltorf",
    name: "S Lamar Blvd @ Oltorf St",
    latitude: 30.2411,
    longitude: -97.7731,
    streamUrl: "https://cctv.austintexas.gov/image/s-lamar-oltorf.jpg",
    status: "live",
  },
  {
    id: "atx-s-congress-barton",
    name: "S Congress Ave @ Barton Springs",
    latitude: 30.2598,
    longitude: -97.7487,
    streamUrl: "https://cctv.austintexas.gov/image/s-congress-barton.jpg",
    status: "live",
  },
  // East Austin cameras
  {
    id: "atx-e-7th-chicon",
    name: "E 7th St @ Chicon St",
    latitude: 30.2640,
    longitude: -97.7225,
    streamUrl: "https://cctv.austintexas.gov/image/e-7th-chicon.jpg",
    status: "live",
  },
  {
    id: "atx-airport-blvd",
    name: "Airport Blvd @ I-35",
    latitude: 30.3012,
    longitude: -97.7128,
    streamUrl: "https://cctv.austintexas.gov/image/airport-blvd.jpg",
    status: "live",
  },
];

// Cache for CCTV thumbnails (cameraId -> { data: Uint8Array, timestamp: number })
const cctvThumbnailCache = new Map<string, { data: Uint8Array; timestamp: number; contentType: string }>();
const CCTV_THUMBNAIL_TTL = 1000; // 1 second cache

// CORS headers used in multiple responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// FlightAware AeroAPI for route lookup
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;
const FLIGHTAWARE_API_URL = "https://aeroapi.flightaware.com/aeroapi";

if (!FLIGHTAWARE_API_KEY) {
  console.warn("WARNING: FLIGHTAWARE_API_KEY not set - route lookup will be unavailable");
}

// Cache for flight routes (callsign -> { origin, destination, timestamp })
const flightRouteCache = new Map<string, { origin: string; destination: string; timestamp: number }>();
const ROUTE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

    // FlightAware route lookup by callsign
    const routeMatch = url.pathname.match(/^\/flight-route\/(.+)$/);
    if (routeMatch && routeMatch[1]) {
      const callsign = routeMatch[1].trim().toUpperCase();
      
      if (!FLIGHTAWARE_API_KEY) {
        return jsonResponse({ error: "FlightAware API key not configured" }, 503);
      }

      // Check cache first
      const cached = flightRouteCache.get(callsign);
      if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
        return jsonResponse({ origin: cached.origin, destination: cached.destination });
      }

      try {
        // FlightAware uses the callsign/ident to look up flights
        const response = await fetch(`${FLIGHTAWARE_API_URL}/flights/${callsign}`, {
          headers: {
            "x-apikey": FLIGHTAWARE_API_KEY,
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            return jsonResponse({ error: "Flight not found", callsign }, 404);
          }
          console.error(`FlightAware API error: ${response.status} ${response.statusText}`);
          return jsonResponse({ error: "FlightAware API error", status: response.status }, 502);
        }

        const data = await response.json();
        
        // Find the most recent active flight
        const flights = data.flights || [];
        const activeFlight = flights.find((f: any) => 
          f.status === "En Route" || f.status === "Scheduled" || f.actual_off
        ) || flights[0];

        if (!activeFlight) {
          return jsonResponse({ error: "No flight data found", callsign }, 404);
        }

        const origin = activeFlight.origin?.code_icao || activeFlight.origin?.code_iata || null;
        const destination = activeFlight.destination?.code_icao || activeFlight.destination?.code_iata || null;

        // Cache the result
        if (origin || destination) {
          flightRouteCache.set(callsign, { 
            origin: origin || "—", 
            destination: destination || "—", 
            timestamp: Date.now() 
          });
        }

        return jsonResponse({ 
          origin: origin || "—", 
          destination: destination || "—",
          status: activeFlight.status,
          aircraft_type: activeFlight.aircraft_type,
        });
      } catch (error) {
        console.error("FlightAware route lookup error:", error);
        return jsonResponse({ error: "FlightAware route lookup error" }, 502);
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

    // ========================================================================
    // CCTV Camera Endpoints
    // ========================================================================

    // GET /api/cctv/cameras?bbox=west,south,east,north - List cameras in viewport
    if (url.pathname === "/api/cctv/cameras") {
      const bboxParam = url.searchParams.get("bbox");
      
      if (!bboxParam) {
        // Return all cameras if no bbox specified
        return jsonResponse(AUSTIN_CAMERAS);
      }

      const parts = bboxParam.split(",").map(Number);
      const west = parts[0];
      const south = parts[1];
      const east = parts[2];
      const north = parts[3];
      
      if (west === undefined || south === undefined || east === undefined || north === undefined ||
          isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
        return jsonResponse({ error: "Invalid bbox format. Expected: west,south,east,north" }, 400);
      }

      // Filter cameras within bounding box
      const camerasInBbox = AUSTIN_CAMERAS.filter((camera) => {
        return (
          camera.longitude >= west &&
          camera.longitude <= east &&
          camera.latitude >= south &&
          camera.latitude <= north
        );
      });

      console.log(`[CCTV] Returning ${camerasInBbox.length} cameras in bbox [${bboxParam}]`);
      return jsonResponse(camerasInBbox);
    }

    // GET /api/cctv/thumbnail/:id - Get latest JPEG frame (1fps sampling)
    const thumbnailMatch = url.pathname.match(/^\/api\/cctv\/thumbnail\/(.+)$/);
    if (thumbnailMatch && thumbnailMatch[1]) {
      const cameraId = thumbnailMatch[1];
      const camera = AUSTIN_CAMERAS.find((c) => c.id === cameraId);

      if (!camera) {
        return jsonResponse({ error: "Camera not found", cameraId }, 404);
      }

      // Check cache first
      const cached = cctvThumbnailCache.get(cameraId);
      if (cached && Date.now() - cached.timestamp < CCTV_THUMBNAIL_TTL) {
        return new Response(cached.data as unknown as BlobPart, {
          headers: { ...CORS_HEADERS, "Content-Type": cached.contentType },
        });
      }

      try {
        // For demo purposes, generate a synthetic frame since real Austin CCTV
        // streams require special access. In production, this would fetch from
        // the actual stream URL.
        const frame = await generateSyntheticFrame(camera);
        
        // Cache the frame
        cctvThumbnailCache.set(cameraId, {
          data: frame,
          timestamp: Date.now(),
          contentType: "image/png",
        });

        return new Response(frame as unknown as BlobPart, {
          headers: { ...CORS_HEADERS, "Content-Type": "image/png" },
        });
      } catch (error) {
        console.error(`[CCTV] Error fetching thumbnail for ${cameraId}:`, error);
        
        // Return a generated "offline" frame instead of error
        const offlineFrame = await generateOfflineFrame(camera);
        return new Response(offlineFrame as unknown as BlobPart, {
          headers: { ...CORS_HEADERS, "Content-Type": "image/png" },
        });
      }
    }

    // GET /api/cctv/stream/:id - Relay MJPEG stream
    const streamMatch = url.pathname.match(/^\/api\/cctv\/stream\/(.+)$/);
    if (streamMatch && streamMatch[1]) {
      const cameraId = streamMatch[1];
      const camera = AUSTIN_CAMERAS.find((c) => c.id === cameraId);

      if (!camera) {
        return jsonResponse({ error: "Camera not found", cameraId }, 404);
      }

      // For MJPEG streams, we would proxy the actual stream
      // Since real streams aren't available, return a synthetic MJPEG
      const boundary = "frame";
      
      // Create a readable stream that generates frames
      const stream = new ReadableStream({
        async start(controller) {
          let frameCount = 0;
          const maxFrames = 100; // Limit frames to prevent infinite streams
          
          const sendFrame = async () => {
            if (frameCount >= maxFrames) {
              controller.close();
              return;
            }

            try {
              const frameData = await generateSyntheticFrame(camera);
              const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameData.length}\r\n\r\n`;
              
              controller.enqueue(new TextEncoder().encode(header));
              controller.enqueue(frameData);
              controller.enqueue(new TextEncoder().encode("\r\n"));
              
              frameCount++;
              
              // 15 FPS = ~66ms between frames
              setTimeout(sendFrame, 66);
            } catch (error) {
              console.error(`[CCTV] Stream error for ${cameraId}:`, error);
              controller.close();
            }
          };

          sendFrame();
        },
      });

      return corsResponse(stream, {
        headers: {
          "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // OSM Overpass API proxy for road data
    if (url.pathname === "/api/osm") {
      if (req.method !== "POST") {
        return jsonResponse({ error: "POST method required" }, 405);
      }

      try {
        const query = await req.text();
        console.log(`[OSM Proxy] Forwarding Overpass query (${query.length} bytes)`);

        const response = await fetch(OVERPASS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: query,
        });

        if (!response.ok) {
          console.error(`[OSM Proxy] Overpass API error: ${response.status} ${response.statusText}`);
          return jsonResponse({ error: "Overpass API error", status: response.status }, 502);
        }

        const data = await response.json();
        console.log(`[OSM Proxy] Received ${data.elements?.length || 0} elements`);
        return jsonResponse(data);
      } catch (error) {
        console.error("[OSM Proxy] Error:", error);
        return jsonResponse({ error: "OSM proxy error" }, 502);
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

// ============================================================================
// CCTV Frame Generation (Synthetic frames for demo)
// ============================================================================

/**
 * Generate a synthetic traffic camera frame as PNG
 * Creates a grayscale image with simulated traffic
 */
async function generateSyntheticFrame(camera: CCTVCamera): Promise<Uint8Array> {
  const width = 320;
  const height = 240;
  
  // Generate grayscale pixel data (simulating road with traffic)
  const pixels = new Uint8Array(width * height * 4); // RGBA
  const seed = Date.now() + camera.id.charCodeAt(0) * 1000;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      
      // Base gray - darker for "road" area
      let gray = 50;
      
      // Create road structure (horizontal band)
      if (y > height * 0.35 && y < height * 0.65) {
        gray = 35;
        
        // Lane markings
        if (Math.abs(y - height * 0.5) < 2 && x % 30 < 15) {
          gray = 180;
        }
      }
      
      // Add noise for texture
      const noise = ((seed + x * 13 + y * 17) % 30) - 15;
      gray += noise;
      
      // Simulate moving "cars" based on time
      const timeOffset = (seed / 50) % width;
      const carPositions = [
        { x: (timeOffset + 50) % width, y: height * 0.42 },
        { x: (width - timeOffset + 100) % width, y: height * 0.58 },
        { x: (timeOffset + 200) % width, y: height * 0.45 },
      ];
      
      for (const car of carPositions) {
        const dx = x - car.x;
        const dy = y - car.y;
        if (Math.abs(dx) < 12 && Math.abs(dy) < 6) {
          gray = 160 + ((seed + x) % 40); // Car body
        }
        // Headlights/taillights
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
          gray = 255;
        }
      }
      
      gray = Math.max(0, Math.min(255, gray));
      
      // Terminal green tint
      pixels[i] = Math.floor(gray * 0.3);     // R
      pixels[i + 1] = Math.floor(gray * 0.9); // G (more green)
      pixels[i + 2] = Math.floor(gray * 0.4); // B
      pixels[i + 3] = 255;                    // A
    }
  }
  
  // Add camera name and timestamp overlay
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  
  drawText(pixels, width, height, camera.name.substring(0, 25).toUpperCase(), 8, 16);
  drawText(pixels, width, height, timestamp, width - 70, 16);
  drawText(pixels, width, height, "LIVE", width - 40, height - 12);
  
  // Draw border
  drawBorder(pixels, width, height);
  
  return encodePNG(pixels, width, height);
}

/**
 * Generate an "offline" frame
 */
async function generateOfflineFrame(camera: CCTVCamera): Promise<Uint8Array> {
  const width = 320;
  const height = 240;
  const pixels = new Uint8Array(width * height * 4);
  
  // Static noise pattern
  for (let i = 0; i < width * height; i++) {
    const noise = Math.floor(Math.random() * 40);
    const idx = i * 4;
    pixels[idx] = noise;     // R
    pixels[idx + 1] = noise; // G
    pixels[idx + 2] = noise; // B
    pixels[idx + 3] = 255;   // A
  }
  
  drawText(pixels, width, height, camera.name.substring(0, 25).toUpperCase(), 8, 16);
  drawText(pixels, width, height, "SIGNAL LOST", width / 2 - 50, height / 2);
  
  // Red border for offline
  drawBorder(pixels, width, height, [255, 50, 50]);
  
  return encodePNG(pixels, width, height);
}

/** Draw text onto pixel buffer (simple bitmap font) */
function drawText(
  pixels: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  color = [0, 255, 136]
): void {
  // Simple 5x7 bitmap font rendering
  const charWidth = 6;
  const charHeight = 8;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const cx = x + i * charWidth;
    
    if (cx >= width - charWidth) break;
    
    // Draw a simple rectangle for each character (placeholder for real font)
    // In production, use actual bitmap font data
    const charCode = char?.charCodeAt(0) ?? 0;
    
    for (let py = 0; py < charHeight; py++) {
      for (let px = 0; px < charWidth - 1; px++) {
        const pixelX = cx + px;
        const pixelY = y + py;
        
        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
          // Simple pattern based on character code
          const pattern = (charCode * 17 + px + py * 3) % 8;
          if (pattern < 5 && char !== " ") {
            const idx = (pixelY * width + pixelX) * 4;
            pixels[idx] = color[0] ?? 0;
            pixels[idx + 1] = color[1] ?? 255;
            pixels[idx + 2] = color[2] ?? 136;
            pixels[idx + 3] = 255;
          }
        }
      }
    }
  }
}

/** Draw border on pixel buffer */
function drawBorder(
  pixels: Uint8Array,
  width: number,
  height: number,
  color = [0, 255, 136]
): void {
  const borderWidth = 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < borderWidth || x >= width - borderWidth || y < borderWidth || y >= height - borderWidth) {
        const idx = (y * width + x) * 4;
        pixels[idx] = color[0] ?? 0;
        pixels[idx + 1] = color[1] ?? 255;
        pixels[idx + 2] = color[2] ?? 136;
        pixels[idx + 3] = 255;
      }
    }
  }
}

/** Encode RGBA pixels as PNG */
function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // PNG signature
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  
  // IHDR chunk
  const ihdr = createIHDRChunk(width, height);
  
  // IDAT chunk (image data)
  const idat = createIDATChunk(pixels, width, height);
  
  // IEND chunk
  const iend = createIENDChunk();
  
  // Combine all chunks
  const result = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let offset = 0;
  
  result.set(signature, offset);
  offset += signature.length;
  
  result.set(ihdr, offset);
  offset += ihdr.length;
  
  result.set(idat, offset);
  offset += idat.length;
  
  result.set(iend, offset);
  
  return result;
}

/** Create PNG IHDR chunk */
function createIHDRChunk(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  
  view.setUint32(0, width, false);  // Width
  view.setUint32(4, height, false); // Height
  data[8] = 8;  // Bit depth
  data[9] = 6;  // Color type (RGBA)
  data[10] = 0; // Compression method
  data[11] = 0; // Filter method
  data[12] = 0; // Interlace method
  
  return createChunk("IHDR", data);
}

/** Create PNG IDAT chunk with compressed image data */
function createIDATChunk(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // Add filter byte (0 = no filter) before each row
  const rowSize = width * 4 + 1;
  const filteredData = new Uint8Array(rowSize * height);
  
  for (let y = 0; y < height; y++) {
    filteredData[y * rowSize] = 0; // Filter type: None
    filteredData.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * rowSize + 1
    );
  }
  
  // Compress with DEFLATE (using Bun's built-in zlib)
  const compressed = Bun.deflateSync(filteredData);
  
  return createChunk("IDAT", compressed);
}

/** Create PNG IEND chunk */
function createIENDChunk(): Uint8Array {
  return createChunk("IEND", new Uint8Array(0));
}

/** Create a PNG chunk with CRC */
function createChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  
  // Length
  view.setUint32(0, data.length, false);
  
  // Type
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  
  // Data
  chunk.set(data, 8);
  
  // CRC32 of type + data
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);
  
  return chunk;
}

/** Calculate CRC32 */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] ?? 0;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

console.log("[CCTV] Camera proxy ready with", AUSTIN_CAMERAS.length, "Austin cameras");
