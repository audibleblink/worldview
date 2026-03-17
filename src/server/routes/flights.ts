/**
 * Flights Route Handler
 *
 * Proxies requests to OpenSky Network API with:
 * - OAuth2 authentication
 * - 10-second TTL cache for state vectors
 * - LRU-bounded metadata cache
 * - Server-side data transformation (strip unused fields)
 */

import { TTLCache, CachedFetcher } from "../cache.ts";
import { jsonResponse, errorResponse } from "../types.ts";

const OPENSKY_API = "https://opensky-network.org/api";
const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_REFRESH_MARGIN_S = 30;

const STATES_CACHE_TTL = 10_000;       // 10s for flight vectors
const METADATA_CACHE_TTL = 86_400_000; // 24h for aircraft metadata
const METADATA_MAX_SIZE = 1000;
const ROUTE_CACHE_TTL = 3_600_000;     // 1h for route data

interface TokenState {
  accessToken: string | null;
  expiresAt: number;
}

interface FlightStateVector {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  time_position: number | null;
  last_contact: number;
  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;
  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
  category: number;
}

interface TransformedFlightState {
  icao24: string;
  callsign: string | null;
  longitude: number;
  latitude: number;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean;
  lastContact: number;
}

/**
 * OpenSky API Client with OAuth2 support
 */
class OpenSkyClient {
  private clientId: string | null;
  private clientSecret: string | null;
  private tokenState: TokenState = { accessToken: null, expiresAt: 0 };

  /** States cache with 10s TTL */
  private statesCache: CachedFetcher<string, TransformedFlightState[]>;

  /** Metadata LRU cache (max 1000 entries) */
  private metaCache: TTLCache<string, object>;

  constructor() {
    this.clientId = process.env.OPENSKY_CLIENT_ID ?? null;
    this.clientSecret = process.env.OPENSKY_CLIENT_SECRET ?? null;

    if (!this.clientId || !this.clientSecret) {
      console.warn("[OpenSky] OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET not set - using anonymous requests (rate limited)");
    }

    this.statesCache = new CachedFetcher({
      ttl: STATES_CACHE_TTL,
    });

    this.metaCache = new TTLCache({
      ttl: METADATA_CACHE_TTL,
      maxSize: METADATA_MAX_SIZE,
    });
  }

  /** Check if OAuth2 credentials are configured */
  get hasCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** Get a valid OAuth2 access token, refreshing if needed */
  private async getToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    // Return cached token if still valid
    if (this.tokenState.accessToken && Date.now() < this.tokenState.expiresAt) {
      return this.tokenState.accessToken;
    }

    // Fetch new token
    try {
      const response = await fetch(OPENSKY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });

      if (!response.ok) {
        console.error(`[OpenSky] Token error: ${response.status} ${response.statusText}`);
        this.tokenState = { accessToken: null, expiresAt: 0 };
        return null;
      }

      const data = await response.json();
      const expiresIn = data.expires_in ?? 1800;
      this.tokenState = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (expiresIn - TOKEN_REFRESH_MARGIN_S) * 1000,
      };

      console.log(`[OpenSky] Token refreshed, expires in ${expiresIn}s`);
      return this.tokenState.accessToken;
    } catch (error) {
      console.error("[OpenSky] Token fetch error:", error);
      this.tokenState = { accessToken: null, expiresAt: 0 };
      return null;
    }
  }

  /** Build headers with auth if available */
  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    const token = await this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Transform raw state vector to optimized format
   * Strips unused fields and converts naming conventions
   */
  private transformState(state: any[]): TransformedFlightState | null {
    const [
      icao24,
      callsign,
      _origin_country,
      _time_position,
      last_contact,
      longitude,
      latitude,
      baro_altitude,
      on_ground,
      velocity,
      true_track,
      vertical_rate,
      _sensors,
      geo_altitude,
    ] = state;

    // Filter out aircraft on ground or without position
    if (on_ground || longitude === null || latitude === null) {
      return null;
    }

    return {
      icao24,
      callsign: callsign?.trim() || null,
      longitude,
      latitude,
      altitude: geo_altitude ?? baro_altitude,
      velocity,
      heading: true_track,
      verticalRate: vertical_rate,
      onGround: on_ground,
      lastContact: last_contact,
    };
  }

  /** Fetch all flight states with caching */
  async fetchStates(): Promise<Response> {
    try {
      const flights = await this.statesCache.getOrFetch("all", async () => {
        const headers = await this.buildHeaders();
        const response = await fetch(`${OPENSKY_API}/states/all`, { headers });

        if (!response.ok) {
          throw new Error(`OpenSky API error: ${response.status}`);
        }

        const data = await response.json();
        const states: any[] = data.states || [];
        const transformed = states.map((s) => this.transformState(s)).filter(Boolean) as TransformedFlightState[];

        console.log(`[OpenSky] Fetched ${states.length} states, ${transformed.length} airborne`);
        return transformed;
      });

      return jsonResponse({ time: Math.floor(Date.now() / 1000), states: flights });
    } catch (error) {
      console.error("[OpenSky] Fetch states error:", error);
      return errorResponse("OpenSky API error", 502);
    }
  }

  /** Fetch aircraft metadata by ICAO24 with LRU caching */
  async fetchMetadata(icao24: string): Promise<Response> {
    const id = icao24.toLowerCase();
    const cached = this.metaCache.get(id);
    if (cached) return jsonResponse(cached);

    try {
      const headers = await this.buildHeaders();
      const response = await fetch(`${OPENSKY_API}/metadata/aircraft/icao/${id}`, { headers });

      if (!response.ok) {
        return errorResponse(
          response.status === 404 ? "Aircraft not found" : "OpenSky metadata API error",
          response.status === 404 ? 404 : 502
        );
      }

      const data = await response.json();
      this.metaCache.set(id, data);
      return jsonResponse(data);
    } catch (error) {
      console.error("[OpenSky] Metadata error:", error);
      return errorResponse("Aircraft metadata proxy error", 502);
    }
  }

  /** Get cache statistics */
  get stats() {
    return {
      states: this.statesCache.stats,
      metadata: { cacheSize: this.metaCache.size },
    };
  }
}

