# Plane Tracking Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plane tracking layer with viewport-based discovery, callsign search, selection info, fading trails, and follow/orbit camera mode.

**Architecture:** Mirror ShipLayer pattern exactly - server proxy for OpenSky API, SolidJS store with Map<icao24, PlaneRecord>, BillboardCollection for rendering, polling with camera-move triggers, PolylineCollection for trails.

**Tech Stack:** SolidJS, CesiumJS, Bun server, OpenSky Network API

**Spec:** `docs/superpowers/specs/2026-03-16-plane-tracking-layer-design.md`

---

## File Structure

```
src/layers/planes/
├── index.ts           # Layer registration (20 lines)
├── types.ts           # PlaneRecord interface, constants (40 lines)
├── store.ts           # SolidJS store (100 lines)
├── PlaneLayer.tsx     # Main component (800 lines)
├── PlaneSearch.tsx    # Search UI (150 lines)
└── aircraftTypes.ts   # ICAO24 lookup (50 lines + data)

src/server/routes/
└── planes.ts          # OpenSky proxy (80 lines)

src/stores/layers.ts   # Add planes: boolean
src/config.ts          # Add planes endpoint
```

---

## Chunk 1: Foundation (Types, Store, Server)

### Task 1: Add `planes` to LayerState

**Files:**
- Modify: `src/stores/layers.ts:7-19`

- [ ] **Step 1: Add planes property to LayerState interface**

```typescript
// In src/stores/layers.ts, add to LayerState interface:
export interface LayerState {
  satellites: boolean;
  ships: boolean;
  ground: boolean;
  planes: boolean;  // ADD THIS LINE
}
```

- [ ] **Step 2: Add planes to initial store state**

```typescript
// In the createStore call:
const [layers, setLayers] = createStore<LayerState>({
  satellites: false,
  ships: false,
  ground: false,
  planes: false,  // ADD THIS LINE
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/stores/layers.ts
git commit -m "feat(planes): add planes to LayerState"
```

---

### Task 2: Add planes proxy endpoint to config

**Files:**
- Modify: `src/config.ts:19-21`

- [ ] **Step 1: Add planes endpoint builder**

After the `ships` endpoint in PROXY_ENDPOINTS, add:

```typescript
  /** Plane tracking endpoint with bounding box */
  planes: ({ minLat, maxLat, minLon, maxLon }: { minLat: number; maxLat: number; minLon: number; maxLon: number }) =>
    `${PROXY_BASE_URL}/planes?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`,

  /** Plane search by callsign */
  planesSearch: (callsign: string) =>
    `${PROXY_BASE_URL}/planes/search?callsign=${encodeURIComponent(callsign)}`,
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(planes): add proxy endpoint config"
```

---

### Task 3: Create types.ts

**Files:**
- Create: `src/layers/planes/types.ts`

- [ ] **Step 1: Create types file**

```typescript
/**
 * Plane Layer - Type Definitions
 */

export interface PlaneRecord {
  icao24: string;        // Unique aircraft identifier (hex)
  callsign: string;      // Flight number (e.g., "UAL123")
  longitude: number;     // Decimal degrees
  latitude: number;      // Decimal degrees
  altitude: number;      // Meters (barometric altitude)
  velocity: number;      // m/s ground speed
  heading: number;       // Degrees true north (0-360)
  verticalRate: number;  // m/s (+up, -down)
  onGround: boolean;     // True if aircraft is on ground
  lastContact: number;   // Unix timestamp of last message
  timestamp: number;     // When we received this update (client time)
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// OpenSky state vector array indices
export const OPENSKY_INDICES = {
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
  TRUE_TRACK: 10,  // heading
  VERTICAL_RATE: 11,
  SENSORS: 12,
  GEO_ALTITUDE: 13,
  SQUAWK: 14,
  SPI: 15,
  POSITION_SOURCE: 16,
} as const;

// Polling intervals
export const PLANE_UPDATE_INTERVAL = 10_000;        // 10 seconds between polls
export const PLANE_RATE_LIMITED_INTERVAL = 15_000;  // 15 seconds when rate limited
export const PLANE_RATE_LIMIT_RECOVERY_MS = 60_000; // 60 seconds before resuming

// Trail management
export const MAX_TRAIL_POINTS = 60;  // ~10 minutes at 10s intervals

// Rendering
export const MAX_VISIBLE_PLANES = 100;
export const PLANE_FOLLOW_RANGE = 5_000;   // meters
export const PLANE_FOLLOW_PITCH = -30;     // degrees
export const PLANE_LABEL_VISIBLE_DISTANCE = 200_000; // meters
export const BILLBOARD_SCALE = 0.4;
export const BILLBOARD_SCALE_SELECTED = 0.6;
export const CAMERA_MOVE_DEBOUNCE_MS = 1500;
export const VIEWPORT_FALLBACK_DEGREES = 10;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/layers/planes/types.ts
git commit -m "feat(planes): add type definitions"
```

---

### Task 4: Create store.ts

**Files:**
- Create: `src/layers/planes/store.ts`

- [ ] **Step 1: Create store file**

