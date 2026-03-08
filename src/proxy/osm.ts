/**
 * OSM Overpass API Proxy
 * Proxies requests to OpenStreetMap Overpass API for road data
 */

import { jsonResponse } from "./types.ts";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

/**
 * Handle OSM Overpass requests
 */
export async function handleOSM(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST method required" }, 405);
  }

  try {
    const query = await req.text();
    console.log(`[OSM Proxy] Forwarding Overpass query (${query.length} bytes)`);

    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
    });

    if (!response.ok) {
      console.error(`[OSM Proxy] Overpass API error: ${response.status} ${response.statusText}`);
      return jsonResponse({ error: "Overpass API error", status: response.status }, 502);
    }

    const data = await response.json();
    console.log(`[OSM Proxy] Received ${data.elements?.length || 0} elements`);
    return jsonResponse(data);
  } catch (error) {
    console.error("[OSM Proxy] Error:", error);
    return jsonResponse({ error: "OSM proxy error" }, 502);
  }
}