// Singleton instance
const openSkyClient = new OpenSkyClient();

/**
 * FlightAware API Client for route lookups
 */
class FlightAwareClient {
  private apiKey: string | null;
  private routeCache: TTLCache<string, { origin: string; destination: string }>;

  constructor() {
    this.apiKey = process.env.FLIGHTAWARE_API_KEY ?? null;

    if (!this.apiKey) {
      console.warn("[FlightAware] FLIGHTAWARE_API_KEY not set - route lookup unavailable");
    }

    this.routeCache = new TTLCache({
      ttl: ROUTE_CACHE_TTL,
      maxSize: 500, // LRU for routes
    });
  }

  /** Lookup flight route by callsign */
  async lookupRoute(callsign: string): Promise<Response> {
    const normalizedCallsign = callsign.trim().toUpperCase();

    if (!this.apiKey) {
      return errorResponse("FlightAware API key not configured", 503);
    }

    // Check cache
    const cached = this.routeCache.get(normalizedCallsign);
    if (cached) {
      return jsonResponse(cached);
    }

    try {
      const response = await fetch(
        `https://aeroapi.flightaware.com/aeroapi/flights/${normalizedCallsign}`,
        {
          headers: {
            "x-apikey": this.apiKey,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return errorResponse("Flight not found", 404);
        }
        return errorResponse("FlightAware API error", 502);
      }

      const data = await response.json();
      const flights = data.flights || [];
      const activeFlight = flights.find((f: any) =>
        f.status === "En Route" || f.status === "Scheduled" || f.actual_off
      ) || flights[0];

      if (!activeFlight) {
        return errorResponse("No flight data found", 404);
      }

      const origin = activeFlight.origin?.code_icao || activeFlight.origin?.code_iata || "—";
      const destination = activeFlight.destination?.code_icao || activeFlight.destination?.code_iata || "—";

      const result = {
        origin,
        destination,
        status: activeFlight.status,
        aircraft_type: activeFlight.aircraft_type,
      };

      // Cache result
      this.routeCache.set(normalizedCallsign, { origin, destination });

      return jsonResponse(result);
    } catch (error) {
      console.error("[FlightAware] Route lookup error:", error);
      return errorResponse("FlightAware route lookup error", 502);
    }
  }
}

const flightAwareClient = new FlightAwareClient();

// Export handlers
export function handleFlights(_req: Request): Promise<Response> {
  return openSkyClient.fetchStates();
}

export async function handleAircraftMeta(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/aircraft-meta\/([a-f0-9]+)$/i);
  if (!match?.[1]) {
    return errorResponse("Missing ICAO24 identifier", 400);
  }
  return openSkyClient.fetchMetadata(match[1]);
}

export async function handleFlightRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/flight-route\/(.+)$/);
  if (!match?.[1]) {
    return errorResponse("Missing callsign", 400);
  }
  return flightAwareClient.lookupRoute(match[1]);
}

export function getFlightsCacheStats() {
  return openSkyClient.stats;
}