```typescript
/**
 * Plane Store - Reactive state for plane visualization
 */

import { createStore } from "solid-js/store";
import type { PlaneRecord, BBox } from "./types";

declare const Cesium: typeof import("cesium");

export interface PlaneState {
  planes: Map<string, PlaneRecord>;
  trails: Map<string, Cesium.Cartesian3[]>;
  selectedIcao24: string | null;
  followingIcao24: string | null;
  searchQuery: string;
  searchResults: PlaneRecord[];
  isSearching: boolean;
  lastBbox: BBox | null;
  lastUpdated: number | null;
  isLoading: boolean;
  isRateLimited: boolean;
  error: string | null;
}

const [planeState, setPlaneState] = createStore<PlaneState>({
  planes: new Map(),
  trails: new Map(),
  selectedIcao24: null,
  followingIcao24: null,
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  lastBbox: null,
  lastUpdated: null,
  isLoading: false,
  isRateLimited: false,
  error: null,
});

// --- Mutations ---

export function setPlanes(records: PlaneRecord[]): void {
  setPlaneState({
    planes: new Map(records.map((r) => [r.icao24, r])),
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

export function updatePlanes(records: PlaneRecord[], currentIcao24s: Set<string>): void {
  setPlaneState("planes", (prev) => {
    const next = new Map<string, PlaneRecord>();
    for (const [icao24, record] of prev) {
      if (currentIcao24s.has(icao24)) next.set(icao24, record);
    }
    for (const record of records) {
      next.set(record.icao24, record);
    }
    return next;
  });
  setPlaneState("lastUpdated", Date.now());
}

export function updateTrail(icao24: string, position: Cesium.Cartesian3, maxPoints: number): void {
  setPlaneState("trails", (prev) => {
    const next = new Map(prev);
    const trail = next.get(icao24) ?? [];
    const updated = [...trail, position];
    if (updated.length > maxPoints) {
      updated.shift();
    }
    next.set(icao24, updated);
    return next;
  });
}

export function clearTrail(icao24: string): void {
  setPlaneState("trails", (prev) => {
    const next = new Map(prev);
    next.delete(icao24);
    return next;
  });
}

export function clearTrailsExcept(keepIcao24: string | null): void {
  setPlaneState("trails", (prev) => {
    if (!keepIcao24) return new Map();
    const kept = prev.get(keepIcao24);
    return kept ? new Map([[keepIcao24, kept]]) : new Map();
  });
}

export const setLoading = (v: boolean) => setPlaneState("isLoading", v);
export const setError = (v: string | null) => setPlaneState({ error: v, isLoading: false });
export const setRateLimited = (v: boolean) => setPlaneState("isRateLimited", v);
export const setLastBbox = (v: BBox | null) => setPlaneState("lastBbox", v);

export const selectPlane = (v: string | null) => setPlaneState("selectedIcao24", v);
export const followPlane = (v: string | null) => setPlaneState("followingIcao24", v);
export const unfollowPlane = () => setPlaneState("followingIcao24", null);

export const setSearchQuery = (v: string) => setPlaneState("searchQuery", v);
export const setSearchResults = (v: PlaneRecord[]) => setPlaneState({ searchResults: v, isSearching: false });
export const setSearching = (v: boolean) => setPlaneState("isSearching", v);
export const clearSearch = () => setPlaneState({ searchQuery: "", searchResults: [], isSearching: false });

export const getPlaneByIcao24 = (icao24: string) => planeState.planes.get(icao24);

export function clearPlanes(): void {
  setPlaneState({
    planes: new Map(),
    trails: new Map(),
    selectedIcao24: null,
    followingIcao24: null,
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    lastBbox: null,
    lastUpdated: null,
    isLoading: false,
    isRateLimited: false,
    error: null,
  });
}

export { planeState };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/layers/planes/store.ts
git commit -m "feat(planes): add SolidJS store"
```

---

### Task 5: Create server proxy route

**Files:**
- Create: `src/server/routes/planes.ts`
- Modify: `src/server/index.ts:41-65`

- [ ] **Step 1: Create planes route handler**

```typescript
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
```

- [ ] **Step 2: Register routes in server index**

In `src/server/index.ts`, add import at top:

```typescript
import { handlePlanes, handlePlanesSearch } from "./routes/planes.ts";
```

Add to staticRoutes object (after `/ships`):

```typescript
  // Planes
  "/planes": handlePlanes,
  "/planes/search": handlePlanesSearch,
```

Add to console.log endpoints section:

```typescript
console.log(`  GET  /planes                - OpenSky plane data`);
console.log(`  GET  /planes/search         - Search planes by callsign`);
```

- [ ] **Step 3: Verify server compiles and runs**

Run: `bun run src/server/index.ts`
Expected: Server starts, shows /planes endpoints in list

- [ ] **Step 4: Test endpoint manually**

Run: `curl "http://localhost:3001/planes?minLat=40&maxLat=42&minLon=-74&maxLon=-72"`
Expected: JSON response with planes array (may be empty depending on location)

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/planes.ts src/server/index.ts
git commit -m "feat(planes): add OpenSky proxy endpoints"
```

---

## Chunk 2: Aircraft Type Lookup

### Task 6: Create aircraftTypes.ts

**Files:**
- Create: `src/layers/planes/aircraftTypes.ts`

NOTE: This is a placeholder implementation. The full aircraft database is large (millions of entries). For MVP, we'll include common airlines and return "Unknown" for others.

- [ ] **Step 1: Create aircraft types lookup**

```typescript
/**
 * Aircraft Type Lookup
 * 
 * Maps ICAO24 hex codes to aircraft type descriptions.
 * This is a minimal implementation - full database is very large.
 * 
 * In practice, you would:
 * 1. Download OpenSky aircraft database CSV
 * 2. Process into a compact binary format or indexed DB
 * 3. Load on demand with caching
 */

