/**
 * Geocoding Route Handler
 *
 * Proxies requests to Google Geocoding API with:
 * - LRU cache (max 1000 entries)
 * - Consistent error response shape
 */

import { TTLCache } from "../cache.ts";
import { jsonResponse, errorResponse } from "../types.ts";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 5000;

/** LRU cache for geocode results */
const geocodeCache = new TTLCache<string, object>({
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  maxSize: 1000,
});

interface GeocodeResult {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
}

interface GeocodeResponse {
  ok: boolean;
  results?: GeocodeResult[];
  error?: string;
}

/**
 * Handle geocoding requests
 */
export async function handleGeocode(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") || url.searchParams.get("q");

  if (!address) {
    return errorResponse("Missing address parameter", 400);
  }

  const normalizedAddress = decodeURIComponent(address).toLowerCase().trim();

  // Check cache
  const cached = geocodeCache.get(normalizedAddress);
  if (cached) {
    console.log(`[Geocode] Cache hit for: "${normalizedAddress}"`);
    return jsonResponse(cached);
  }

  // Get API key from environment
  const apiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;
  if (!apiKey) {
    return errorResponse("Geocoding API key not configured", 503);
  }

  console.log(`[Geocode] Looking up: "${normalizedAddress}"`);

  try {
    const geocodeUrl = new URL(GOOGLE_GEOCODE_URL);
    geocodeUrl.searchParams.set("address", normalizedAddress);
    geocodeUrl.searchParams.set("key", apiKey);

    const response = await fetch(geocodeUrl.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[Geocode] Google API HTTP error: ${response.status}`);
      return errorResponse("Geocoding service unavailable", 502);
    }

    const data = await response.json();

    if (data.status === "ZERO_RESULTS") {
      console.log(`[Geocode] No results for: "${normalizedAddress}"`);
      const result: GeocodeResponse = { ok: false, error: "ZERO_RESULTS" };
      return jsonResponse(result);
    }

    if (data.status !== "OK") {
      console.error(`[Geocode] Google API status: ${data.status}`);
      return errorResponse(`Geocoding error: ${data.status}`, 502);
    }

    const results: GeocodeResult[] = data.results.map((result: any) => ({
      formatted_address: result.formatted_address,
      geometry: {
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      },
      types: result.types,
    }));

    const successResponse: GeocodeResponse = { ok: true, results };

    geocodeCache.set(normalizedAddress, successResponse);

    console.log(`[Geocode] Found ${results.length} result(s) for: "${normalizedAddress}"`);
    return jsonResponse(successResponse);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    console.error(`[Geocode] ${isTimeout ? "Timeout" : "Error"} for "${normalizedAddress}":`, error);
    return errorResponse(
      isTimeout ? "Geocoding request timeout" : "Geocoding service error",
      isTimeout ? 504 : 502
    );
  }
}

/**
 * Get cache statistics
 */
export function getGeocodeCacheStats() {
  return {
    cacheSize: geocodeCache.size,
  };
}
