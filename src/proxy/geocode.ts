/**
 * Google Geocoding Proxy
 * Proxies requests to Google Geocoding API
 */

import { jsonResponse } from "./types.ts";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GEOCODE_TIMEOUT_MS = 5000;

/**
 * Handle geocoding requests
 */
export async function handleGeocode(url: URL, apiKey: string): Promise<Response> {
  const address = url.searchParams.get("address");

  if (!address) {
    return jsonResponse({ ok: false, error: "MISSING_ADDRESS" }, 400);
  }

  const decodedAddress = decodeURIComponent(address);
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
      return jsonResponse({ ok: false, error: "NETWORK_ERROR" }, 502);
    }

    const data = await response.json();

    if (data.status === "ZERO_RESULTS") {
      console.log(`[Geocode] No results for: "${decodedAddress}"`);
      return jsonResponse({ ok: false, error: "ZERO_RESULTS" });
    }

    if (data.status !== "OK") {
      console.error(`[Geocode] Google API status: ${data.status}`);
      return jsonResponse({ ok: false, error: data.status || "UNKNOWN_ERROR" });
    }

    const results = data.results.map((result: any) => ({
      formatted_address: result.formatted_address,
      geometry: {
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      },
      types: result.types,
    }));

    console.log(`[Geocode] Found ${results.length} result(s) for: "${decodedAddress}"`);
    return jsonResponse({ ok: true, results });
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[Geocode] Request timed out for: "${decodedAddress}"`);
      return jsonResponse({ ok: false, error: "TIMEOUT" }, 504);
    }

    console.error("[Geocode] Error:", error);
    return jsonResponse({ ok: false, error: "NETWORK_ERROR" }, 502);
  }
}
