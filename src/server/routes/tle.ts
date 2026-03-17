/**
 * TLE (Two-Line Element) Route Handler
 *
 * Proxies requests to CelesTrak for satellite orbital data.
 * Uses 5-minute TTL cache with request coalescing.
 */

import { CachedFetcher } from "../cache.ts";
import { errorResponse, textResponse } from "../types.ts";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";
const TIMEOUT_MS = 10_000;
const CACHE_TTL = 5 * 60 * 1000;

const groupCache = new CachedFetcher<string, string>({ ttl: CACHE_TTL });
const singleCache = new CachedFetcher<string, string>({ ttl: CACHE_TTL, maxSize: 500 });

/** Fetch with timeout */
async function fetchWithTimeout(url: string): Promise<globalThis.Response> {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Handle TLE requests
 *
 * Supports two modes:
 * - ?group=<name> - Fetch TLEs for a group (e.g., stations, starlink)
 * - ?catnr=<noradId> - Fetch TLE for a single satellite by NORAD ID
 */
export async function handleTLE(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const catnr = url.searchParams.get("catnr");
  if (catnr) return handleSingleSatellite(catnr);

  const group = url.searchParams.get("group");
  if (!group) return errorResponse("Missing ?group= or ?catnr= parameter", 400);

  return handleGroupFetch(group);
}

async function handleGroupFetch(group: string): Promise<Response> {
  try {
    const data = await groupCache.getOrFetch(group, async () => {
      const response = await fetchWithTimeout(
        `${CELESTRAK_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
      );
      if (!response.ok) throw new Error(`CelesTrak returned ${response.status}`);
      return response.text();
    });
    return textResponse(data);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    console.error(`[TLE] ${isTimeout ? "Timeout" : "Error"} fetching group ${group}:`, error);
    return errorResponse(isTimeout ? "Request timeout" : "TLE proxy error", isTimeout ? 504 : 502);
  }
}

async function handleSingleSatellite(catnr: string): Promise<Response> {
  const noradId = parseInt(catnr, 10);
  if (isNaN(noradId) || noradId <= 0 || noradId > 99999) {
    return errorResponse("Invalid NORAD catalog number", 400);
  }

  try {
    const data = await singleCache.getOrFetch(catnr, async () => {
      const response = await fetchWithTimeout(`${CELESTRAK_URL}?CATNR=${noradId}&FORMAT=TLE`);
      if (!response.ok) throw new Error("Satellite not found");

      const text = await response.text();
      if (text.includes("No GP data found") || text.trim().length === 0) {
        throw new Error("Satellite not found");
      }
      if (text.trim().split("\n").length < 3) {
        throw new Error("Invalid TLE response");
      }
      return text;
    });
    return textResponse(data);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
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

export function getTLECacheStats() {
  return {
    groups: groupCache.stats,
    singles: singleCache.stats,
  };
}
