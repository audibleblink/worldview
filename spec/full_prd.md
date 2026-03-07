# WorldView — Full Product Requirements Document

**Project:** WorldView (Browser-Based Spy Satellite Simulator)  
**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-03-07

---

## Executive Summary

WorldView is a browser-based geospatial intelligence visualization tool that recreates the aesthetic and functionality of classified surveillance systems using entirely public data sources. The project demonstrates "spatial intelligence" — AI that understands the physical world the way language models understand text.

Built as a toy/demo, WorldView combines Google Photorealistic 3D Tiles, real-time satellite tracking, live flight data, street traffic visualization, and actual CCTV feeds into a single interface styled as a classified intelligence terminal. The result is a panoptic view of the physical world accessible to anyone with a browser.

> "You can see everything." — The thesis made visible.

---

## Background & Motivation

### Origin

Inspired by [Bilawal Sidhu's WorldView project](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator), which demonstrated that a single developer using AI coding assistants could build in a weekend what previously required months of specialized geospatial engineering.

### The Spatial Intelligence Thesis

We're building AI that understands the physical world the way it understands text. Not images — **space**. Not object recognition — **spatial relationships, change over time, movement through a scene**. The difference between "a car" and "that car, at that intersection, at that speed, at that hour."

WorldView is the visualization layer for this thesis. It doesn't have the intelligence layer yet, but it has the view, the data fusion, and the interface that makes you feel what becomes possible when the physical world becomes queryable and programmable.

### Surveillance vs. Sousveillance

The project explores the concept of "the two viellances":
- **Surveillance**: The state watching you
- **Sousveillance**: You watching back

WorldView is sousveillance aesthetics — the same data streams, satellite feeds, and CCTV cameras that intelligence agencies use, but accessible in a browser tab that anyone controls.

---

## Goals

### Primary Goals

1. **Demonstrate spatial data fusion** — Combine multiple real-time data sources (satellites, flights, traffic, CCTV) into a unified 3D view
2. **Recreate classified terminal aesthetics** — Military-grade visual language (CRT, NVG, FLIR, targeting reticles) running on public data
3. **Enable exploration** — Let users navigate the physical world from the perspective of an intelligence analyst
4. **Maintain accessibility** — Everything runs in a browser with no special hardware or clearances required

### Secondary Goals

1. Serve as a foundation for future AI query layers
2. Demonstrate modern AI-assisted development capabilities
3. Explore the implications of democratized geospatial intelligence

### Non-Goals

1. Actual intelligence analysis or classified data access
2. Mobile-first design (desktop browsers only)
3. Production-grade reliability or uptime guarantees
4. Real-time alerting or operational use cases

---

## Technical Architecture

### Stack Overview

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | Bun | Single tool for dev server, bundler, HTTP proxy |
| 3D Renderer | CesiumJS | Native 3D Tiles support, camera math, well-documented |
| 3D Tiles | Google Maps Tile API | Photorealistic global coverage |
| Language | TypeScript | Type safety for complex geospatial structures |
| Styling | Vanilla CSS | Custom terminal aesthetic, no framework overhead |
| Build | Bun bundler | Native, fast, handles CesiumJS assets |

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser Client                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   UI Shell  │  │   Shaders   │  │  Data Layers│  │   Globe     │ │
│  │  (Panels)   │  │ (WebGL/CSS) │  │  (Realtime) │  │ (CesiumJS)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Tile Proxy│   │ Data APIs │   │  CCTV     │
            │ :3001     │   │ (Direct)  │   │  Feeds    │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Google   │   │ OpenSky   │   │  Austin   │
            │ Maps Tile │   │ CelesTrak │   │  Traffic  │
            │   API     │   │ ADS-B     │   │   Cams    │
            └───────────┘   └───────────┘   └───────────┘
```


---

## Data Sources

### Google Photorealistic 3D Tiles

**Source:** Google Maps Tile API  
**Documentation:** https://developers.google.com/maps/documentation/tile  
**Used For:** Global 3D terrain and building models

The foundation layer. Provides volumetric city models reconstructed from aerial photography — the same technology that powers Google Earth. Accessed via session tokens and proxied through a local server to protect the API key.

**Integration Details:**
- Endpoint: `https://tile.googleapis.com/v1/3dtiles/root.json`
- Authentication: API key as query parameter
- Format: 3D Tiles 1.0 (glTF + Draco compression)
- Session: Required for proper tile loading

### CelesTrak TLE Data

**Source:** CelesTrak (celestrak.org)  
**Format:** Two-Line Element (TLE) sets  
**Used For:** Real-time satellite orbital positions

Provides orbital parameters for 180+ satellites including:
- Active communication satellites
- GPS constellation
- ISS and crewed spacecraft
- Reconnaissance satellites (publicly tracked)

**Integration Details:**
- Endpoint: `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`
- Update frequency: Every 6-12 hours (orbits are predictable)
- Calculation: SGP4 propagation for real-time position
- Click behavior: Follow selected satellite orbit

### OpenSky Network

**Source:** OpenSky Network (opensky-network.org)  
**Format:** REST API / JSON  
**Used For:** Real-time commercial flight tracking

Crowdsourced ADS-B receiver network providing:
- 7,000+ live aircraft positions
- Callsigns, altitudes, velocities, headings
- Aircraft type and registration
- Origin/destination when available

**Integration Details:**
- Endpoint: `https://opensky-network.org/api/states/all`
- Update frequency: ~5 seconds (rate limited)
- Authentication: Anonymous (limited) or registered
- Coverage: Global but density varies

### ADS-B Exchange

**Source:** ADS-B Exchange (adsbexchange.com)  
**Format:** REST API / JSON  
**Used For:** Military and government flight tracking

Unlike filtered services, ADS-B Exchange shows:
- Military aircraft with callsigns
- Government/law enforcement flights
- Blocked aircraft (N-numbers hidden elsewhere)

**Integration Details:**
- Endpoint: `https://adsbexchange.com/api/aircraft/v2/all`
- API key: Required (RapidAPI)
- Update frequency: ~1 second
- Notable: Unfiltered, shows BLOCKED aircraft

### OpenStreetMap Overpass API

**Source:** OpenStreetMap via Overpass  
**Format:** JSON  
**Used For:** Street network for traffic particle visualization

Provides road geometry for rendering vehicle flow:
- Highway classifications
- Road directions (one-way detection)
- Intersection nodes

**Integration Details:**
- Endpoint: `https://overpass-api.de/api/interpreter`
- Query: Extract highways within bounding box
- Caching: Aggressive (street networks rarely change)
- Rendering: WebGL particle system along road paths

### Austin Public Traffic Cameras

**Source:** Austin Transportation Department  
**Format:** MJPEG / HLS streams  
**Used For:** Real CCTV feeds projected onto 3D geometry

Public traffic camera feeds with known geographic coordinates:
- ~200 cameras across Austin metro
- Real-time video streams
- GPS coordinates for 3D projection

**Integration Details:**
- Source URL: City of Austin open data portal
- Format: MJPEG streams or HLS
- Projection: Map feed to building facade at camera location
- Latency: 5-15 seconds typical

### USGS Earthquake API

**Source:** USGS Earthquake Hazards Program  
**Format:** GeoJSON  
**Used For:** Seismic activity overlay

Real-time earthquake data:
- Magnitude and depth
- Location coordinates
- Time of event
- Felt reports

**Integration Details:**
- Endpoint: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
- Update frequency: Every minute
- Visualization: Concentric rings at epicenter, scaled by magnitude

---

## Milestone Breakdown

### Milestone 1: Globe Foundation

**Goal:** Foundational shell — navigable 3D globe, UI chrome, city/POI fly-to navigation. No live data feeds. No shaders. The skeleton everything else builds on.

**Output:** A working intelligence terminal that happens to have no active feeds yet — the aesthetic is complete, the data layers are stubbed.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F1.1 | Project Scaffold | Bun + TypeScript + CesiumJS build system | P0 |
| F1.2 | Tile Proxy Server | Bun HTTP proxy for Google API key protection | P0 |
| F1.3 | 3D Globe Render | Google Photorealistic 3D Tiles via CesiumJS | P0 |
| F1.4 | Default Camera | Full globe view, altitude ~15,000km, centered 0°N 0°E | P0 |
| F1.5 | Camera Controls | Mouse orbit/zoom/pan via CesiumJS defaults | P0 |
| F1.6 | City POI System | 8 cities × 4 POIs each with coordinates | P0 |
| F1.7 | Fly-To Animation | 2-second smooth camera flight to POI | P0 |
| F1.8 | Keyboard Navigation | Q/W/E/R/T for POI 1-5 of current city | P0 |
| F1.9 | UI Shell Layout | Black bg, cyan text, monospace font | P0 |
| F1.10 | Top Bar | WORLDVIEW wordmark, tagline, mode indicator | P0 |
| F1.11 | REC Indicator | Live UTC timestamp with "REC" badge | P0 |
| F1.12 | Classification Watermark | "TOP SECRET // SI-TK // NOFORN" (aesthetic) | P1 |
| F1.13 | Circular Vignette | CSS radial-gradient lens effect on viewport | P0 |
| F1.14 | Left Panel - City Selector | Dropdown to switch cities (triggers fly-to) | P0 |
| F1.15 | Left Panel - POI Nav | PREV/NEXT buttons, current POI display | P0 |
| F1.16 | Left Panel - Stubbed Controls | Disabled toggles and sliders (visual only) | P1 |
| F1.17 | Left Panel - CCTV Placeholder | Black area with "NO FEED" text | P1 |
| F1.18 | Right Panel - Parameters | 3 stubbed sliders (Pixelation/Distortion/Instability) | P1 |
| F1.19 | Right Panel - Telemetry | Live GSD, NIIRS, ALT, SUB from camera state | P0 |
| F1.20 | Bottom Bar - Mode Buttons | NORMAL/CRT/NVG/FLIR/ANIME/NAVI (visual toggle only) | P0 |
| F1.21 | Bottom Bar - City Tabs | Quick-jump buttons for all 8 cities | P1 |
| F1.22 | Bottom Bar - Location Tooltip | Current POI name + city display | P0 |
| F1.23 | Scanline Texture | CSS-only subtle CRT scanlines on page | P2 |

#### Cities and POIs

| City | POI 1 | POI 2 | POI 3 | POI 4 |
|------|-------|-------|-------|-------|
| Austin, TX | Texas State Capitol | Congress Ave Bridge | UT Tower | Sixth Street |
| San Francisco, CA | Golden Gate Bridge | Salesforce Tower | Alcatraz | Bay Bridge |
| New York, NY | Empire State Building | Brooklyn Bridge | Statue of Liberty | One WTC |
| Tokyo, Japan | Tokyo Tower | Shibuya Crossing | Senso-ji | Tokyo Skytree |
| London, UK | Tower Bridge | Big Ben | Buckingham Palace | The Shard |
| Paris, France | Eiffel Tower | Arc de Triomphe | Notre-Dame | Louvre |
| Dubai, UAE | Burj Khalifa | Palm Jumeirah | Dubai Frame | Burj Al Arab |
| Washington, DC | US Capitol | Washington Monument | Pentagon | Lincoln Memorial |

#### UI Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Background | `#000000` | Primary background |
| Primary Cyan | `#00f0ff` | Labels, active elements, highlights |
| Secondary Teal | `#4a9e8a` | Readouts, secondary text |
| Highlight Green | `#00ff88` | Enabled toggles, success states |
| Dim Gray | `#333333` | Disabled elements, borders |
| Warning Amber | `#ffaa00` | Warnings, attention items |

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | `bun run dev` starts successfully with no errors |
| AC2 | Google Photorealistic 3D Tiles load and render the full Earth globe |
| AC3 | Zooming into any of the 8 cities shows photorealistic 3D buildings |
| AC4 | City dropdown switches city and camera flies to that city's first POI |
| AC5 | Q/W/E/R/T keyboard shortcuts fly to POIs 1–5 of the current city |
| AC6 | PREV/NEXT buttons navigate POIs within the current city |
| AC7 | All UI panels render with the correct terminal aesthetic |
| AC8 | Circular vignette lens effect is visible on the globe viewport |
| AC9 | Mode switcher buttons are present and toggle visual active state |
| AC10 | Stubbed controls in left and right panels are visible but disabled |
| AC11 | Right panel shows live-updating ALT and SUB values from camera |
| AC12 | REC timestamp in top bar shows live UTC clock |
| AC13 | Google API key is never present in frontend bundle |
| AC14 | No console errors on load in Chrome/Firefox |

---

### Milestone 2: Shader Pipeline

**Goal:** Post-processing visual effects that transform the view between military display modes — CRT, night vision, thermal imaging, cel-shading, and more.

**Output:** Mode switcher buttons actually work. Each mode applies a distinct visual filter that transforms the entire viewport.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F2.1 | Shader Manager | Switching logic, transition effects | P0 |
| F2.2 | CRT Mode | Scanlines, phosphor glow, barrel distortion, flicker | P0 |
| F2.3 | NVG Mode | Green phosphor tint, intensifier noise, vignette | P0 |
| F2.4 | FLIR Mode | Thermal palette (white-hot, black-hot, iron), false color | P0 |
| F2.5 | Anime Mode | Cel-shading, outline detection, flat color | P1 |
| F2.6 | Normal Mode | Clean pass-through, no effects | P0 |
| F2.7 | NAVI Mode | Navigation overlay, enhanced contrast, waypoint display | P2 |
| F2.8 | Transition Effects | Smooth blend between modes | P1 |
| F2.9 | Parameter Sliders | Pixelation, Distortion, Instability now functional | P1 |

#### Shader Technical Approach

**CRT Mode:**
```
- Horizontal scanlines (alternating row brightness)
- RGB subpixel separation (chromatic aberration)
- Barrel distortion (curved screen simulation)
- Phosphor bloom (gaussian blur on bright areas)
- Frame flicker (subtle brightness oscillation)
```

**NVG (Night Vision) Mode:**
```
- Monochrome green channel extraction
- Intensifier noise (film grain effect)
- Circular vignette (tube distortion)
- Bloom on bright sources (light bleeding)
- Slight temporal noise
```

**FLIR (Thermal) Mode:**
```
- Luminance-based false color mapping
- Palette options: White-hot, Black-hot, Iron, Rainbow
- Edge enhancement (thermal contrast)
- Targeting reticle overlay
- Temperature scale display
```

**Anime (Cel-Shading) Mode:**
```
- Sobel edge detection for outlines
- Posterization (reduce color levels)
- Flat shading (remove subtle gradients)
- Ink outline rendering
- Warm/soft color grading
```

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | Clicking each mode button applies the corresponding shader |
| AC2 | CRT mode displays visible scanlines and subtle curvature |
| AC3 | NVG mode renders in green monochrome with noise |
| AC4 | FLIR mode applies thermal false-color palette |
| AC5 | Anime mode shows cel-shaded rendering with outlines |
| AC6 | Normal mode shows clean unfiltered view |
| AC7 | Mode transitions are smooth (no jarring cuts) |
| AC8 | Parameter sliders affect shader intensity |
| AC9 | Shaders perform at 30+ FPS on mid-range hardware |
| AC10 | Mode persists across city/POI navigation |

---

### Milestone 3: Satellite Layer

**Goal:** Real-time satellite tracking using CelesTrak TLE data. Display orbital paths, enable click-to-track, show satellite information.

**Output:** Pull back to globe view and see 180+ satellites in their actual orbital positions, updated in real-time.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F3.1 | TLE Data Fetching | Download from CelesTrak, parse TLE format | P0 |
| F3.2 | SGP4 Propagation | Calculate real-time position from orbital elements | P0 |
| F3.3 | Satellite Rendering | 3D points/icons at orbital positions | P0 |
| F3.4 | Orbital Path Display | Show satellite's orbital trajectory line | P0 |
| F3.5 | Click-to-Select | Click satellite to highlight and track | P0 |
| F3.6 | Follow Mode | Camera tracks selected satellite | P1 |
| F3.7 | Info Panel | Satellite name, altitude, period, velocity | P0 |
| F3.8 | Ground Track | Project orbital path onto Earth surface | P1 |
| F3.9 | Pass Prediction | When satellite passes over current view | P2 |
| F3.10 | Constellation Filtering | Show/hide by category (GPS, comm, ISS) | P1 |
| F3.11 | Satellite Count Display | "TRACKING: 183 SATS" indicator | P1 |

#### Satellite Categories

| Category | Source | Examples |
|----------|--------|----------|
| Active Satellites | celestrak.org/active | General active satellites |
| Space Stations | celestrak.org/stations | ISS, Tiangong |
| GPS Operational | celestrak.org/gps-ops | GPS constellation |
| Starlink | celestrak.org/starlink | SpaceX Starlink |
| Weather | celestrak.org/weather | GOES, NOAA |
| Military | celestrak.org/military | Publicly tracked reconnaissance |

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | 100+ satellites render at correct orbital positions |
| AC2 | Satellite positions update in real-time |
| AC3 | Clicking a satellite selects it and shows info panel |
| AC4 | Selected satellite's orbital path is displayed |
| AC5 | "Follow" mode tracks selected satellite smoothly |
| AC6 | Ground track projection displays on Earth surface |
| AC7 | Category filters show/hide satellite groups |
| AC8 | Satellite rendering doesn't impact frame rate significantly |

---

### Milestone 4: Flight Layer

**Goal:** Real-time aircraft tracking from OpenSky Network and ADS-B Exchange. Display commercial and military flights with metadata.

**Output:** See planes descending into Austin at 3 AM, military flights circling with callsigns, the full air traffic picture.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F4.1 | OpenSky Integration | Fetch commercial flight states | P0 |
| F4.2 | ADS-B Exchange Integration | Fetch military/government flights | P0 |
| F4.3 | Aircraft Rendering | 3D icons at positions with correct heading | P0 |
| F4.4 | Flight Info Panel | Callsign, altitude, speed, heading, aircraft type | P0 |
| F4.5 | Click-to-Select | Click aircraft to highlight and show info | P0 |
| F4.6 | Trail Rendering | Show recent flight path as fading trail | P1 |
| F4.7 | Follow Mode | Camera tracks selected aircraft | P1 |
| F4.8 | Altitude Color Coding | Color by altitude band | P1 |
| F4.9 | Military Highlighting | Special styling for military aircraft | P1 |
| F4.10 | Approach Visualization | Descent paths into airports | P2 |
| F4.11 | Flight Count Display | "TRACKING: 7,234 FLIGHTS" indicator | P1 |
| F4.12 | Bounding Box Filter | Only load flights in current view | P1 |

#### Flight Data Fields

| Field | Source | Display |
|-------|--------|---------|
| Callsign | icao24 lookup | "UAL1234" |
| Position | lat/lon/alt | Map placement |
| Velocity | m/s | "425 kts" |
| Heading | degrees | Icon rotation |
| Vertical Rate | m/s | Climb/descend indicator |
| On Ground | boolean | Taxi vs airborne |
| Squawk | transponder code | Emergency detection |
| Aircraft Type | icao24 database | "B737" |
| Origin/Dest | when available | "SFO → JFK" |

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | Commercial flights render from OpenSky data |
| AC2 | Military flights render from ADS-B Exchange |
| AC3 | Aircraft icons point in direction of travel |
| AC4 | Clicking aircraft shows callsign, altitude, speed |
| AC5 | Flight trails render showing recent path |
| AC6 | Follow mode tracks selected aircraft smoothly |
| AC7 | Military aircraft have distinct visual styling |
| AC8 | Flight data updates every 5-10 seconds |
| AC9 | Performance remains acceptable with 1000+ flights visible |

---

### Milestone 5: Ground Layer

**Goal:** Street-level visualization with traffic particle systems, CCTV feed projection, and seismic activity overlays.

**Output:** See vehicle flow on Austin streets, watch a real CCTV feed projected onto the 3D building it's mounted on, observe earthquake ripples.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F5.1 | OSM Road Network | Fetch street geometry for current view | P0 |
| F5.2 | Traffic Particles | Animated dots flowing along roads | P0 |
| F5.3 | Traffic Direction | Particles respect one-way streets | P1 |
| F5.4 | Traffic Density | Vary particle count by road class | P1 |
| F5.5 | CCTV Feed List | Catalog of Austin traffic cameras | P0 |
| F5.6 | Feed Thumbnail | Live preview in left panel | P0 |
| F5.7 | Feed Projection | Project selected feed onto 3D geometry | P0 |
| F5.8 | Multi-Feed Display | Show multiple feeds simultaneously | P2 |
| F5.9 | USGS Earthquake Data | Fetch recent seismic events | P1 |
| F5.10 | Earthquake Visualization | Concentric rings at epicenter | P1 |
| F5.11 | Magnitude Scaling | Ring size/color by magnitude | P1 |
| F5.12 | Event Timeline | Show when earthquakes occurred | P2 |

#### Traffic Particle System

**Technical Approach:**
```
1. Fetch OSM road geometry for current bounding box
2. Convert roads to line segments
3. Create WebGL particle buffer
4. Each particle has: position, velocity, road segment reference
5. Update loop: advance particles along segments
6. At intersections: randomly choose next segment
7. Render as small dots with slight glow
8. Color by road type (highway = faster/brighter)
```

**Road Classifications:**
| OSM Highway Tag | Particle Speed | Particle Density |
|-----------------|----------------|------------------|
| motorway | Fast | High |
| primary | Medium-fast | Medium-high |
| secondary | Medium | Medium |
| tertiary | Medium-slow | Medium-low |
| residential | Slow | Low |

#### CCTV Integration

**Austin Traffic Cameras:**
- Source: Austin Transportation Department open data
- Format: MJPEG streams (most common)
- Count: ~200 cameras
- Coordinates: Provided in feed metadata

**Projection Approach:**
1. Load camera feed as video texture
2. Place textured quad at camera's GPS coordinates
3. Orient quad toward road/intersection
4. Scale based on camera zoom level
5. Add subtle glow/frame to indicate live feed

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | Traffic particles animate along Austin streets |
| AC2 | Particles flow in correct direction on one-way streets |
| AC3 | CCTV feed thumbnails display in left panel |
| AC4 | Clicking CCTV feed projects it onto 3D scene |
| AC5 | Multiple feeds can display simultaneously |
| AC6 | Earthquake events render at correct locations |
| AC7 | Earthquake magnitude affects visualization size |
| AC8 | Ground layer doesn't significantly impact performance |

---

### Milestone 6: Timeline Playback

**Goal:** Record and replay OSINT snapshots — capture the state of all data layers at points in time and play them back.

**Output:** Scrub through time to see how the scene evolved, replay significant events, export shareable timelines.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F6.1 | Snapshot Capture | Record all layer states at timestamp | P0 |
| F6.2 | Snapshot Storage | Local storage or IndexedDB persistence | P0 |
| F6.3 | Timeline Scrubber | Visual timeline with snapshot markers | P0 |
| F6.4 | Playback Controls | Play, pause, speed control | P0 |
| F6.5 | Layer Interpolation | Smooth animation between snapshots | P1 |
| F6.6 | Event Markers | Notable events flagged on timeline | P1 |
| F6.7 | Bookmarks | Save named points in timeline | P1 |
| F6.8 | Export | Generate shareable timeline file | P2 |
| F6.9 | Import | Load external timeline file | P2 |
| F6.10 | Live Mode Toggle | Switch between live and playback | P0 |

#### Snapshot Data Structure

```typescript
interface Snapshot {
  timestamp: number;           // Unix timestamp
  camera: CameraState;         // Position, orientation, zoom
  satellites: SatelliteState[]; // Positions at timestamp
  flights: FlightState[];      // Aircraft positions
  cctv: CCTVState[];           // Active feeds
  markers: MarkerState[];      // User annotations
}

interface Timeline {
  id: string;
  name: string;
  created: number;
  snapshots: Snapshot[];
  events: TimelineEvent[];
}
```

#### Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | Recording captures all visible data layer states |
| AC2 | Timeline displays with scrubber interface |
| AC3 | Playback animates through recorded snapshots |
| AC4 | Speed controls work (0.5x, 1x, 2x, 4x) |
| AC5 | Clicking timeline jumps to that point |
| AC6 | Event markers are visible and clickable |
| AC7 | Live mode toggle returns to real-time data |
| AC8 | Snapshots persist across page reloads |

---

## Future Considerations

The following features are out of scope for the initial roadmap but represent potential future directions:

### AI Query Layer

Natural language queries against the spatial data:

- "Show me all flights that passed over this location in the last hour"
- "Find the nearest satellite that will pass overhead"
- "Highlight military aircraft within 100 miles"
- "What changed in this area since yesterday?"

### Detection Overlays

Computer vision applied to CCTV feeds and satellite imagery:

- Vehicle detection and counting
- Person tracking (anonymized)
- Change detection between imagery dates
- Anomaly highlighting

### Multi-Source Fusion

Cross-referencing data sources:

- Correlate flight paths with satellite passes
- Match vehicle movements across CCTV feeds
- Combine weather data with flight tracking
- Integrate social media geolocation

### Extended City Coverage

Expand beyond Austin for CCTV and detailed ground layers:

- San Francisco traffic cameras
- NYC traffic cameras
- London traffic cameras
- Generic OSM traffic for all cities

### SpatialOS Integration

The full thesis — a continuously updating model of the physical world:

- Real-time change detection
- Predictive modeling
- AI agents querying spatial state
- Multi-user collaboration

---

## API Key Requirements

### Required Keys

| Service | Key Type | Cost | Limit |
|---------|----------|------|-------|
| Google Maps Tile API | API Key | Pay-per-use | Varies |
| ADS-B Exchange | RapidAPI Key | Free tier available | Rate limited |

### Optional Keys

| Service | Key Type | Benefit |
|---------|----------|---------|
| OpenSky Network | Registered account | Higher rate limits |
| Mapbox | API Key | Alternative 2D base map |

### API Key Setup

1. **Google Maps Tile API:**
   - Create project at console.cloud.google.com
   - Enable Map Tiles API
   - Create API key, restrict to Map Tiles API
   - Add to `.env`: `GOOGLE_MAPS_TILE_API_KEY=...`

2. **ADS-B Exchange (optional):**
   - Sign up at rapidapi.com
   - Subscribe to ADS-B Exchange API
   - Add to `.env`: `ADSB_EXCHANGE_API_KEY=...`

---

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | Full support |
| Firefox | 88+ | Full support |
| Safari | 14+ | Partial (WebGL2 required) |
| Edge | 90+ | Full support |

**Requirements:**
- WebGL 2.0 support
- ES2020 JavaScript
- 4GB+ RAM recommended
- Dedicated GPU recommended

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial Load | < 5s | First meaningful paint |
| Frame Rate | 30+ FPS | During normal navigation |
| Tile Loading | < 2s | Time to render new tiles on pan |
| Data Refresh | < 1s | Flight/satellite position update |
| Memory Usage | < 2GB | Peak during heavy use |

---

## Security Considerations

### API Key Protection

All API keys are server-side only:
- Google Maps Tile API key proxied through localhost:3001
- Keys stored in `.env`, never committed to git
- Frontend code has no direct access to keys

### Data Privacy

- No user data collection
- No authentication required
- All data sources are public
- CCTV feeds are publicly accessible city cameras

### Content Security

- No ability to control any remote systems
- View-only access to all data sources
- Classification markings are purely aesthetic
- No actual classified information

---

## References

### Primary Sources

1. [Bilawal Sidhu — I Built a Spy Satellite Simulator](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator) — Original project inspiration and technical approach
2. [YouTube Walkthrough — Original Build](https://www.youtube.com/watch?v=rXvU7bPJ8n4) — Video demonstration of features
3. [YouTube — Operation Epic Fury Reconstruction](https://www.youtube.com/watch?v=0p8o7AeHDzg) — Advanced usage demonstration

### Technical Documentation

4. [Google Maps Tile API](https://developers.google.com/maps/documentation/tile) — 3D Tiles integration
5. [CesiumJS Documentation](https://cesium.com/learn/cesiumjs/ref-doc/) — 3D globe rendering
6. [CelesTrak](https://celestrak.org/) — Satellite TLE data
7. [OpenSky Network API](https://opensky-network.org/apidoc/) — Flight tracking
8. [ADS-B Exchange API](https://www.adsbexchange.com/data/) — Unfiltered flight data
9. [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — OSM data queries
10. [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/) — Seismic data

### Design References

11. [Military Display Specifications](https://en.wikipedia.org/wiki/FLIR) — FLIR/NVG visual reference
12. [Palantir Gotham](https://www.palantir.com/platforms/gotham/) — Intelligence platform reference

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-07 | Initial PRD draft |

---

## Appendix A: POI Coordinates

Detailed coordinates for all 32 POIs (8 cities × 4 POIs each):

### Austin, TX

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Texas State Capitol | 30.2747 | -97.7404 | 500m | 0° |
| Congress Ave Bridge | 30.2614 | -97.7453 | 400m | 180° |
| UT Tower | 30.2862 | -97.7394 | 500m | 90° |
| Sixth Street | 30.2672 | -97.7431 | 400m | 270° |

### San Francisco, CA

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Golden Gate Bridge | 37.8199 | -122.4783 | 800m | 0° |
| Salesforce Tower | 37.7898 | -122.3969 | 600m | 45° |
| Alcatraz | 37.8267 | -122.4230 | 500m | 180° |
| Bay Bridge | 37.7983 | -122.3778 | 600m | 90° |

### New York, NY

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Empire State Building | 40.7484 | -73.9857 | 800m | 0° |
| Brooklyn Bridge | 40.7061 | -73.9969 | 500m | 135° |
| Statue of Liberty | 40.6892 | -74.0445 | 600m | 0° |
| One WTC | 40.7127 | -74.0134 | 800m | 45° |

### Tokyo, Japan

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Tokyo Tower | 35.6586 | 139.7454 | 600m | 0° |
| Shibuya Crossing | 35.6595 | 139.7004 | 400m | 180° |
| Senso-ji | 35.7148 | 139.7967 | 500m | 90° |
| Tokyo Skytree | 35.7101 | 139.8107 | 800m | 270° |

### London, UK

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Tower Bridge | 51.5055 | -0.0754 | 500m | 90° |
| Big Ben | 51.5007 | -0.1246 | 500m | 0° |
| Buckingham Palace | 51.5014 | -0.1419 | 500m | 180° |
| The Shard | 51.5045 | -0.0865 | 600m | 45° |

### Paris, France

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Eiffel Tower | 48.8584 | 2.2945 | 600m | 0° |
| Arc de Triomphe | 48.8738 | 2.2950 | 500m | 180° |
| Notre-Dame | 48.8530 | 2.3499 | 500m | 90° |
| Louvre | 48.8606 | 2.3376 | 500m | 270° |

### Dubai, UAE

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| Burj Khalifa | 25.1972 | 55.2744 | 1200m | 0° |
| Palm Jumeirah | 25.1124 | 55.1390 | 2000m | 180° |
| Dubai Frame | 25.2350 | 55.3004 | 600m | 45° |
| Burj Al Arab | 25.1412 | 55.1854 | 600m | 270° |

### Washington, DC

| POI | Latitude | Longitude | Altitude | Heading |
|-----|----------|-----------|----------|---------|
| US Capitol | 38.8899 | -77.0091 | 600m | 270° |
| Washington Monument | 38.8895 | -77.0353 | 600m | 0° |
| Pentagon | 38.8719 | -77.0563 | 800m | 45° |
| Lincoln Memorial | 38.8893 | -77.0502 | 500m | 90° |

---

## Appendix B: Telemetry Calculations

### Ground Sample Distance (GSD)

The theoretical resolution of imagery at current altitude:

```typescript
function calculateGSD(altitudeMeters: number): number {
  // Assuming 1m GSD at 1000m altitude (simplified)
  const gsd = altitudeMeters / 1000;
  return Math.round(gsd * 100) / 100; // Round to 2 decimal places
}
```

Display format: `GSD: 0.5m` or `GSD: 2.3m`

### National Imagery Interpretability Rating Scale (NIIRS)

Fake calculation based on altitude (real NIIRS is far more complex):

```typescript
function calculateNIIRS(altitudeMeters: number): number {
  // NIIRS 9 at ~100m, NIIRS 1 at ~100km (logarithmic)
  const niirs = 9 - Math.log10(altitudeMeters / 100) * 2.5;
  return Math.max(1, Math.min(9, Math.round(niirs * 10) / 10));
}
```

Display format: `NIIRS: 7.2` or `NIIRS: 4.5`

### Altitude (ALT)

Direct from camera position:

```typescript
function getAltitude(viewer: Cesium.Viewer): number {
  const cartographic = viewer.camera.positionCartographic;
  return Math.round(cartographic.height);
}
```

Display format: `ALT: 12345m` or `ALT: 1.2km`

### Sub-satellite Point Elevation (SUB)

Camera pitch angle:

```typescript
function getSubElevation(viewer: Cesium.Viewer): number {
  const pitch = Cesium.Math.toDegrees(viewer.camera.pitch);
  return Math.round(Math.abs(pitch) * 10) / 10;
}
```

Display format: `SUB: 45.0° EL`
