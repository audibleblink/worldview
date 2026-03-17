/**
 * Planes Route Handler
 *
 * HTTP endpoints for OpenSky Network plane data.
 */

import { jsonResponse, errorResponse } from "../types.ts";

const OPENSKY_API_BASE = "https://opensky-network.org/api";

// OpenSky state vector array indices
const IDX = {
  ICAO24: 0,
  CALLSIGN: 1,
  ORIGIN_COUNTRY: 2,
  TIME_POSITION: 3,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
} as const;

interface PlaneRecord {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  lastContact: number;
}

/**
 * Parse OpenSky state vector array into PlaneRecord
 */
function parseStateVector(state: unknown[]): PlaneRecord | null {
  const icao24 = state[IDX.ICAO24];
  const lon = state[IDX.LONGITUDE];
  const lat = state[IDX.LATITUDE];

  // Skip if missing required fields
  if (typeof icao24 !== "string" || lon == null || lat == null) {
    return null;
  }

  return {
    icao24,
    callsign: ((state[IDX.CALLSIGN] as string) ?? "").trim(),
    longitude: lon as number,
    latitude: lat as number,
    altitude: (state[IDX.BARO_ALTITUDE] as number) ?? 0,
    velocity: (state[IDX.VELOCITY] as number) ?? 0,
    heading: (state[IDX.TRUE_TRACK] as number) ?? 0,
    verticalRate: (state[IDX.VERTICAL_RATE] as number) ?? 0,
    onGround: (state[IDX.ON_GROUND] as boolean) ?? false,
    lastContact: (state[IDX.LAST_CONTACT] as number) ?? 0,
  };
}

/**
 * Handle GET /planes requests
 * Query params: minLat, maxLat, minLon, maxLon (bounding box)
 */
export async function handlePlanes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const minLat = parseFloat(url.searchParams.get("minLat") || "-90");
  const maxLat = parseFloat(url.searchParams.get("maxLat") || "90");
  const minLon = parseFloat(url.searchParams.get("minLon") || "-180");
  const maxLon = parseFloat(url.searchParams.get("maxLon") || "180");

  if ([minLat, maxLat, minLon, maxLon].some(isNaN)) {
    return errorResponse("Invalid bounding box parameters", 400);
  }

  try {
    const openSkyUrl = `${OPENSKY_API_BASE}/states/all?lamin=${minLat}&lamax=${maxLat}&lomin=${minLon}&lomax=${maxLon}`;
    
    const response = await fetch(openSkyUrl, {
      headers: {
        "User-Agent": "WorldView/1.0",
      },
    });

    if (response.status === 429) {
      return jsonResponse({ planes: [], error: "Rate limited by OpenSky", rateLimited: true }, 429);
    }

    if (!response.ok) {
      return errorResponse(`OpenSky API error: ${response.status}`, response.status);
    }

    const data = await response.json() as { states: unknown[][] | null; time: number };
    
    if (!data.states) {
      return jsonResponse({ planes: [], count: 0 });
    }

    const planes: PlaneRecord[] = [];
    for (const state of data.states) {
      const plane = parseStateVector(state);
      if (plane) {
        planes.push(plane);
      }
    }

    return jsonResponse({
      planes,
      count: planes.length,
      time: data.time,
    });
  } catch (error) {
    console.error("[planes] Fetch error:", error);
    return errorResponse("Failed to fetch plane data", 500);
  }
}

/**
 * Handle GET /planes/search requests
 * Query params: callsign (partial match)
 */
export async function handlePlanesSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const callsign = (url.searchParams.get("callsign") || "").trim().toUpperCase();

  if (!callsign || callsign.length < 2) {
    return jsonResponse({ planes: [], count: 0 });
  }

  try {
    // Fetch all planes globally (OpenSky doesn't support callsign search)
    const response = await fetch(`${OPENSKY_API_BASE}/states/all`, {
      headers: {
        "User-Agent": "WorldView/1.0",
      },
    });

    if (response.status === 429) {
      return jsonResponse({ planes: [], error: "Rate limited by OpenSky", rateLimited: true }, 429);
    }

    if (!response.ok) {
      return errorResponse(`OpenSky API error: ${response.status}`, response.status);
    }

    const data = await response.json() as { states: unknown[][] | null; time: number };
    
    if (!data.states) {
      return jsonResponse({ planes: [], count: 0 });
    }

    const planes: PlaneRecord[] = [];
    for (const state of data.states) {
      const plane = parseStateVector(state);
      if (plane && plane.callsign.startsWith(callsign)) {
        planes.push(plane);
      }
    }

    // Limit results to prevent huge responses
    const limited = planes.slice(0, 50);

    return jsonResponse({
      planes: limited,
      count: limited.length,
      total: planes.length,
      time: data.time,
    });
  } catch (error) {
    console.error("[planes/search] Fetch error:", error);
    return errorResponse("Failed to search planes", 500);
  }
}
