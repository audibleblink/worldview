# PRD: Ground Layer (Milestone 5)

**Project:** WorldView  
**Version:** 1.0  
**Date:** March 7, 2026  
**Status:** Draft

---

## 1. Overview

### 1.1 Summary

Implement the Ground Layer for WorldView, adding street-level visualization with three core systems:

1. **Traffic Particle System** — Animated particles flowing along Austin streets
2. **CCTV Integration** — Live traffic camera feeds projected into the 3D scene
3. **Earthquake Visualization** — Real-time seismic activity with animated rings

### 1.2 Goals

- Bring the 3D world to life with street-level motion
- Demonstrate real-time data fusion from multiple public sources
- Maintain 30+ FPS with all ground layer features active

### 1.3 Non-Goals

- Actual traffic speed data (particles simulate flow, not real speeds)
- Historical playback of traffic or seismic events
- Mobile optimization

---

## 2. Technical Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Particle Rendering | Cesium `PointPrimitiveCollection` | Native integration, GPU-accelerated, proven at scale |
| Particle Budget | 5,000 max | Balances visual density with GPU headroom |
| OSM Data | On-demand fetch + IndexedDB cache | Avoids large upfront download, works globally |
| CCTV Proxy | Bun server with frame sampling | Solves CORS, reduces bandwidth with 1fps thumbnails |
| CCTV Display | Billboard at camera GPS coords | Simple, reliable, no building geometry required |
| Earthquake Data | Real-time USGS + demo fallback | Handles Austin's low seismic activity gracefully |

---

## 3. Traffic Particle System

### 3.1 Features

| ID | Feature | Priority |
|----|---------|----------|
| F5.1 | OSM Road Network — Fetch street geometry for current viewport | P0 |
| F5.2 | Traffic Particles — Animated dots flowing along roads | P0 |
| F5.3 | Traffic Direction — Particles respect one-way streets via OSM `oneway` tag | P1 |
| F5.4 | Traffic Density — Vary particle count by road classification | P1 |
| F5.13 | Particle Style Toggle — Switch between heat-map and terminal modes | P1 |

### 3.2 Road Network

**Data Source:** OpenStreetMap Overpass API  
**Endpoint:** `https://overpass-api.de/api/interpreter`

**Fetch Strategy:**
1. Compute bounding box from current camera view
2. Query Overpass for highways within bounds
3. Parse response into road segments (arrays of [lon, lat] pairs)
4. Cache in IndexedDB keyed by tile coordinates
5. Re-fetch when camera moves outside cached area

**Overpass Query Template:**
```
[out:json][timeout:25];
(
  way["highway"~"motorway|primary|secondary|tertiary|residential"]({{bbox}});
);
out geom;
```

**Road Classifications:**

| OSM `highway` Tag | Particle Speed | Particle Density | Color (Heat-map) |
|-------------------|----------------|------------------|------------------|
| motorway | 1.0x | High (40%) | Green |
| primary | 0.8x | Medium-high (25%) | Yellow-green |
| secondary | 0.6x | Medium (20%) | Yellow |
| tertiary | 0.4x | Medium-low (10%) | Orange |
| residential | 0.2x | Low (5%) | Red |