// Common ICAO24 prefixes by country (first 3 hex digits)
// This allows basic identification without full database
const COUNTRY_PREFIXES: Record<string, string> = {
  "A": "United States",
  "4": "United States", // 4xx
  "C": "Canada",
  "E": "Spain/France",
  "F": "France",
  "G": "United Kingdom",
  "3": "Mexico",
  "7": "Russia",
  "8": "Japan",
};

// Airline codes from callsign prefixes (3 letters)
const AIRLINE_CODES: Record<string, string> = {
  "UAL": "United Airlines",
  "AAL": "American Airlines",
  "DAL": "Delta Air Lines",
  "SWA": "Southwest Airlines",
  "JBU": "JetBlue Airways",
  "ASA": "Alaska Airlines",
  "FFT": "Frontier Airlines",
  "NKS": "Spirit Airlines",
  "BAW": "British Airways",
  "DLH": "Lufthansa",
  "AFR": "Air France",
  "KLM": "KLM",
  "UAE": "Emirates",
  "QTR": "Qatar Airways",
  "SIA": "Singapore Airlines",
  "CPA": "Cathay Pacific",
  "ANA": "All Nippon Airways",
  "JAL": "Japan Airlines",
  "QFA": "Qantas",
  "ANZ": "Air New Zealand",
  "ACA": "Air Canada",
  "RYR": "Ryanair",
  "EZY": "easyJet",
  "VIR": "Virgin Atlantic",
  "FDX": "FedEx",
  "UPS": "UPS",
};

/**
 * Get aircraft type from ICAO24 hex code.
 * Returns "Unknown" if not in database.
 */
export function getAircraftType(_icao24: string): string {
  // Full implementation would look up in database
  // For MVP, return Unknown
  return "Unknown";
}

/**
 * Get airline name from callsign.
 * Callsigns typically start with 3-letter ICAO airline code.
 */
export function getAirlineFromCallsign(callsign: string): string | null {
  if (!callsign || callsign.length < 3) return null;
  
  const prefix = callsign.substring(0, 3).toUpperCase();
  return AIRLINE_CODES[prefix] ?? null;
}

/**
 * Get country from ICAO24 prefix.
 */
export function getCountryFromIcao24(icao24: string): string | null {
  if (!icao24) return null;
  
  const firstChar = icao24.charAt(0).toUpperCase();
  return COUNTRY_PREFIXES[firstChar] ?? null;
}

/**
 * Format altitude for display.
 * Above 18,000ft, use flight level notation.
 */
export function formatAltitude(metersAltitude: number): string {
  const feet = Math.round(metersAltitude * 3.28084);
  
  if (feet >= 18000) {
    // Flight level is hundreds of feet
    const fl = Math.round(feet / 100);
    return `FL${fl}`;
  }
  
  return `${feet.toLocaleString()} ft`;
}

/**
 * Format velocity for display (m/s to knots).
 */
export function formatSpeed(metersPerSecond: number): string {
  const knots = Math.round(metersPerSecond * 1.94384);
  return `${knots} kts`;
}

/**
 * Format vertical rate for display (m/s to ft/min).
 */
export function formatVerticalRate(metersPerSecond: number): string {
  const fpm = Math.round(metersPerSecond * 196.85);
  if (fpm > 0) return `+${fpm.toLocaleString()} ft/min`;
  if (fpm < 0) return `${fpm.toLocaleString()} ft/min`;
  return "Level";
}

/**
 * Format heading with cardinal direction.
 */
