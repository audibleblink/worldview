# PRD: Flight Layer (Milestone 4 - P0)

**Project:** WorldView  
**Feature:** Real-time Flight Tracking  
**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-03-07

---

## Overview

Add real-time aircraft tracking to WorldView using OpenSky Network data. Display commercial flights globally with position, altitude, speed, and heading. Users can select aircraft to view detailed information and follow them with the camera.

### Goals

1. Display real-time aircraft positions from OpenSky Network
2. Render aircraft as rotated billboard icons showing heading
3. Show flight details in an info panel matching the satellite panel pattern
4. Enable camera follow mode for selected aircraft
5. Smooth position interpolation between data updates

### Non-Goals (Deferred to P1+)

- ADS-B Exchange integration (military/unfiltered flights)
- Flight trail rendering
- Altitude color coding
- Military aircraft highlighting
- Bounding box filtering
- Approach path visualization

---

## Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F4.1 | OpenSky Integration | Fetch flight states via server-side proxy | P0 |
| F4.3 | Aircraft Rendering | Billboard icons rotated to match heading | P0 |
| F4.4 | Flight Info Panel | Callsign, altitude, speed, heading, vertical rate, aircraft type, origin/dest | P0 |
| F4.5 | Click-to-Select | Click aircraft to highlight and show info panel | P0 |
| F4.7 | Follow Mode | Camera tracks selected aircraft | P0 |
| F4.11 | Flight Count | "TRACKING: N FLIGHTS" in top bar | P0 |
| F4.X | Position Interpolation | Smooth movement between 10s data updates | P0 |
| F4.Y | Metadata Lookup | Fetch aircraft type via OpenSky metadata API | P0 |

---

## Technical Architecture

### File Structure

| File | Purpose |
|------|---------|
| `src/layers/flights.ts` | FlightLayer class - data fetching, billboard rendering, selection, follow mode |
| `src/ui/flight-info-panel.ts` | Floating info panel for selected aircraft |
| `src/proxy.ts` | Add `/flights` and `/aircraft-meta` proxy routes |
| `src/ui/left-panel.ts` | Add FLIGHTS toggle button |
| `src/main.ts` | Wire up layer, click handler, panel callbacks |
| `public/styles.css` | Add `.flight-info-panel` styles |

### Layer Pattern

Follow the established `SatelliteLayer` pattern:

```typescript
export class FlightLayer {
  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void)
  
  // Lifecycle
  async show(): Promise<void>
  hide(): void
  
  // Updates (10s interval + interpolation)
  updatePositions(): void
  
  // Selection
  selectFlight(icao24: string, onSelect: (flight, meta) => void): void
  deselectFlight(onDeselect?: () => void): void
  
  // Follow mode
  startFollow(): void
  stopFollow(): void
}
```

### Data Flow

```
OpenSky API ─────► Bun Proxy (3001) ─────► FlightLayer ─────► BillboardCollection
                   /flights                  10s poll           interpolated positions
                   /aircraft-meta/{icao24}   on-select
```

---

## API Integration

### OpenSky Network States API

**Endpoint:** `GET https://opensky-network.org/api/states/all`  
**Auth:** Basic auth (credentials in `.env`)  
**Rate Limit:** ~5s with auth, ~10s anonymous  
**Proxy Route:** `GET /flights`

**Request:**
```
GET /flights
```

**Response Fields Used:**

| Index | Field | Type | Usage |
|-------|-------|------|-------|
| 0 | icao24 | string | Unique aircraft identifier |
| 1 | callsign | string | Flight callsign (e.g., "UAL1234") |
| 5 | longitude | float | Position |
| 6 | latitude | float | Position |
| 7 | baro_altitude | float | Altitude in meters |
| 9 | velocity | float | Ground speed in m/s |
| 10 | true_track | float | Heading in degrees (0-360) |
| 11 | vertical_rate | float | Climb/descent in m/s |
| 8 | on_ground | bool | Filter out grounded aircraft |

### OpenSky Metadata API

**Endpoint:** `GET https://opensky-network.org/api/metadata/aircraft/icao/{icao24}`  
**Auth:** Basic auth  
**Proxy Route:** `GET /aircraft-meta/:icao24`  
**Called:** On aircraft selection (not bulk)

**Response Fields Used:**

| Field | Type | Usage |
|-------|------|-------|
| typecode | string | Aircraft type (e.g., "B738") |
| model | string | Full model name |
| registration | string | Tail number |

---

## Data Model

### FlightRecord

```typescript
interface FlightRecord {
  icao24: string;           // Unique ID
  callsign: string;         // "UAL1234"
  longitude: number;        // degrees
  latitude: number;         // degrees
  altitude: number;         // meters
  velocity: number;         // m/s
  heading: number;          // degrees (0-360)
  verticalRate: number;     // m/s (positive = climb)
  onGround: boolean;        // filter if true
  lastUpdate: number;       // timestamp for interpolation
}
```

### FlightMetadata (fetched on selection)

