/**
 * FlightAware API Client
 * Handles route lookups by callsign
 */

import { jsonResponse } from "./types.ts";

const FLIGHTAWARE_API_URL = "https://aeroapi.flightaware.com/aeroapi";
const ROUTE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedRoute {
  origin: string;
  destination: string;
  timestamp: number;
}

/**
 * FlightAware API Client
 */
export class FlightAwareClient {
  private apiKey: string | null;
  private routeCache = new Map<string, CachedRoute>();

  constructor() {
    this.apiKey = process.env.FLIGHTAWARE_API_KEY ?? null;

    if (!this.apiKey) {
      console.warn("WARNING: FLIGHTAWARE_API_KEY not set - route lookup will be unavailable");
    }
  }

  /** Check if API key is configured */
  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Lookup flight route by callsign */
  async lookupRoute(callsign: string): Promise<Response> {
    const normalizedCallsign = callsign.trim().toUpperCase();

    if (!this.apiKey) {
      return jsonResponse({ error: "FlightAware API key not configured" }, 503);
    }

    // Check cache first
    const cached = this.routeCache.get(normalizedCallsign);
    if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
      return jsonResponse({ origin: cached.origin, destination: cached.destination });
    }

    try {
      const response = await fetch(`${FLIGHTAWARE_API_URL}/flights/${normalizedCallsign}`, {
        headers: {
          "x-apikey": this.apiKey,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return jsonResponse({ error: "Flight not found", callsign: normalizedCallsign }, 404);
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
        return jsonResponse({ error: "No flight data found", callsign: normalizedCallsign }, 404);
      }

      const origin = activeFlight.origin?.code_icao || activeFlight.origin?.code_iata || null;
      const destination = activeFlight.destination?.code_icao || activeFlight.destination?.code_iata || null;

      // Cache the result
      if (origin || destination) {
        this.routeCache.set(normalizedCallsign, {
          origin: origin || "—",
          destination: destination || "—",
          timestamp: Date.now(),
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
}

// Singleton instance
export const flightAwareClient = new FlightAwareClient();