export function formatHeading(degrees: number): string {
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % 8;
  return `${Math.round(degrees)}° ${cardinals[index]}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/layers/planes/aircraftTypes.ts
git commit -m "feat(planes): add aircraft type lookup utilities"
```

---

## Chunk 3: Main PlaneLayer Component

### Task 7: Create PlaneLayer.tsx

**Files:**
- Create: `src/layers/planes/PlaneLayer.tsx`

This is the largest file. It mirrors ShipLayer.tsx structure.

- [ ] **Step 1: Create PlaneLayer component - Part 1 (imports, constants, helpers)**

```typescript
/**
 * WorldView - Plane Layer (SolidJS)
 *
 * Renders planes from OpenSky Network using BillboardCollection.
 * Mirrors ShipLayer pattern for consistency.
 */

import { onCleanup, createEffect, on } from "solid-js";
import { useCesium } from "../../cesium/useCesium";
import { createBillboardCollection } from "../../cesium/createBillboardCollection";
import { useCamera } from "../../cesium/hooks/useCamera";
import { usePreRender } from "../../cesium/hooks/usePreRender";
import { useFollowMode } from "../../cesium/hooks/useFollowMode";
import { PROXY_ENDPOINTS } from "../../config";
import { selectEntity, clearSelection, type FlightData } from "../../stores/selection";
import {
  planeState,
  updatePlanes,
  updateTrail,
  clearTrailsExcept,
  setLoading,
  setError,
  setRateLimited,
  setLastBbox,
  selectPlane,
  followPlane,
  unfollowPlane,
  getPlaneByIcao24,
  clearPlanes,
} from "./store";
import {
  type PlaneRecord,
  type BBox,
  PLANE_UPDATE_INTERVAL,
  PLANE_RATE_LIMITED_INTERVAL,
  PLANE_RATE_LIMIT_RECOVERY_MS,
  MAX_TRAIL_POINTS,
  MAX_VISIBLE_PLANES,
  PLANE_FOLLOW_RANGE,
  PLANE_FOLLOW_PITCH,
  PLANE_LABEL_VISIBLE_DISTANCE,
  BILLBOARD_SCALE,
  BILLBOARD_SCALE_SELECTED,
  CAMERA_MOVE_DEBOUNCE_MS,
  VIEWPORT_FALLBACK_DEGREES,
} from "./types";
import { formatAltitude, formatSpeed, formatHeading, formatVerticalRate, getAirlineFromCallsign } from "./aircraftTypes";

declare const Cesium: typeof import("cesium");

// ==================== LAZY-INITIALIZED CACHES ====================

let planeIconCache: string | null = null;

/**
 * Create a simple plane icon as a data URL
 * White triangle pointing up (will be rotated by heading)
 */
function getPlaneIcon(): string {
  if (planeIconCache) return planeIconCache;

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  // Triangle pointing up
  ctx.moveTo(16, 2);   // nose
  ctx.lineTo(28, 28);  // right wing
  ctx.lineTo(16, 22);  // tail indent
  ctx.lineTo(4, 28);   // left wing
  ctx.closePath();
  ctx.fill();

  planeIconCache = canvas.toDataURL("image/png");
  return planeIconCache;
}

// Plane colors by altitude band
function getAltitudeColor(altitudeMeters: number): Cesium.Color {
  const feet = altitudeMeters * 3.28084;
  
  if (feet < 10000) return Cesium.Color.LIME;           // Low altitude - green
  if (feet < 25000) return Cesium.Color.YELLOW;         // Medium - yellow
  if (feet < 35000) return Cesium.Color.ORANGE;         // High - orange
  return Cesium.Color.CYAN;                              // Very high - cyan
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Filter plane records to only the N nearest to the camera
 */
function filterNearestPlanes(
  records: PlaneRecord[],
  cameraPosition: Cesium.Cartesian3,
  maxCount: number
): PlaneRecord[] {
  if (records.length <= maxCount) return records;

  const withDistance = records.map((record) => {
    const planePos = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );
    const distance = Cesium.Cartesian3.distance(cameraPosition, planePos);
    return { record, distance };
  });

  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, maxCount).map((item) => item.record);
}

/**
 * Check if the bounding box has changed significantly
 */
function hasBboxChangedSignificantly(lastBbox: BBox | null, newBbox: BBox): boolean {
  if (!lastBbox) return true;

  const lastCenterLat = (lastBbox.north + lastBbox.south) / 2;
  const lastCenterLon = (lastBbox.east + lastBbox.west) / 2;
  const newCenterLat = (newBbox.north + newBbox.south) / 2;
  const newCenterLon = (newBbox.east + newBbox.west) / 2;

  const lastHeight = lastBbox.north - lastBbox.south;
  const lastWidth = lastBbox.east - lastBbox.west;
  const threshold = Math.min(lastHeight, lastWidth) * 0.25;

  const latDiff = Math.abs(newCenterLat - lastCenterLat);
  const lonDiff = Math.abs(newCenterLon - lastCenterLon);

  return latDiff > threshold || lonDiff > threshold;
}

/**
 * Format a plane record into a label string
 */
function formatLabelText(record: PlaneRecord): string {
  const callsign = record.callsign || record.icao24;
  const alt = formatAltitude(record.altitude);
  return `${callsign}\n${alt}`;
}

/** Response from /planes endpoint */
interface PlanesApiResponse {
  planes: PlaneRecord[];
  count: number;
  rateLimited?: boolean;
  error?: string;
}
```

- [ ] **Step 2: Create PlaneLayer component - Part 2 (main component)**

Continue in the same file:

```typescript
// ==================== PLANE LAYER COMPONENT ====================

export function PlaneLayer() {
  const { viewer, ready } = useCesium();
  const { state: cameraState, getViewportBBox } = useCamera();
  const { isFollowing, track, stop: stopFollow } = useFollowMode();

  // Billboard and label collections
  const billboardApi = createBillboardCollection();

  // Label collection
  let labelCollection: Cesium.LabelCollection | null = null;
  const labelMap = new Map<string, Cesium.Label>();

  // Trail polylines
  let trailPrimitives: Cesium.PrimitiveCollection | null = null;
  const trailPolylines = new Map<string, Cesium.Primitive>();

  // Interpolated positions for smooth animation
  const interpolatedPositions = new Map<string, Cesium.Cartesian3>();

  // Polling interval
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let rateLimitRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveRemove: (() => void) | null = null;

  /**
   * Get bounding box from camera viewport with fallback
   */
  function getBoundingBox(): BBox {
    const viewportBbox = getViewportBBox();

    if (viewportBbox) {
      return viewportBbox;
    }

    // Fallback: camera center + degrees
    const center = cameraState().center;
    if (center) {
      console.warn("[PlaneLayer] Viewport unavailable, using camera center fallback");
      return {
        west: center.lon - VIEWPORT_FALLBACK_DEGREES,
        east: center.lon + VIEWPORT_FALLBACK_DEGREES,
        south: center.lat - VIEWPORT_FALLBACK_DEGREES,
        north: center.lat + VIEWPORT_FALLBACK_DEGREES,
      };
    }

    // Ultimate fallback: global bbox
    console.warn("[PlaneLayer] No camera center available, using global bbox");
    return {
      west: -180,
      east: 180,
      south: -90,
      north: 90,
    };
  }

  /**
   * Fetch planes from proxy server
   */
  async function fetchPlanes(bbox: BBox): Promise<PlanesApiResponse> {
    const url = PROXY_ENDPOINTS.planes({
      minLat: bbox.south,
      maxLat: bbox.north,
      minLon: bbox.west,
      maxLon: bbox.east,
    });

    const response = await fetch(url);
    const data = await response.json();

    if (response.status === 429) {
      return { planes: [], count: 0, rateLimited: true, error: data.error };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch planes: ${response.status}`);
    }

    // Add timestamp to each plane record
    const now = Date.now();
    const planes = (data.planes ?? []).map((p: PlaneRecord) => ({
      ...p,
      timestamp: now,
    }));

    return { planes, count: data.count ?? 0 };
  }

  /**
   * Get current polling interval based on rate limit status
   */
  function getCurrentPollingInterval(): number {
    return planeState.isRateLimited ? PLANE_RATE_LIMITED_INTERVAL : PLANE_UPDATE_INTERVAL;
  }

  /**
   * Handle rate limit detection
   */
  function handleRateLimit(): void {
    if (!planeState.isRateLimited) {
      setRateLimited(true);
      console.warn("[PlaneLayer] Rate limited - backing off");

      restartPolling();

      if (rateLimitRecoveryTimeout) {
        clearTimeout(rateLimitRecoveryTimeout);
      }
      rateLimitRecoveryTimeout = setTimeout(() => {
        setRateLimited(false);
        console.info("[PlaneLayer] Resuming normal polling frequency");
        restartPolling();
      }, PLANE_RATE_LIMIT_RECOVERY_MS);
    }
  }

  /**
   * Restart polling with current interval
   */
  function restartPolling(): void {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(() => refreshPlanes(), getCurrentPollingInterval());
  }

  /**
   * Create label collection
   */
  function initLabelCollection(): void {
    const v = viewer();
    if (!v || v.isDestroyed() || labelCollection) return;

    labelCollection = new Cesium.LabelCollection({
      scene: v.scene,
    });
    v.scene.primitives.add(labelCollection);
  }

  /**
   * Create trail primitives collection
   */
  function initTrailCollection(): void {
    const v = viewer();
    if (!v || v.isDestroyed() || trailPrimitives) return;

    trailPrimitives = new Cesium.PrimitiveCollection();
    v.scene.primitives.add(trailPrimitives);
  }

  /**
   * Add a plane billboard and label
   */
  function addPlane(record: PlaneRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );

    const color = getAltitudeColor(record.altitude);

    // Add billboard
    billboardApi.add({
      id: record.icao24,
      position,
      image: getPlaneIcon(),
      scale: BILLBOARD_SCALE,
      color,
      rotation: -Cesium.Math.toRadians(record.heading),
      data: { icao24: record.icao24, type: "plane" },
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    // Add label
    if (labelCollection) {
      const label = labelCollection.add({
        position,
        text: formatLabelText(record),
        font: "bold 12px Courier New",
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 200000, 0.5),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, PLANE_LABEL_VISIBLE_DISTANCE),
      });
      labelMap.set(record.icao24, label);
    }

    // Initialize interpolated position
    interpolatedPositions.set(record.icao24, position);

    // Update trail
    updateTrail(record.icao24, position, MAX_TRAIL_POINTS);
  }

  /**
   * Update a plane's billboard and label
   */
  function updatePlane(record: PlaneRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );

    const color = getAltitudeColor(record.altitude);

    // Update billboard
    billboardApi.update(record.icao24, {
      position,
      rotation: -Cesium.Math.toRadians(record.heading),
      color,
    });

    // Update label
    const label = labelMap.get(record.icao24);
    if (label) {
      label.position = position;
      label.text = formatLabelText(record);
      label.fillColor = color;
    }

    // Update interpolated position
    interpolatedPositions.set(record.icao24, position);

    // Update trail
    updateTrail(record.icao24, position, MAX_TRAIL_POINTS);
  }

  /**
   * Remove a plane's billboard and label
   */
  function removePlane(icao24: string): void {
    billboardApi.remove(icao24);

    const label = labelMap.get(icao24);
    if (label && labelCollection) {
      labelCollection.remove(label);
      labelMap.delete(icao24);
    }

    interpolatedPositions.delete(icao24);

    // Remove trail polyline
    const trail = trailPolylines.get(icao24);
    if (trail && trailPrimitives) {
      trailPrimitives.remove(trail);
      trailPolylines.delete(icao24);
    }
  }

  /**
   * Highlight selected plane
   */
  function highlightPlane(icao24: string | null, previousIcao24: string | null): void {
    // Restore previous selection
    if (previousIcao24) {
      const prevRecord = getPlaneByIcao24(previousIcao24);
      if (prevRecord) {
        const color = getAltitudeColor(prevRecord.altitude);
        billboardApi.update(previousIcao24, {
          scale: BILLBOARD_SCALE,
          color,
        });
        const label = labelMap.get(previousIcao24);
        if (label) {
          label.fillColor = color;
        }
      }
    }

    // Highlight new selection
    if (icao24) {
      billboardApi.update(icao24, {
        scale: BILLBOARD_SCALE_SELECTED,
        color: Cesium.Color.WHITE,
      });
      const label = labelMap.get(icao24);
      if (label) {
        label.fillColor = Cesium.Color.WHITE;
      }
    }
  }

  /**
   * Refresh planes from server
   */
  async function refreshPlanes(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    try {
      const bbox = getBoundingBox();
      const response = await fetchPlanes(bbox);

      // Handle rate limiting
      if (response.rateLimited) {
        handleRateLimit();
        return;
      }

      // Filter to nearest planes
      const records = filterNearestPlanes(
        response.planes,
        v.camera.positionWC,
        MAX_VISIBLE_PLANES
      );

      const currentIcao24s = new Set(records.map((r) => r.icao24));

      // Update or add planes
      for (const record of records) {
        if (planeState.planes.has(record.icao24)) {
          updatePlane(record);
        } else {
          addPlane(record);
        }
      }

      // Remove planes no longer in view (unless followed)
      for (const icao24 of planeState.planes.keys()) {
        if (!currentIcao24s.has(icao24) && icao24 !== planeState.followingIcao24) {
          removePlane(icao24);
        }
      }

      // Clear trails for planes no longer visible (unless followed)
      clearTrailsExcept(planeState.followingIcao24);

      // Update store
      updatePlanes(records, currentIcao24s);
      setLastBbox(bbox);

      console.info(`[PlaneLayer] Updated ${records.length} planes`);
    } catch (error) {
      console.error("[PlaneLayer] Refresh error:", error);
      if (planeState.planes.size === 0) {
        setError("Failed to load planes");
      }
    }
  }

  /**
   * Handle camera movement
   */
  function onCameraMove(): void {
    if (cameraMoveDebounce) {
      clearTimeout(cameraMoveDebounce);
    }

    cameraMoveDebounce = setTimeout(() => {
      const newBbox = getBoundingBox();

      if (hasBboxChangedSignificantly(planeState.lastBbox, newBbox)) {
        console.info("[PlaneLayer] Viewport changed - refreshing planes");
        refreshPlanes();
      }
    }, CAMERA_MOVE_DEBOUNCE_MS);
  }

  /**
   * Handle click on plane billboard
   */
  function setupClickHandler(): (() => void) | null {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);

      const id = pickedObject?.id;
      if (typeof id === "string" && getPlaneByIcao24(id)) {
        handlePlaneSelection(id);
        return;
      }

      // Clicked empty space - deselect
      if (planeState.selectedIcao24) {
        handlePlaneDeselection();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Double-click to follow
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);

      const id = pickedObject?.id;
      if (typeof id === "string" && getPlaneByIcao24(id)) {
        handlePlaneSelection(id);
        startFollowMode();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }

  /**
   * Handle plane selection
   */
  function handlePlaneSelection(icao24: string): void {
    const previousIcao24 = planeState.selectedIcao24;

    if (previousIcao24 === icao24) {
      // Already selected - deselect
      handlePlaneDeselection();
      return;
    }

    const record = getPlaneByIcao24(icao24);
    if (!record) return;

    // Update local store
    selectPlane(icao24);
    highlightPlane(icao24, previousIcao24);

    // Update selection store
    const flightData: FlightData = {
      icao24: record.icao24,
      callsign: record.callsign || record.icao24,
      originCountry: getAirlineFromCallsign(record.callsign) ?? "Unknown",
      position: {
        lat: record.latitude,
        lng: record.longitude,
        alt: record.altitude,
      },
      velocity: record.velocity,
      heading: record.heading,
      verticalRate: record.verticalRate,
      onGround: record.onGround,
    };
    selectEntity("flight", icao24, flightData);
  }

  /**
   * Handle plane deselection
   */
  function handlePlaneDeselection(): void {
    const previousIcao24 = planeState.selectedIcao24;

    // Stop following if we were following this plane
    if (planeState.followingIcao24 === previousIcao24) {
      stopFollowMode();
    }

    highlightPlane(null, previousIcao24);
    selectPlane(null);
    clearSelection();
  }

  /**
   * Start following selected plane
   */
  function startFollowMode(): void {
    const icao24 = planeState.selectedIcao24;
    if (!icao24) return;

    followPlane(icao24);

    track(
      () => interpolatedPositions.get(icao24) ?? null,
      {
        heading: 0,
        pitch: Cesium.Math.toRadians(PLANE_FOLLOW_PITCH),
        range: PLANE_FOLLOW_RANGE,
        useGroundLevel: false, // Planes are at altitude
      }
    );

    console.info(`[PlaneLayer] Follow mode started for ${icao24}`);
  }

  /**
   * Stop following plane
   */
  function stopFollowMode(): void {
    stopFollow();
    unfollowPlane();
    console.info("[PlaneLayer] Follow mode stopped");
  }

  // Pre-render callback for trail rendering
  usePreRender(() => {
    // Update trail polylines
    for (const [icao24, positions] of planeState.trails) {
      if (positions.length < 2) continue;

      // Remove old polyline
      const existing = trailPolylines.get(icao24);
      if (existing && trailPrimitives) {
        trailPrimitives.remove(existing);
      }

      // Create new polyline
      if (trailPrimitives) {
        // Use PolylineGeometry for efficiency
        const polyline = new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.PolylineGeometry({
              positions: positions,
              width: 2,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.CYAN.withAlpha(0.5)
              ),
            },
          }),
          appearance: new Cesium.PolylineColorAppearance(),
        });

        trailPrimitives.add(polyline);
        trailPolylines.set(icao24, polyline);
      }
    }
  });

  // Initialize when viewer becomes ready
  createEffect(
    on(ready, async (isReady) => {
      if (isReady) {
        await initialize();
      }
    })
  );

  /**
   * Initialize the layer
   */
  async function initialize(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Initialize collections
    initLabelCollection();
    initTrailCollection();

    // Setup click handler
    const removeClickHandler = setupClickHandler();

    // Setup camera movement listener
    const cameraMoveListener = v.camera.moveEnd.addEventListener(() => {
      onCameraMove();
    });
    cameraMoveRemove = () => cameraMoveListener();

    // Initial fetch
    setLoading(true);
    try {
      await refreshPlanes();
    } catch (error) {
      console.error("[PlaneLayer] Initial fetch failed:", error);
      setError("Failed to load planes");
    }

    // Start polling
    updateInterval = setInterval(() => refreshPlanes(), getCurrentPollingInterval());

    // Store cleanup for click handler
    onCleanup(() => {
      removeClickHandler?.();
    });
  }

  // Cleanup on unmount
  onCleanup(() => {
    console.info("[PlaneLayer] unmounted");

    // Stop follow mode
    if (planeState.followingIcao24) {
      stopFollowMode();
    }

    // Clear polling
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    // Clear rate limit timeout
    if (rateLimitRecoveryTimeout) {
      clearTimeout(rateLimitRecoveryTimeout);
      rateLimitRecoveryTimeout = null;
    }

    // Clear camera debounce
    if (cameraMoveDebounce) {
      clearTimeout(cameraMoveDebounce);
      cameraMoveDebounce = null;
    }

    // Remove camera listener
    if (cameraMoveRemove) {
      cameraMoveRemove();
      cameraMoveRemove = null;
    }

    // Remove primitives
    const v = viewer();
    if (v && !v.isDestroyed()) {
      if (labelCollection) {
        v.scene.primitives.remove(labelCollection);
      }
      if (trailPrimitives) {
        v.scene.primitives.remove(trailPrimitives);
      }
    }
    labelCollection = null;
    trailPrimitives = null;
    labelMap.clear();
    trailPolylines.clear();

    // Clear interpolated positions
    interpolatedPositions.clear();

    // Clear store
    clearPlanes();
  });

  // Export follow mode controls for external use
  (window as { planeLayerControls?: { startFollow: () => void; stopFollow: () => void } }).planeLayerControls = {
    startFollow: startFollowMode,
    stopFollow: stopFollowMode,
  };

  // Layers don't render DOM - they add billboards to Cesium
  return null;
}

