# Plane Tracking Layer Design

**Date**: 2026-03-16  
**Status**: Draft

## Overview

Add a plane tracking layer to the Cesium worldview application, following the established pattern used by satellites and ships. Users can browse planes in the current viewport, search by callsign, select planes to view details, and follow/orbit planes with the camera.

## Requirements

- **Data Source**: OpenSky Network (free, anonymous access)
- **Scope**: Viewport-based discovery + callsign search
- **Visuals**: Oriented aircraft icon with altitude indicator, fading trail behind
- **Selection Info**: Callsign, altitude, speed, heading, vertical rate, aircraft type
- **Camera**: Follow + orbit using existing `useFollowMode` hook

## Data Layer

### Server Endpoints

#### `GET /planes`

Proxies to OpenSky Network API with bounding box filter.

**Query Parameters**:
- `minLat`, `maxLat`, `minLon`, `maxLon` — viewport bounds

**Upstream API**:
```
https://opensky-network.org/api/states/all?lamin=&lamax=&lomin=&lomax=
```

**Response**: Array of `PlaneRecord`

#### `GET /planes/search`

Searches for planes by callsign prefix.

**Query Parameters**:
- `callsign` — partial or full callsign to match

**Implementation**: Fetches all planes globally from OpenSky, filters by callsign prefix server-side.

**Response**: Array of matching `PlaneRecord`

### Data Types

```ts
interface PlaneRecord {
  icao24: string        // Unique aircraft identifier (hex)
  callsign: string      // Flight number (e.g., "UAL123")
  longitude: number     // Decimal degrees
  latitude: number      // Decimal degrees
  altitude: number      // Meters (barometric altitude)
  velocity: number      // m/s ground speed
  heading: number       // Degrees true north (0-360)
  verticalRate: number  // m/s (+up, -down)
  onGround: boolean     // True if aircraft is on ground
  lastContact: number   // Unix timestamp of last message
}
```

### Rate Limiting

OpenSky anonymous access limits:
- 10 requests/minute
- Bounding box queries only

Client polling strategy:
- Poll every 10 seconds when layer is active
- Trigger immediate poll on significant camera movement
- Back off to 15s when rate-limited (429 response)

## Client Store

**File**: `src/layers/planes/store.ts`

```ts
interface PlaneStore {
  planes: Map<string, PlaneRecord>    // icao24 -> current state
  trails: Map<string, Cartesian3[]>   // icao24 -> position history
  followingIcao24: string | null      // Currently followed plane
  selectedIcao24: string | null       // Currently selected plane
  searchQuery: string                 // Callsign search input
  searchResults: PlaneRecord[]        // Search matches
  loading: boolean
  error: string | null
}
```

### Trail Management

- Append current position to trail array on each update
- Cap trail at 60 points (~10 minutes at 10s intervals)
- Shift oldest point when cap exceeded
- Clear trail when plane leaves viewport and isn't followed
- Persist trail for followed plane even if it leaves viewport

## Rendering

### BillboardCollection (Plane Icons)

- Use `createBillboardCollection()` for efficient rendering
- Plane sprite texture rotated by `heading` value
- Size scaled by altitude (higher planes slightly larger)
- `disableDepthTestDistance: Number.POSITIVE_INFINITY` to render on top of 3D tiles

### LabelCollection (Callsigns)

- Show callsign + altitude (e.g., "UAL123 • FL350")
- Display labels only for:
  - Selected plane
  - Planes within close camera range
- Use flight level notation for altitudes above 18,000ft

### PolylineCollection (Trails)

- One polyline per plane with position history
- Material: gradient from solid (current) to transparent (oldest)
- Width: 2-3 pixels
- Update positions from trail array each render frame

### Altitude Positioning

Unlike ships (sea level), planes use actual altitude from API:
```ts
const position = Cartesian3.fromDegrees(lon, lat, altitude)
```

No terrain sampling needed — planes are airborne.

## Interactions

### Selection (Click)

1. ScreenSpaceEventHandler listens for LEFT_CLICK
2. Pick billboard at click position
3. Update `selectedIcao24` in plane store
4. Update global `selection` store for info panel

### Follow Mode (Double-Click)

1. ScreenSpaceEventHandler listens for LEFT_DOUBLE_CLICK
2. Set `followingIcao24` in store
3. Call `useFollowMode().track()` with position getter:
   ```ts
   track(() => {
     const plane = planes.get(followingIcao24)
     return Cartesian3.fromDegrees(plane.longitude, plane.latitude, plane.altitude)
   }, { range: 5000, pitch: -30 })
   ```
4. Camera orbits plane while it moves
5. User can rotate/zoom freely (Cesium handles input)

### Unfollow

- Click elsewhere on globe
- Press Escape key
- Calls `useFollowMode().stop()`
- Clears `followingIcao24`

### Search Flow

1. User types callsign in search input (UI component)
2. Debounce 300ms, then call `/planes/search?callsign=...`
3. Show results in dropdown list
4. Click result:
   - Camera flies to plane position
   - Selects the plane
5. Double-click result:
   - Immediately follows the plane

## Info Panel

When a plane is selected, populate the global selection store with:

| Field | Source | Display Format |
|-------|--------|----------------|
| Callsign | `callsign` | "UAL123" |
| Altitude | `altitude` | "FL350" or "3,500 ft" |
| Speed | `velocity` | "485 kts" |
| Heading | `heading` | "270° W" |
| Vertical Rate | `verticalRate` | "+1,200 ft/min" or "−800 ft/min" |
| Aircraft Type | lookup by `icao24` | "Boeing 737-800" |

### Aircraft Type Lookup

Static lookup table mapping ICAO24 hex codes to aircraft type.

**Data source**: OpenSky aircraft database (freely available CSV export)

**Implementation**: `aircraftTypes.ts` exports a Map or uses binary search on sorted array for memory efficiency.

**Fallback**: Display "Unknown" if ICAO24 not in database.

## File Structure

```
src/layers/planes/
├── index.ts           # Layer registration with registerLayer()
├── store.ts           # SolidJS store (planes, trails, follow state)
├── types.ts           # PlaneRecord interface, constants
├── PlaneLayer.tsx     # Main component (billboards, labels, trails, handlers)
├── PlaneSearch.tsx    # Search UI component (input, results dropdown)
└── aircraftTypes.ts   # ICAO24 → aircraft type lookup

src/server/routes/
└── planes.ts          # OpenSky proxy endpoints (/planes, /planes/search)
```

## Layer Registration

```ts
// src/layers/planes/index.ts
import { registerLayer } from '../registry'
import PlaneLayer from './PlaneLayer'

registerLayer({
  id: 'planes',
  name: 'Planes',
  icon: '✈️',  // or appropriate icon
  component: PlaneLayer,
  defaultEnabled: false
})
```

Add `planes: boolean` to `LayerState` in `src/stores/layers.ts`.

## Future Enhancements (Out of Scope)

- Route information (origin/destination) — requires additional API
- Flight history/replay
- Filtering by airline, aircraft type, altitude range
- 3D aircraft models instead of billboards
- Predictive path based on filed flight plan

## Dependencies

- OpenSky Network API (external, free)
- Existing: `useFollowMode`, `createBillboardCollection`, layer registry, selection store
