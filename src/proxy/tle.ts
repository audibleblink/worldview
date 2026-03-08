/**
 * TLE (Two-Line Element) Proxy
 * Proxies requests to CelesTrak for satellite orbital data
 */

import { corsResponse, jsonResponse } from "./types.ts";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for CelesTrak requests

/**
 * Handle TLE requests
 * Supports two modes:
 * - ?group=<name> - Fetch TLEs for a group (e.g., stations, starlink)
 * - ?catnr=<noradId> - Fetch TLE for a single satellite by NORAD ID
 */
export async function handleTLE(url: URL): Promise<Response> {
  const group = url.searchParams.get("group");
  const catnr = url.searchParams.get("catnr");

  // Single satellite fetch by NORAD ID
  if (catnr) {
    return handleSingleSatellite(catnr);
  }

  // Group fetch
  if (!group) {
    return jsonResponse({ error: "Missing ?group= or ?catnr= parameter" }, 400);
  }

  try {
    const response = await fetch(
      `${CELESTRAK_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
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

/**
 * Fetch TLE for a single satellite by NORAD catalog number
 */
async function handleSingleSatellite(catnr: string): Promise<Response> {
  // Validate NORAD ID is a valid number
  const noradId = parseInt(catnr, 10);
  if (isNaN(noradId) || noradId <= 0 || noradId > 99999) {
    return jsonResponse({ error: "Invalid NORAD catalog number" }, 400);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      `${CELESTRAK_URL}?CATNR=${noradId}&FORMAT=TLE`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    // CelesTrak returns 200 with "No GP data found" for unknown satellites
    if (!response.ok) {
      return jsonResponse({ error: "Satellite not found" }, 404);
    }

    const text = await response.text();

    // CelesTrak returns "No GP data found" for unknown NORAD IDs
    if (text.includes("No GP data found") || text.trim().length === 0) {
      return jsonResponse({ error: "Satellite not found" }, 404);
    }

    // Validate TLE format: should have 3 lines (name + line1 + line2)
    const lines = text.trim().split("\n");
    if (lines.length < 3) {
      return jsonResponse({ error: "Invalid TLE response" }, 502);
    }

    return corsResponse(text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("TLE proxy timeout for CATNR:", catnr);
      return jsonResponse({ error: "Request timeout" }, 504);
    }
    console.error("TLE proxy error for CATNR:", catnr, error);
    return jsonResponse({ error: "TLE proxy error" }, 502);
  }
}