export default PlaneLayer;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors. If there are errors, they will be one of these:
- `PlaneState` import: Remove the `type PlaneState` import from line 781 - it's not exported from store.ts and isn't used in the component
- If `PlaneRecord` import fails from `./types`: Verify the types.ts file was created in Task 3

- [ ] **Step 4: Commit**

```bash
git add src/layers/planes/PlaneLayer.tsx
git commit -m "feat(planes): add main PlaneLayer component"
```

---

### Task 8: Create layer registration

**Files:**
- Create: `src/layers/planes/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
/**
 * WorldView - Plane Layer Registration
 *
 * Registers the plane layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { PlaneLayer } from "./PlaneLayer";

export * from "./store";
export * from "./types";
export { PlaneLayer };

registerLayer({
  id: "planes",
  name: "Planes",
  icon: "plane",
  component: PlaneLayer,
  defaultEnabled: false,
});
```

- [ ] **Step 2: Import layer in src/layers/index.ts**

In `src/layers/index.ts`, add the import for planes alongside the existing layer imports:

```typescript
import "./planes";
```

This file is the layer barrel that imports all layer modules to trigger registration.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 4: Test layer toggle in UI**

Run the dev server and verify:
1. Planes layer appears in layer toggle UI
2. Toggling it on doesn't crash
3. Planes appear on the globe (if in a busy airspace)

