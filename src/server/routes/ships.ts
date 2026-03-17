/**
 * Ships Route Handler
 *
 * HTTP endpoint for ship data from AISStream WebSocket.
 */

import { jsonResponse, errorResponse } from "../types.ts";
import { getAISStreamClient, type BoundingBox } from "../websocket/ships.ts";

const EMPTY_RESPONSE = { ships: [], count: 0, truncated: false, totalInBbox: 0, connected: false };

/**
 * Handle GET /ships requests
 * Query params: minLat, maxLat, minLon, maxLon (optional bounding box)
 */
export async function handleShips(req: Request): Promise<Response> {
  const client = getAISStreamClient();

  if (!client) {
    return jsonResponse({ ...EMPTY_RESPONSE, error: "Ship tracking unavailable - AISSTREAM_API_KEY not configured" }, 503);
  }

  if (client.hasAuthFailed()) {
    return jsonResponse({ ...EMPTY_RESPONSE, error: "AISStream authentication failed - check API key" }, 503);
  }

  const url = new URL(req.url);
  const bbox: BoundingBox = {
    minLat: parseFloat(url.searchParams.get("minLat") || "-90"),
    maxLat: parseFloat(url.searchParams.get("maxLat") || "90"),
    minLon: parseFloat(url.searchParams.get("minLon") || "-180"),
    maxLon: parseFloat(url.searchParams.get("maxLon") || "180"),
  };

  if (Object.values(bbox).some(isNaN)) {
    return errorResponse("Invalid bounding box parameters", 400);
  }

  return jsonResponse({
    ...client.getShips(bbox),
    connected: client.isConnected(),
    parseErrors: client.getParseErrorCount(),
  });
}
