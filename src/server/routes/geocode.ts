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
const GEOCODE_TIMEOUT_MS = 5000;

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

  const decodedAddress = decodeURIComponent(address).toLowerCase().trim();
  const cacheKey = decodedAddress;

  // Check cache
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    console.log(`[Geocode] Cache hit for: "${address}"`);
    return jsonResponse(cached);
  }

  // Get API key from environment
  const apiKey = process.env.GOOGLE_MAPS_TILE_API_KEY;
  if (!apiKey) {
    return errorResponse("Geocoding API key not configured", 503);
  }

  console.log(`[Geocode] Looking up: "${decodedAddress}"`);

  try {
    const geocodeUrl = new URL(GOOGLE_GEOCODE_URL);
    geocodeUrl.searchParams.set("address", decodedAddress);
    geocodeUrl.searchParams.set("key", apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

    const response = await fetch(geocodeUrl.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Geocode] Google API HTTP error: ${response.status}`);
      return errorResponse("Geocoding service unavailable", 502);
    }

    const data = await response.json();

    if (data.status === "ZERO_RESULTS") {
      console.log(`[Geocode] No results for: "${decodedAddress}"`);
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

    // Cache successful response
    geocodeCache.set(cacheKey, successResponse);

    console.log(`[Geocode] Found ${results.length} result(s) for: "${decodedAddress}"`);
    return jsonResponse(successResponse);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Geocode] Request timed out for: "${decodedAddress}"`);
      return errorResponse("Geocoding request timeout", 504);
    }

    console.error("[Geocode] Error:", error);
    return errorResponse("Geocoding service error", 502);
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