- [ ] **Step 5: Commit**

```bash
git add src/layers/planes/index.ts src/layers/index.ts
git commit -m "feat(planes): register plane layer"
```

---

## Chunk 4: Search UI

### Task 9: Create PlaneSearch.tsx

**Files:**
- Create: `src/layers/planes/PlaneSearch.tsx`

- [ ] **Step 1: Create search component**

```typescript
/**
 * Plane Search - Search planes by callsign
 */

import { createSignal, For, Show, onCleanup } from "solid-js";
import { PROXY_ENDPOINTS } from "../../config";
import { 
  planeState, 
  setSearchQuery, 
  setSearchResults, 
  setSearching,
  clearSearch,
  selectPlane,
  followPlane,
} from "./store";
import type { PlaneRecord } from "./types";
import { formatAltitude, formatSpeed } from "./aircraftTypes";

interface Props {
  onSelect?: (icao24: string) => void;
  onFollow?: (icao24: string) => void;
}

export function PlaneSearch(props: Props) {
  const [inputValue, setInputValue] = createSignal("");
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  async function search(query: string): Promise<void> {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setSearchQuery(query);

    try {
      const url = PROXY_ENDPOINTS.planesSearch(query);
      const response = await fetch(url);
      const data = await response.json();

      if (data.rateLimited) {
        console.warn("[PlaneSearch] Rate limited");
        setSearchResults([]);
        return;
      }

      // Add timestamp to results
      const now = Date.now();
      const planes = (data.planes ?? []).map((p: PlaneRecord) => ({
        ...p,
        timestamp: now,
      }));

      setSearchResults(planes);
    } catch (error) {
      console.error("[PlaneSearch] Search error:", error);
      setSearchResults([]);
    }
  }

  function handleInput(value: string): void {
    setInputValue(value);

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(() => {
      search(value.trim().toUpperCase());
    }, 300);
  }

  function handleSelect(icao24: string): void {
    props.onSelect?.(icao24);
    clearSearch();
    setInputValue("");
  }

  function handleFollow(icao24: string): void {
    props.onFollow?.(icao24);
    clearSearch();
    setInputValue("");
  }

  function handleClear(): void {
    clearSearch();
    setInputValue("");
  }

  onCleanup(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
  });

  return (
    <div class="plane-search">
      <div class="plane-search-input-wrapper">
        <input
          type="text"
          placeholder="Search by callsign..."
          value={inputValue()}
          onInput={(e) => handleInput(e.currentTarget.value)}
          class="plane-search-input"
        />
        <Show when={inputValue()}>
          <button onClick={handleClear} class="plane-search-clear">
            ×
          </button>
        </Show>
      </div>

      <Show when={planeState.isSearching}>
        <div class="plane-search-loading">Searching...</div>
      </Show>

      <Show when={planeState.searchResults.length > 0}>
        <ul class="plane-search-results">
          <For each={planeState.searchResults}>
            {(plane) => (
              <li class="plane-search-result">
                <button
                  onClick={() => handleSelect(plane.icao24)}
                  onDblClick={() => handleFollow(plane.icao24)}
                  class="plane-search-result-btn"
                >
                  <span class="plane-callsign">{plane.callsign || plane.icao24}</span>
                  <span class="plane-info">
                    {formatAltitude(plane.altitude)} · {formatSpeed(plane.velocity)}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={planeState.searchQuery && !planeState.isSearching && planeState.searchResults.length === 0}>
        <div class="plane-search-empty">No planes found</div>
      </Show>
    </div>
  );
}

export default PlaneSearch;
```

