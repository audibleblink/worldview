/**
 * OpenSky Network API Client
 * Handles OAuth2 authentication and API requests
 */

import { jsonResponse } from "./types.ts";

const OPENSKY_API_URL = "https://opensky-network.org/api";
const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_REFRESH_MARGIN = 30; // seconds before expiry to refresh

interface TokenState {
  accessToken: string | null;
  expiresAt: number; // timestamp in ms
}

/**
 * OpenSky API Client with OAuth2 support
 */
export class OpenSkyClient {
  private clientId: string | null;
  private clientSecret: string | null;
  private tokenState: TokenState = { accessToken: null, expiresAt: 0 };
  private metaCache = new Map<string, object>();

  constructor() {
    this.clientId = process.env.OPENSKY_CLIENT_ID ?? null;
    this.clientSecret = process.env.OPENSKY_CLIENT_SECRET ?? null;

    if (!this.clientId || !this.clientSecret) {
      console.warn("WARNING: OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET not set - using anonymous requests (rate limited)");
      console.warn("Create an API client at https://opensky-network.org/my-opensky/account to get credentials");
    }
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
        console.error(`OpenSky token error: ${response.status} ${response.statusText}`);
        this.tokenState = { accessToken: null, expiresAt: 0 };
        return null;
      }

      const data = await response.json();
      const expiresIn = data.expires_in ?? 1800; // default 30 minutes
      this.tokenState = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (expiresIn - TOKEN_REFRESH_MARGIN) * 1000,
      };

      console.log(`[OpenSky] Token refreshed, expires in ${expiresIn}s`);
      return this.tokenState.accessToken;
    } catch (error) {
      console.error("OpenSky token fetch error:", error);
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

  /** Fetch all flight states */
  async fetchStates(): Promise<Response> {
    const headers = await this.buildHeaders();

    try {
      const response = await fetch(`${OPENSKY_API_URL}/states/all`, { headers });
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

  /** Fetch aircraft metadata by ICAO24 (with caching) */
  async fetchMetadata(icao24: string): Promise<Response> {
    const normalizedIcao = icao24.toLowerCase();

    // Return cached response if available
    if (this.metaCache.has(normalizedIcao)) {
      return jsonResponse(this.metaCache.get(normalizedIcao)!);
    }

    const headers = await this.buildHeaders();

    try {
      const response = await fetch(
        `${OPENSKY_API_URL}/metadata/aircraft/icao/${normalizedIcao}`,
        { headers }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return jsonResponse({ error: "Aircraft not found", icao24: normalizedIcao }, 404);
        }
        console.error(`OpenSky metadata API error: ${response.status} ${response.statusText}`);
        return jsonResponse({ error: "OpenSky metadata API error", status: response.status }, 502);
      }

      const data = await response.json();
      // Cache successful response (never evicted)
      this.metaCache.set(normalizedIcao, data);
      return jsonResponse(data);
    } catch (error) {
      console.error("Aircraft metadata proxy error:", error);
      return jsonResponse({ error: "Aircraft metadata proxy error" }, 502);
    }
  }
}

// Singleton instance
export const openSkyClient = new OpenSkyClient();