### 3.3 Particle System

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    TrafficParticleSystem                │
├─────────────────────────────────────────────────────────┤
│ - roadNetwork: RoadSegment[]                            │
│ - particles: PointPrimitiveCollection                   │
│ - particlePool: ParticleState[]                         │
│ - styleMode: 'heatmap' | 'terminal'                     │
├─────────────────────────────────────────────────────────┤
│ + initialize(viewer: Cesium.Viewer)                     │
│ + updateRoads(bbox: BoundingBox): Promise<void>         │
│ + update(deltaTime: number): void                       │
│ + setStyleMode(mode: string): void                      │
│ + destroy(): void                                       │
└─────────────────────────────────────────────────────────┘
```

**ParticleState:**
```typescript
interface ParticleState {
  segmentIndex: number;      // Current road segment
  progress: number;          // 0-1 along segment
  speed: number;             // Based on road class
  direction: 1 | -1;         // Forward or reverse
}
```

**Update Loop (per frame):**
1. Advance each particle along its segment by `speed * deltaTime`
2. If particle reaches segment end:
   - Find connected segments at intersection
   - Randomly select next segment (weighted by road class)
   - Reset progress to 0
3. Update particle position in `PointPrimitiveCollection`
4. Update particle color based on style mode

**Visual Styles:**

| Mode | Description |
|------|-------------|
| Heat-map | Red (slow) → Yellow → Green (fast), based on road class |
| Terminal | Phosphor green (#00ff41) with intensity varying by speed |

Both modes apply subtle glow/bloom via existing shader pipeline.

### 3.4 Geographic Focus

**Initial Area:** Downtown Austin  
**Bounding Box:** `[-97.76, 30.25, -97.72, 30.29]`

This area provides:
- Dense road network for visual impact
- Mix of road types (I-35, Congress Ave, residential)
- Overlap with CCTV camera coverage

---

## 4. CCTV Integration

### 4.1 Features

| ID | Feature | Priority |
|----|---------|----------|
| F5.5 | CCTV Feed List — Catalog of Austin traffic cameras | P0 |
| F5.6 | Feed Thumbnail — Live preview in left panel | P0 |
| F5.7 | Feed Projection — Project selected feed onto 3D scene as billboard | P0 |
| F5.8 | Multi-Feed Display — Show multiple feeds simultaneously | P2 |

### 4.2 Data Source

**Provider:** Austin Transportation Department  
**Camera Count:** ~200 traffic cameras  
**Format:** MJPEG streams  
**Metadata:** JSON with camera ID, name, coordinates, stream URL

**Camera Catalog Endpoint:** (to be determined from Austin open data portal)

### 4.3 Proxy Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Browser   │────▶│   Bun Proxy     │────▶│  Austin MJPEG    │
│             │◀────│   Server        │◀────│  Streams         │
└─────────────┘     └─────────────────┘     └──────────────────┘
                           │
                    Frame Sampling
                    (1 fps thumbnails)
```

**Proxy Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cctv/cameras` | GET | List cameras in viewport |
| `/api/cctv/thumbnail/:id` | GET | Latest JPEG frame (1fps) |
| `/api/cctv/stream/:id` | GET | Full MJPEG stream relay |

**Query Parameters:**
- `bbox` — Bounding box filter: `minLon,minLat,maxLon,maxLat`

### 4.4 Left Panel UI

**Camera List Component:**
```
┌─────────────────────────────┐
│ 📹 CCTV FEEDS               │
├─────────────────────────────┤
│ ┌─────────┐ Congress @ 6th  │
│ │ [thumb] │ ● LIVE          │
│ └─────────┘                 │
│ ┌─────────┐ I-35 @ 51st     │
│ │ [thumb] │ ● LIVE          │
│ └─────────┘                 │
│ ┌─────────┐ Lamar @ 38th    │
│ │ [thumb] │ ○ OFFLINE       │
│ └─────────┘                 │
│         ... scroll ...      │
└─────────────────────────────┘
```

**Behavior:**
- List updates as camera moves (viewport-filtered)
- Thumbnails refresh every 1 second
- Click camera to project into 3D scene
- Shift+click to project multiple (P2)

### 4.5 3D Projection

**Billboard Specification:**
- Position: Camera GPS coordinates, 15m above ground
- Size: 8m × 6m (4:3 aspect, adjustable)
- Orientation: Always faces viewer (Cesium billboard behavior)
- Border: 2px terminal green with subtle glow
- Label: Camera name below billboard

**Implementation:**
```typescript
interface CCTVBillboard {
  cameraId: string;
  entity: Cesium.Entity;        // Billboard + label
  videoElement: HTMLVideoElement;
  texture: Cesium.Texture;
}
```

**Update Loop:**
1. Check if stream is active
2. Draw video frame to canvas
3. Update Cesium texture from canvas
4. ~15fps texture updates for smooth video

---

## 5. Earthquake Visualization

### 5.1 Features

| ID | Feature | Priority |
|----|---------|----------|
| F5.9 | USGS Earthquake Data — Fetch recent seismic events | P1 |
| F5.10 | Earthquake Visualization — Concentric rings at epicenter | P1 |
| F5.11 | Magnitude Scaling — Ring size/color by magnitude | P1 |
| F5.12 | Event Timeline — Show when earthquakes occurred | P2 |

### 5.2 Data Source

**Provider:** USGS Earthquake Hazards Program  
**Endpoint:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`  
**Update Frequency:** Poll every 60 seconds  
**Response:** GeoJSON FeatureCollection

**Relevant Fields:**
```typescript
interface EarthquakeFeature {
  properties: {
    mag: number;        // Magnitude
    place: string;      // Location description
    time: number;       // Unix timestamp (ms)
    type: string;       // "earthquake"
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
}
```

### 5.3 Demo Fallback

Since Austin has minimal seismic activity, implement demo mode:

1. If no earthquakes within 500km of viewport center in last 24h:
   - Generate synthetic earthquake at random location in view
   - Magnitude 2.5-4.5 (visually interesting, not alarming)
   - Show "SIMULATED" label