- [ ] **Step 2: Add CSS styles and import in component**

Create `src/layers/planes/PlaneSearch.css` and import it at the top of PlaneSearch.tsx:

```typescript
// Add this import at the top of PlaneSearch.tsx
import "./PlaneSearch.css";
```

PlaneSearch.css content:

```css
.plane-search {
  position: relative;
  width: 250px;
}

.plane-search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.plane-search-input {
  width: 100%;
  padding: 8px 30px 8px 12px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1a1a1a;
  color: #fff;
  font-size: 14px;
}

.plane-search-input:focus {
  outline: none;
  border-color: #0af;
}

.plane-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.plane-search-clear:hover {
  color: #fff;
}

.plane-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.plane-search-result {
  border-bottom: 1px solid #333;
}

.plane-search-result:last-child {
  border-bottom: none;
}

.plane-search-result-btn {
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  color: #fff;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plane-search-result-btn:hover {
  background: #333;
}

.plane-callsign {
  font-weight: bold;
  font-size: 14px;
}

.plane-info {
  font-size: 12px;
  color: #888;
}

.plane-search-loading,
.plane-search-empty {
  padding: 12px;
  color: #888;
  font-size: 13px;
  text-align: center;
}
```

- [ ] **Step 3: Export from index.ts**

Add to `src/layers/planes/index.ts`:

