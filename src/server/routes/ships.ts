/**
 * Ships Route Handler
 *
 * HTTP endpoint for ship data from AISStream WebSocket.
 * The actual WebSocket connection is managed in websocket/ships.ts
 */

import { jsonResponse, errorResponse } from "../types.ts";
import { getAISStreamClient, type BoundingBox } from "../websocket/ships.ts";

/**
 * Handle GET /ships requests
 *
 * Query params:
 * - minLat, maxLat, minLon, maxLon: Bounding box filter (optional)
 */
export async function handleShips(req: Request): Promise<Response> {
  const aisClient = getAISStreamClient();

  if (!aisClient) {
    return jsonResponse({
      error: "Ship tracking unavailable - AISSTREAM_API_KEY not configured",
      ships: [],
      count: 0,
      truncated: false,
      totalInBbox: 0,
      connected: false,
    }, 503);
  }

  // Check for authentication failure
  if (aisClient.hasAuthFailed()) {
    return jsonResponse({
      error: "AISStream authentication failed - check API key",
      ships: [],
      count: 0,
      truncated: false,
      totalInBbox: 0,
      connected: false,
    }, 503);
  }

  const url = new URL(req.url);

  // Parse bounding box query params
  const minLat = parseFloat(url.searchParams.get("minLat") || "-90");
  const maxLat = parseFloat(url.searchParams.get("maxLat") || "90");
  const minLon = parseFloat(url.searchParams.get("minLon") || "-180");
  const maxLon = parseFloat(url.searchParams.get("maxLon") || "180");

  // Validate bbox parameters
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
    return errorResponse("Invalid bounding box parameters", 400);
  }

  const bbox: BoundingBox = { minLat, maxLat, minLon, maxLon };
  const response = aisClient.getShips(bbox);

  return jsonResponse({
    ...response,
    connected: aisClient.isConnected(),
    parseErrors: aisClient.getParseErrorCount(),
  });
}
