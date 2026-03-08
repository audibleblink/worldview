/**
 * TLE (Two-Line Element) Proxy
 * Proxies requests to CelesTrak for satellite orbital data
 */

import { corsResponse, jsonResponse } from "./types.ts";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";

/**
 * Handle TLE requests
 */
export async function handleTLE(url: URL): Promise<Response> {
  const group = url.searchParams.get("group");

  if (!group) {
    return jsonResponse({ error: "Missing ?group= parameter" }, 400);
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