```typescript
export { PlaneSearch } from "./PlaneSearch";
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/layers/planes/PlaneSearch.tsx src/layers/planes/PlaneSearch.css src/layers/planes/index.ts
git commit -m "feat(planes): add callsign search component"
```

---

## Chunk 5: Integration & Testing

### Task 10: Integration testing

**Files:**
- No new files

- [ ] **Step 1: Start the server**

Run: `bun run src/server/index.ts`
Expected: Server starts, shows /planes endpoint

- [ ] **Step 2: Test /planes endpoint**

Run: `curl "http://localhost:3001/planes?minLat=40&maxLat=42&minLon=-74&maxLon=-72"`
Expected: JSON with planes array

- [ ] **Step 3: Test /planes/search endpoint**

Run: `curl "http://localhost:3001/planes/search?callsign=UAL"`
Expected: JSON with planes matching UAL callsign prefix

- [ ] **Step 4: Start frontend and test plane layer**

Run: `bun run dev` (or equivalent)

Verify:
1. Toggle planes layer on - planes appear
2. Click a plane - selection panel shows info
3. Double-click a plane - camera follows
4. Click elsewhere - stops following (Escape key handling not implemented in this MVP)
5. Trail appears behind moving planes
6. Zoom out/in - planes update as viewport changes

- [ ] **Step 5: Fix any runtime issues**

Debug and fix any console errors, missing imports, etc.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(planes): integration fixes"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run type check**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `bun run lint` (if available)
Expected: No errors or only minor warnings

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: Existing tests pass

- [ ] **Step 4: Manual testing checklist**

- [ ] Plane layer toggle works
- [ ] Planes render with correct icons
- [ ] Planes colored by altitude band
- [ ] Labels show callsign + altitude
- [ ] Click selects plane, shows info panel
- [ ] Double-click follows plane
- [ ] Escape stops following
- [ ] Trails render behind planes
- [ ] Search finds planes by callsign
- [ ] Search results clickable to select
- [ ] No console errors during normal use

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(planes): complete plane tracking layer implementation"
```

---

## Summary

**Total Tasks:** 11
**Estimated Time:** 3-4 hours

**Files Created:**
- `src/layers/planes/types.ts`
- `src/layers/planes/store.ts`
- `src/layers/planes/PlaneLayer.tsx`
- `src/layers/planes/PlaneSearch.tsx`
- `src/layers/planes/PlaneSearch.css`
- `src/layers/planes/aircraftTypes.ts`
- `src/layers/planes/index.ts`
- `src/server/routes/planes.ts`

**Files Modified:**
- `src/stores/layers.ts` - add planes: boolean
- `src/config.ts` - add planes endpoints
- `src/server/index.ts` - register planes routes
- `src/layers/index.ts` - import planes layer

**Dependencies:** None new - uses existing CesiumJS, SolidJS, and project infrastructure.