```typescript
interface FlightMetadata {
  typecode: string;         // "B738"
  model: string;            // "Boeing 737-800"
  registration: string;     // "N12345"
}
```

---

## UI Specification

### Aircraft Billboard

- **Icon:** Chevron/arrow shape pointing up
- **Size:** 14px normal, 24px selected
- **Color:** Cyan (`#00ffff`) to match terminal aesthetic
- **Rotation:** Rotated to match `heading` field
- **Click Target:** Billboard `id` set to `icao24`

### Flight Info Panel

Match existing satellite info panel pattern:

```
┌─────────────────────────────────┐
│ FLIGHT SELECTED              ✕ │
├─────────────────────────────────┤
│ CALLSIGN     UAL1234            │
│ ALTITUDE     35,000 ft          │
│ SPEED        425 kts            │
│ HEADING      270°               │
│ V/S          ↓ 1,200 fpm        │
│ TYPE         B738               │
│ ROUTE        SFO → JFK          │
├─────────────────────────────────┤
│         [ FOLLOW ]              │
└─────────────────────────────────┘
```

**Position:** Floating overlay, right of center (left of right panel)  
**Styling:** Copy `.sat-info-panel` pattern

### Flight Count Display

Add to top bar alongside satellite count:

```
TRACKING: 7,234 FLIGHTS
```

### Left Panel Toggle

Add FLIGHTS row below SATELLITES:

```
┌─────────────────┐
│ LAYERS          │
├─────────────────┤
│ SATELLITES [ON] │
│ FLIGHTS    [ON] │
└─────────────────┘
```

---

## Position Interpolation

Aircraft positions update every 10 seconds. To create smooth movement:

1. Store previous position and velocity for each aircraft
2. On each render frame, extrapolate position based on:
   - Time since last update
   - Stored velocity and heading
3. When new data arrives, snap to actual position and store new velocity

```typescript
// Pseudo-code
function interpolatePosition(flight: FlightRecord, now: number): Cartesian3 {
  const elapsed = (now - flight.lastUpdate) / 1000; // seconds
  const distance = flight.velocity * elapsed; // meters
  
  // Project forward along heading
  const newLat = flight.latitude + (distance * Math.cos(heading)) / 111320;
  const newLon = flight.longitude + (distance * Math.sin(heading)) / (111320 * Math.cos(lat));
  
  return Cesium.Cartesian3.fromDegrees(newLon, newLat, flight.altitude);
}
```

---

## Configuration

### Environment Variables

```env
# .env
# Create API client at https://opensky-network.org/my-opensky/account
OPENSKY_CLIENT_ID=your_client_id
OPENSKY_CLIENT_SECRET=your_client_secret
```

### Constants

```typescript
const FLIGHT_UPDATE_INTERVAL = 10_000;  // 10 seconds
const FLIGHT_ICON_SIZE = 14;            // pixels
const FLIGHT_ICON_SIZE_SELECTED = 24;   // pixels
const FLIGHT_COLOR = Cesium.Color.CYAN;
```

---

## Acceptance Criteria

| # | Criteria | Test |
|---|----------|------|
| AC1 | Aircraft render from OpenSky data | See aircraft icons on map when layer enabled |
| AC2 | Aircraft icons rotate to show heading | Icons point in direction of travel |
| AC3 | Clicking aircraft shows info panel | Panel displays callsign, altitude, speed, heading, v/s |
| AC4 | Info panel shows aircraft type | Type fetched from metadata API on selection |
| AC5 | Follow mode tracks selected aircraft | Camera smoothly follows selected flight |
| AC6 | Flight count displays in top bar | Shows "TRACKING: N FLIGHTS" |
| AC7 | Toggle enables/disables layer | FLIGHTS button in left panel works |
| AC8 | Positions interpolate smoothly | Aircraft glide between updates, no jumping |
| AC9 | Data updates every 10 seconds | New positions fetched on interval |
| AC10 | Performance acceptable with 5000+ flights | No frame drops with global view |

---

## Dependencies

- Existing `SatelliteLayer` pattern for reference
- Existing `sat-info-panel.ts` for UI pattern
- Existing proxy server (`src/proxy.ts`)
- OpenSky Network registered account

---

## Out of Scope

Items explicitly deferred to future milestones:

- **F4.2** ADS-B Exchange Integration (P0 in full PRD, deferred here)
- **F4.6** Trail Rendering (P1)
- **F4.8** Altitude Color Coding (P1)
- **F4.9** Military Highlighting (P1)
- **F4.10** Approach Visualization (P2)
- **F4.12** Bounding Box Filter (P1)

---

## Open Questions

1. ~~Should we cache metadata lookups?~~ **Yes** - cache in-memory to avoid repeated API calls for same aircraft
2. ~~Filter grounded aircraft?~~ **Yes** - exclude `on_ground: true` from rendering
3. Origin/destination - OpenSky metadata API may not always have route info. Show "—" when unavailable.
