/**
 * OSM Overpass API Route Handler
 *
 * Proxies requests to OpenStreetMap Overpass API for road data.
 */

import { jsonResponse, errorResponse } from "../types.ts";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

/**
 * Handle OSM Overpass requests
 *
 * Expects POST with Overpass query as body.
 */
export async function handleOSM(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse("POST method required", 405);
  }

  try {
    const query = await req.text();
    console.log(`[OSM] Forwarding Overpass query (${query.length} bytes)`);

    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "WorldView/1.0",  // Overpass 406s Bun's default User-Agent
      },
      body: query,
    });

    if (!response.ok) {
      console.error(`[OSM] Overpass API error: ${response.status} ${response.statusText}`);
      return errorResponse("Overpass API error", 502);
    }

    const data = await response.json();
    console.log(`[OSM] Received ${data.elements?.length || 0} elements`);
    return jsonResponse(data);
  } catch (error) {
    console.error("[OSM] Error:", error);
    return errorResponse("OSM proxy error", 502);
  }
}