2. Demo earthquakes cycle every 30 seconds

### 5.4 Ring Visualization

**Animation:**
```
t=0s    ●          (epicenter dot)
t=1s    ○●○        (first ring expanding)
t=2s   ○ ● ○       (rings continue outward)
t=3s  ○  ●  ○      (max 3 concurrent rings)
t=4s ○   ●   ○     (oldest ring fades out)
```

**Ring Properties:**

| Magnitude | Max Radius | Ring Color | Ring Count |
|-----------|------------|------------|------------|
| < 3.0 | 10 km | Yellow | 2 |
| 3.0 - 4.5 | 25 km | Orange | 3 |
| 4.5 - 6.0 | 50 km | Red | 4 |
| > 6.0 | 100 km | Deep Red | 5 |

**Implementation:**
- Use Cesium `EllipseGraphics` with animated `semiMajorAxis`
- Material: `PolylineGlowMaterialProperty` for ring glow
- Fade opacity from 1.0 → 0.0 as ring expands

### 5.5 Epicenter Marker

- Pulsing dot at earthquake location
- Size scaled by magnitude (M * 2 pixels base)
- Color matches ring color
- Label shows: "M{magnitude} - {place}"

---

## 6. Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame Rate | 30+ FPS | With all ground layer features active |
| Particle Update | < 2ms | Per-frame particle position updates |
| OSM Fetch | < 3s | Initial road network load |
| CCTV Thumbnail | < 500ms | Time to first frame |
| Memory Delta | < 200MB | Additional memory from ground layer |

**Optimization Strategies:**
- Particle LOD: Reduce count when zoomed out
- Road culling: Only process roads in frustum
- Texture pooling: Reuse CCTV textures
- Batch updates: Update particles in chunks

---

## 7. File Structure

```
src/
├── ground/
│   ├── index.ts                 # Ground layer orchestration
│   ├── traffic/
│   │   ├── TrafficParticleSystem.ts
│   │   ├── RoadNetwork.ts
│   │   ├── OSMFetcher.ts
│   │   └── particleStyles.ts
│   ├── cctv/
│   │   ├── CCTVManager.ts
│   │   ├── CCTVPanel.ts         # Left panel UI
│   │   ├── CCTVBillboard.ts
│   │   └── types.ts
│   └── seismic/
│       ├── EarthquakeLayer.ts
│       ├── USGSFetcher.ts
│       └── RingAnimation.ts
├── server/
│   └── routes/
│       └── cctv.ts              # Proxy endpoints
```

---

## 8. Acceptance Criteria

| # | Criteria | Feature |
|---|----------|---------|
| AC1 | Traffic particles animate along Austin streets at 30+ FPS | Traffic |
| AC2 | Particles flow in correct direction on one-way streets | Traffic |
| AC3 | Particle color/speed varies by road classification | Traffic |
| AC4 | User can toggle between heat-map and terminal particle styles | Traffic |
| AC5 | CCTV cameras in viewport appear in left panel with thumbnails | CCTV |
| AC6 | Thumbnails update live (1fps) | CCTV |
| AC7 | Clicking camera projects billboard into 3D scene | CCTV |
| AC8 | Billboard displays live video feed | CCTV |
| AC9 | Earthquake rings animate outward from epicenter | Seismic |
| AC10 | Ring size/color corresponds to magnitude | Seismic |
| AC11 | Demo earthquakes appear if no real events nearby | Seismic |
| AC12 | All features work together without dropping below 30 FPS | Performance |

---

## 9. Implementation Order

1. **Phase 1: Traffic Particle System**
   - OSM road fetching and caching
   - Particle system with Cesium primitives
   - Heat-map and terminal style modes
   - One-way street support

2. **Phase 2: CCTV Integration**
   - Camera catalog and proxy endpoints
   - Left panel thumbnail UI
   - Billboard projection
   - Video texture streaming

3. **Phase 3: Earthquake Visualization**
   - USGS data fetching
   - Ring animation system
   - Demo fallback logic
   - Magnitude scaling

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Exact Austin CCTV catalog endpoint URL? | TBD - research Austin open data |
| Q2 | Should particles persist across tile boundaries during camera pan? | TBD |
| Q3 | Maximum number of simultaneous CCTV billboards? | Suggest: 4 |
| Q4 | Should earthquake history be shown or only active events? | Suggest: Last 24h with fade |

---

## 11. Dependencies

This milestone assumes the following are already implemented:
- CesiumJS viewer with Google 3D Tiles
- Bun server with proxy capabilities
- Left panel UI shell
- Shader pipeline for glow/bloom effects

---

*End of PRD*
