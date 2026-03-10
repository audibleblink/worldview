/**
 * TLE (Two-Line Element) Route Handler
 *
 * Proxies requests to CelesTrak for satellite orbital data.
 * Features:
 * - 5-minute TTL cache per group
 * - Request coalescing for concurrent identical fetches
 */

import { CachedFetcher } from "../cache.ts";
import { errorResponse, textResponse, jsonResponse } from "../types.ts";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT_MS = 10_000;

/** Cache TTL: 5 minutes for TLE data */
const TLE_CACHE_TTL = 5 * 60 * 1000;

/** Cached fetcher for TLE group data */
const tleGroupCache = new CachedFetcher<string, string>({
  ttl: TLE_CACHE_TTL,
});

/** Cached fetcher for single satellite TLE */
const tleSingleCache = new CachedFetcher<string, string>({
  ttl: TLE_CACHE_TTL,
  maxSize: 500, // LRU for individual satellites
});

/**
 * Handle TLE requests
 *
 * Supports two modes:
 * - ?group=<name> - Fetch TLEs for a group (e.g., stations, starlink)
 * - ?catnr=<noradId> - Fetch TLE for a single satellite by NORAD ID
 */
export async function handleTLE(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const group = url.searchParams.get("group");
  const catnr = url.searchParams.get("catnr");

  if (catnr) {
    return handleSingleSatellite(catnr);
  }

  if (!group) {
    return errorResponse("Missing ?group= or ?catnr= parameter", 400);
  }

  return handleGroupFetch(group);
}

/**
 * Fetch TLEs for a satellite group with caching
 */
async function handleGroupFetch(group: string): Promise<Response> {
  try {
    const data = await tleGroupCache.getOrFetch(group, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${CELESTRAK_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`CelesTrak returned ${response.status}`);
        }

        return response.text();
      } finally {
        clearTimeout(timeoutId);
      }
    });

    return textResponse(data, 200);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[TLE] Timeout fetching group: ${group}`);
      return errorResponse("Request timeout", 504);
    }
    console.error(`[TLE] Error fetching group ${group}:`, error);
    return errorResponse("TLE proxy error", 502);
  }
}

/**
 * Fetch TLE for a single satellite by NORAD catalog number
 */
async function handleSingleSatellite(catnr: string): Promise<Response> {
  const noradId = parseInt(catnr, 10);
  if (isNaN(noradId) || noradId <= 0 || noradId > 99999) {
    return errorResponse("Invalid NORAD catalog number", 400);
  }

  try {
    const data = await tleSingleCache.getOrFetch(catnr, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${CELESTRAK_URL}?CATNR=${noradId}&FORMAT=TLE`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error("Satellite not found");
        }

        const text = await response.text();

        // CelesTrak returns "No GP data found" for unknown NORAD IDs
        if (text.includes("No GP data found") || text.trim().length === 0) {
          throw new Error("Satellite not found");
        }

        // Validate TLE format: should have 3 lines (name + line1 + line2)
        const lines = text.trim().split("\n");
        if (lines.length < 3) {
          throw new Error("Invalid TLE response");
        }

        return text;
      } finally {
        clearTimeout(timeoutId);
      }
    });

    return textResponse(data, 200);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(`[TLE] Timeout for CATNR: ${catnr}`);
        return errorResponse("Request timeout", 504);
      }
      if (error.message === "Satellite not found") {
        return errorResponse("Satellite not found", 404);
      }
      if (error.message === "Invalid TLE response") {
        return errorResponse("Invalid TLE response from upstream", 502);
      }
    }
    console.error(`[TLE] Error for CATNR ${catnr}:`, error);
    return errorResponse("TLE proxy error", 502);
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getTLECacheStats() {
  return {
    groups: tleGroupCache.stats,
    singles: tleSingleCache.stats,
  };
}
