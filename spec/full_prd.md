# WorldView — Full Product Requirements Document

**Project:** WorldView (Browser-Based Spy Satellite Simulator)  
**Version:** 2.0  
**Status:** Milestones 1–5 Complete · Milestone 6 Pending  
**Date:** 2026-05-01

---

## Executive Summary

WorldView is a browser-based geospatial intelligence visualization tool that recreates the aesthetic and functionality of classified surveillance systems using entirely public data sources. The project demonstrates "spatial intelligence" — AI that understands the physical world the way language models understand text.

WorldView combines Google Photorealistic 3D Tiles, real-time satellite tracking, live flight data, ship tracking, street traffic visualization, and actual CCTV feeds into a single interface styled as a classified intelligence terminal. The result is a panoptic view of the physical world accessible to anyone with a browser.

> "You can see everything." — The thesis made visible.

---

## Background & Motivation

### Origin

Inspired by [Bilawal Sidhu's WorldView project](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator), which demonstrated that a single developer using AI coding assistants could build in three days what previously required months of specialized geospatial engineering. Bilawal — formerly the Google PM who helped build and launch the Photorealistic 3D Tiles platform — used a swarm of 4–8 AI agents in parallel (Gemini 3.1, Claude 4.6, Codex 5.3) to build the prototype, each agent owning a subsystem (shaders, satellite tracker, CCTV pipeline, traffic particles).

The project gained further momentum after Bilawal's [Operation Epic Fury reconstruction](https://www.spatialintelligence.ai/p/the-intelligence-monopoly-is-over) — a full 4D OSINT replay of the Iran strikes built from public ADS-B, satellite orbital data, GPS jamming inference, maritime AIS, and no-fly zone closures. That reconstruction validated the data fusion approach and demonstrated the **playback mode** (timeline scrubber + time-lapse) that this project tracks as Milestone 6.

### Relationship to the Upstream Project

This repository is an open re-implementation of Bilawal's WorldView, built independently from the same public data sources. The upstream project itself is closed-source (slated for public launch April 2026). What's documented in **Bilawal's WorldView (Upstream Reference)** below is what's been publicly demonstrated in his articles and walkthrough videos — the canonical feature set this PRD is aligned against.

> "If American analysts were doing some of these things, we would classify that as secret or perhaps even top secret. But this stuff is just out there on the open internet." — Maj. Claire Randolph, AFCENT

### The Spatial Intelligence Thesis

We're building AI that understands the physical world the way it understands text. Not images — **space**. Not object recognition — **spatial relationships, change over time, movement through a scene**. The difference between "a car" and "that car, at that intersection, at that speed, at that hour."

WorldView is the visualization layer for this thesis. It has the view, the data fusion, and the interface that makes you feel what becomes possible when the physical world becomes queryable and programmable.

### Surveillance vs. Sousveillance

The project explores the concept of "the two viellances":
- **Surveillance**: The state watching you
- **Sousveillance**: You watching back

WorldView is sousveillance aesthetics — the same data streams, satellite feeds, and CCTV cameras that intelligence agencies use, but accessible in a browser tab that anyone controls.

---

---

## Bilawal's WorldView (Upstream Reference)

This section documents the canonical feature set of Bilawal's WorldView as demonstrated publicly. It serves as the alignment target for this implementation.

### Demonstrated in the original walkthrough (Feb 2026, 672K views)

| Feature | Upstream | This repo |
|---------|----------|-----------|
| Google Photorealistic 3D Tiles foundation | Yes | Implemented |
| Mode switcher: CRT / NVG / FLIR / Anime, keyed `1`/`2`/`3`/… | Yes | Implemented (AH64 substituted for Anime) |
| Sensitivity / pixelation parameter sliders | Yes | Implemented |
| City + landmark camera presets (`Q`/`W`/`E`/`R`/`T`) | Yes | Implemented (8 cities × 4 POIs) |
| POI framing using OSM 3D volume (perfectly centers landmark, not naive lat/lon) | Yes | Partial — POIs use lat/lon + altitude only |
| Live satellite tracking via TLEs ("every satellite in orbit") | Yes | 5 categories via CelesTrak |
| **Detection Mode** — sparse vs full label set toggle | Yes | Not implemented |
| Click satellite → display NORAD ID, follow orbital path | Yes | Implemented |
| Click satellite → look up description (e.g. "Persona 3 is a class of Russian high-resolution military surveillance satellites") | Yes | Not implemented |
| Real-time flights — 6,700+ planes via OpenSky | Yes | Viewport-bounded |
| Military flights via ADS-B Exchange (orange icons, filterable) | Yes | Not implemented (RapidAPI key required) |
| Filter by category (e.g. military-only) | Yes | Partial (satellite categories only) |
| Street traffic simulation (OSM particle system) | Yes | Implemented |
| **Sequential road loading** for performance (main roads first, then arterial) | Yes | Not implemented |
| Real-time CCTV feeds from Austin, projected onto 3D geometry | Yes | Partial — CCTV billboards + video panel; geometry projection not implemented |
| **CCTV calibration system** — drop reference points, connect to align/drape feed | Mentioned as in-progress | Stubbed in UI as `AUTO CAL` / `ALIGN-DRAPE` (not wired up) |
| Earthquake & seismic data (USGS) | Yes | Implemented |
| Camera-position presets for content creation ("plan out your shot") | Yes | Implemented (POI navigation) |

### Demonstrated in Operation Epic Fury (Mar 2026, 1.9M views)

| Feature | Upstream | This repo |
|---------|----------|-----------|
| **Playback mode** — timeline scrubber across the bottom of the viewport | Yes | Milestone 6 (pending) |
| **Time-lapse playback** at adjustable speed (e.g. 15 min/sec) | Yes | Pending (M6) |
| GPS jamming visualization (red tiles, derived from ADS-B confidence) | Yes | Not implemented |
| Maritime AIS (ships at Strait of Hormuz, attacked tanker visible) | Yes | Implemented (M4B AISStream) |
| Named commercial recon satellite passes — Maxar / WorldView Legion, Pléiades Neo, Capella SAR, SPOT | Yes | Tracked under generic Research category |
| Named military recon satellites — Persona 3, USA-234 Topaz, Gaofen 11/12, BARS-M | Yes | Tracked under generic Military category |
| Cross-satellite "line connect" when passing over an Area of Interest | Yes | Not implemented |
| Cascading airspace closure visualization (no-fly zones spreading: Iran → Iraq → Kuwait → Bahrain → Qatar) | Yes | Not implemented |
| Strike event markers on timeline | Yes | Not implemented (M6) |
| Internet blackout monitoring (Tehran going dark) | Yes | Not implemented |
| AI agent recording — snapshot all feeds before caches clear | Yes | Not implemented |
| Holding-pattern detection (planes circling near closed airspace) | Yes | Not implemented |

### Build Methodology (Bilawal's Approach)

- **3-day build** with **4–8 parallel AI agents**, each owning a subsystem (one for shaders, one for data integration, one for particle systems, etc.)
- Voice notes + screenshots as input — no Cursor/IDE; agents run directly in terminal windows
- AI models used: Gemini 3.1, Claude 4.6, Codex 5.3
- Performance was hand-tuned via dialogue with the agents (e.g. "do sequential loading: main roads first, then arterials" to avoid particle-spawn browser crashes)

### Positioning

- **Joe Lonsdale (Palantir co-founder)** publicly responded that WorldView is "missing real proprietary data fusion." Bilawal's framing in response: what's new isn't the capability, it's the **accessibility** — the visual language of classified intelligence systems running in any browser tab.
- **Sousveillance aesthetics** — same data streams, same satellite feeds, same CCTV cameras as institutional surveillance, but the interface is in your browser and you control it.
- **"WorldView is a demo. SpatialOS is the actual project."** — The full thesis is a continuously-updating model of the physical world that AI agents can query in real time. WorldView is the visualization layer.

---

## Goals

### Primary Goals

1. **Demonstrate spatial data fusion** — Combine multiple real-time data sources (satellites, flights, ships, traffic, CCTV) into a unified 3D view
2. **Recreate classified terminal aesthetics** — Military-grade visual language (CRT, NVG, FLIR, AH-64 HUD) running on public data
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
| Frontend Framework | SolidJS 1.9 | Fine-grained reactivity, minimal overhead, no vDOM |
| 3D Renderer | CesiumJS 1.139 | Native 3D Tiles support, camera math, well-documented |
| 3D Tiles | Google Maps Tile API | Photorealistic global coverage |
| Satellite Mechanics | satellite.js v6 | SGP4/SDP4 orbital propagation |
| HLS Video | hls.js v1.6 | CCTV stream playback (CORS-safe via server relay) |
| Language | TypeScript 5 | Strict mode, ESNext, bundler resolution |
| Styling | Vanilla CSS | Custom terminal aesthetic, no framework overhead |
| Build | Bun bundler + bun-plugin-solid | Native, fast, handles CesiumJS assets |
| Task Runner | mise | Parallel server startup (`mise run start`) |

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser Client                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  SolidJS UI │  │   Shaders   │  │  Data Layers│  │   Globe     │ │
│  │  (Panels)   │  │ (WebGL/CSS) │  │  (Realtime) │  │ (CesiumJS)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Tile Proxy│   │ Data APIs │   │  CCTV     │
            │ :3001     │   │ (Proxied) │   │  Relay    │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Google   │   │ OpenSky   │   │  Austin   │
            │ Maps Tile │   │ CelesTrak │   │ Caltrans  │
            │   API     │   │ AISStream │   │ NY511     │
            └───────────┘   │ Overpass  │   │ Arkansas  │
                            │   USGS    │   └───────────┘
                            └───────────┘
```

### Key Architectural Decisions

- **No default globe/terrain** — `scene.globe.show = false`; all visuals from Google 3D Tiles
- **No HeightReference.CLAMP_TO_GROUND** — `scene.sampleHeight()` used for surface positioning
- **BillboardCollection over Entity API** — 1 draw call vs. 200+ for large entity counts
- **Shared `config.ts`** — all proxy endpoints centralized (`PROXY_ENDPOINTS`)
- **SolidJS reactive stores** — 5 stores drive UI + Cesium state (layers, selection, camera, ui, shaders)
- **Request coalescing** — multiple simultaneous requests for same URL share one upstream fetch
- **Dead-reckoning interpolation** — smooth motion between update ticks for planes and ships

### Reactive State Flow

```
User Action (click / command / hotkey)
  → Store update (setLayers, selectEntity, setFollowTarget…)
  → SolidJS createEffect re-runs (layer visibility, info panel, camera binding)
  → Cesium primitives update (billboards, polylines, camera position)
```

---

## Data Sources

### Google Photorealistic 3D Tiles

**Source:** Google Maps Tile API  
**Used For:** Global 3D terrain and building models — the entire visible world

- Endpoint: `https://tile.googleapis.com/v1/3dtiles/root.json`
- Authentication: API key proxied through `localhost:3001`
- Format: 3D Tiles 1.0 (glTF + Draco compression)
- Required env var: `GOOGLE_MAPS_TILE_API_KEY`

### CelesTrak TLE Data

**Source:** CelesTrak (celestrak.org)  
**Used For:** Real-time satellite orbital positions via SGP4 propagation

Five tracked categories:
| Category | CelesTrak group | Color |
|----------|----------------|-------|
| Space Stations | `stations` | White |
| Military | `military` | Red |
| GNSS (GPS/GLONASS/etc.) | `gnss` | Yellow |
| Research | various | Cyan |
| Starlink | `starlink` | Purple |

- Endpoint: `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=tle`
- Server-side TTL cache: 5 minutes
- Propagation: SGP4 every 2.5s client-side; 24-hour orbital paths at 2-minute intervals

### OpenSky Network

**Source:** OpenSky Network (opensky-network.org)  
**Used For:** Real-time commercial flight tracking

- Endpoint: `https://opensky-network.org/api/states/getBounds`
- Update frequency: ~5 seconds (doubles to 15s on rate limit, auto-recovers after 60s)
- Authentication: Anonymous (free tier)
- Viewport-filtered: only planes within camera bounding box
- Max visible: 100 planes per view

### AISStream

**Source:** AISStream (aisstream.io)  
**Used For:** Real-time ship tracking via AIS beacons

- Connection: WebSocket `wss://stream.aisstream.io/v0/stream` maintained server-side
- HTTP poll endpoint exposed at `localhost:3001` (ships layer fetches buffered data)
- Update interval: ~8 seconds
- Ship types distinguished: cargo (blue), tanker (red), passenger (green), fishing (orange)
- Required env var: `AISSTREAM_API_KEY` (layer disabled if absent)

### OpenStreetMap Overpass API

**Source:** OpenStreetMap via Overpass  
**Used For:** Road network geometry for traffic particle simulation

- Endpoint: `https://overpass-api.de/api/interpreter`
- Fetches highways within current viewport bounding box
- Aggressively cached (road networks rarely change)

### CCTV Sources (4 agencies)

**Used For:** Live traffic camera feeds projected onto the 3D globe

| Agency | Source | Coverage |
|--------|--------|----------|
| Austin Transportation Dept. | `data.austintexas.gov` | Austin metro (~200 cameras) |
| Caltrans | `cwwp2.dot.ca.gov` (12 districts) | All of California |
| NY511 / NY DOT | NY DOT feed | New York State |
| Arkansas DOT | Arkansas traffic feed | Arkansas highways |

- Server-side HLS relay bypasses CORS for token-gated streams
- Thumbnail cache: 5-minute TTL
- Fallback: static image if HLS unavailable

### USGS Earthquake API

**Source:** USGS Earthquake Hazards Program  
**Used For:** Seismic activity overlay

- Endpoint: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- Update frequency: 60 seconds
- Filtered to earthquakes within 500km of viewport center
- Visualization: expanding concentric rings at epicenter, scaled by magnitude

---

## Milestone Breakdown

### Milestone 1: Globe Foundation ✅ Complete

**Goal:** Navigable 3D globe, UI chrome, city/POI fly-to navigation, terminal aesthetic.

#### Features — Status

| ID | Feature | Status |
|----|---------|--------|
| F1.1 | Project Scaffold — Bun + TypeScript + SolidJS + CesiumJS | ✅ |
| F1.2 | Tile Proxy Server — Bun HTTP server on :3001 | ✅ |
| F1.3 | 3D Globe Render — Google Photorealistic 3D Tiles | ✅ |
| F1.4 | Default Camera — Full globe view | ✅ |
| F1.5 | Camera Controls — Mouse orbit/zoom/pan | ✅ |
| F1.6 | City POI System — 8 cities × 4 POIs with coordinates | ✅ |
| F1.7 | Fly-To Animation — 2-second smooth camera flight | ✅ |
| F1.8 | Keyboard Navigation — Q/W/E/R/T for POIs 1–5 | ✅ |
| F1.9 | UI Shell Layout — Black bg, cyan text, monospace | ✅ |
| F1.10 | Top Bar — WORLDVIEW wordmark, UTC clock, REC badge | ✅ |
| F1.11 | Classification Watermark — "TOP SECRET // SI-TK // NOFORN" | ✅ |
| F1.12 | Circular Vignette — CSS radial-gradient lens effect | ✅ |
| F1.13 | Left Panel — City selector, POI nav, layer toggles, system log | ✅ |
| F1.14 | Right Panel — Shader controls + live telemetry readouts | ✅ |
| F1.15 | Bottom Bar — Mode buttons + city tabs | ✅ |
| F1.16 | Command Bar — Vim-style `:` command interface | ✅ (added beyond spec) |
| F1.17 | My Location — Geolocation on startup, flies to user | ✅ (added beyond spec) |
| F1.18 | FPS Counter — Toggle with `F` key, color-coded thresholds | ✅ (added beyond spec) |

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

#### Command Bar

The command bar (press `:`) provides a vim-style command interface:

| Command | Action |
|---------|--------|
| `:goto <city>` | Fly to named city |
| `:goto <lat,lon>` | Fly to coordinates |
| `:goto <IATA>` | Fly to airport by code |
| `:follow <name>` | Lock camera on satellite/flight |
| `:home` | Return to default globe view |
| `:help` | Show command reference |

Geocoding pipeline: coordinates → airport codes → Google Geocode API (10-minute cache).

#### UI Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Background | `#000000` | Primary background |
| Primary Cyan | `#00f0ff` | Labels, active elements, highlights |
| Secondary Teal | `#4a9e8a` | Readouts, secondary text |
| Highlight Green | `#00ff88` | Enabled toggles, success states |
| Dim Gray | `#333333` | Disabled elements, borders |
| Warning Amber | `#ffaa00` | Warnings, attention items |

---

### Milestone 2: Shader Pipeline ✅ Complete

**Goal:** Post-processing visual effects that transform the view between military display modes.

#### Features — Status

| ID | Feature | Status |
|----|---------|--------|
| F2.1 | Shader Manager — reactive switching + crossfade transitions | ✅ |
| F2.2 | Normal Mode — clean pass-through | ✅ |
| F2.3 | CRT Mode — scanlines, phosphor glow, barrel distortion | ✅ |
| F2.4 | NVG Mode — green phosphor tint, intensifier noise, bloom | ✅ |
| F2.5 | FLIR Mode — thermal false-color palette, edge enhancement | ✅ |
| F2.6 | AH64 Mode — Apache helicopter HUD aesthetic | ✅ (replaces ANIME/NAVI from spec) |
| F2.7 | Transition Effects — 300ms crossfade between modes | ✅ |
| F2.8 | Parameter Sliders — PIXELATION, DISTORTION, INSTABILITY (functional) | ✅ |
| F2.9 | Intensity Master Slider — scales all shader params together | ✅ |
| F2.10 | Keyboard Shortcuts — `1 2 3 4 5` to switch modes | ✅ |

> **Note:** ANIME (cel-shading) and NAVI modes were dropped in favor of the AH64 Apache HUD shader, which better fits the classified-terminal aesthetic.

#### Shader Modes Summary

| Mode | Key | Effect |
|------|-----|--------|
| Normal | `1` | No post-processing |
| CRT | `2` | Scanlines, barrel distortion, phosphor glow, flicker |
| NVG | `3` | Green monochrome, intensifier noise, bloom |
| FLIR | `4` | Luminance → thermal palette, edge enhancement |
| AH64 | `5` | Apache helicopter HUD: green raster, tactical overlays |

---

### Milestone 3: Satellite Layer ✅ Complete

**Goal:** Real-time satellite tracking using CelesTrak TLE data with orbital paths and click-to-track.

#### Features — Status

| ID | Feature | Status |
|----|---------|--------|
| F3.1 | TLE Data Fetching — CelesTrak proxy with 5-min cache | ✅ |
| F3.2 | SGP4 Propagation — real-time position calculation | ✅ |
| F3.3 | Satellite Rendering — billboard markers with velocity color-coding | ✅ |
| F3.4 | Orbital Path Display — 24-hour trajectory at 2-min intervals | ✅ |
| F3.5 | Click-to-Select — highlights satellite, shows info panel | ✅ |
| F3.6 | Follow Mode — camera tracks selected satellite at 2.5M-meter range | ✅ |
| F3.7 | Info Panel — NORAD ID, name, altitude, velocity, TLE lines, category | ✅ |
| F3.8 | Constellation Filtering — per-category toggles in left panel | ✅ |
| F3.9 | Ground Track | ❌ Not implemented |
| F3.10 | Pass Prediction | ❌ Not implemented |

#### Satellite Categories (actual implementation)

| Category | Source group | Color |
|----------|-------------|-------|
| Space Stations | `stations` | White |
| Military | `military` | Red |
| GNSS | `gnss` | Yellow |
| Research | various groups | Cyan |
| Starlink | `starlink` | Purple |

> **Note:** Original PRD listed GPS Operational, Weather, and Starlink as separate categories. Implemented as: Stations, Military, GNSS, Research, Starlink — better aligned with CelesTrak's actual groupings.

---

### Milestone 4: Flight Layer ✅ Complete

**Goal:** Real-time aircraft tracking with metadata, trails, and follow mode.

#### Features — Status

| ID | Feature | Status |
|----|---------|--------|
| F4.1 | OpenSky Integration — viewport-bounded state vectors | ✅ |
| F4.2 | ADS-B Exchange Integration | ❌ Replaced by OpenSky (no RapidAPI key required) |
| F4.3 | Aircraft Rendering — billboard icons with heading orientation | ✅ |
| F4.4 | Flight Info Panel — callsign, airline, aircraft type, altitude, speed, heading | ✅ |
| F4.5 | Click-to-Select — highlight and show info | ✅ |
| F4.6 | Trail Rendering — up to 50 history points per aircraft | ✅ |
| F4.7 | Follow Mode — camera 10km behind at -30° pitch | ✅ |
| F4.8 | Altitude Color Coding — green/yellow/orange/cyan bands | ✅ |
| F4.9 | Rate Limit Handling — doubles interval on 429, auto-recovers after 60s | ✅ (beyond spec) |
| F4.10 | Dead-Reckoning Interpolation — smooth movement between polls | ✅ (beyond spec) |
| F4.11 | Callsign Search — `:follow <callsign>` via command bar | ✅ (beyond spec) |
| F4.12 | Military Highlighting | ❌ Not implemented (ADS-B Exchange not used) |
| F4.13 | Approach Visualization | ❌ Not implemented |

#### Altitude Color Bands

| Altitude | Color | Label |
|----------|-------|-------|
| < 10,000 ft | Green | Low |
| 10,000–25,000 ft | Yellow | Mid |
| 25,000–35,000 ft | Orange | High |
| ≥ 35,000 ft | Cyan | Cruise |

---

### Milestone 4B: Ship Layer ✅ Complete (not in original PRD)

**Goal:** Real-time maritime vessel tracking via AIS, matching the planes layer in fidelity.

This layer was not in the original PRD but was fully implemented alongside the flight layer.

#### Features

| ID | Feature | Status |
|----|---------|--------|
| F4B.1 | AISStream WebSocket — maintained server-side with buffered polling | ✅ |
| F4B.2 | Ship Rendering — billboard icons by vessel type | ✅ |
| F4B.3 | Ship Info Panel — MMSI, name, type, heading, speed, ETA, destination | ✅ |
| F4B.4 | Click-to-Select — highlight and show info | ✅ |
| F4B.5 | Trail Rendering — up to 60 history points per vessel | ✅ |
| F4B.6 | Follow Mode — camera 10km behind at -30° pitch | ✅ |
| F4B.7 | Vessel Type Styling — cargo (blue), tanker (red), passenger (green), fishing (orange) | ✅ |
| F4B.8 | Label Visibility — hidden beyond 150km altitude | ✅ |
| F4B.9 | Dead-Reckoning Interpolation | ✅ |

---

### Milestone 5: Ground Layer ✅ Complete

**Goal:** Street-level visualization with traffic particle systems, CCTV feed projection, and seismic activity overlays.

#### Features — Status

| ID | Feature | Status |
|----|---------|--------|
| F5.1 | OSM Road Network — Overpass API fetch for current viewport | ✅ |
| F5.2 | Traffic Particles — animated dots flowing along road geometries | ✅ |
| F5.3 | Traffic Direction — particles respect one-way streets | ✅ |
| F5.4 | Traffic Density — speed/density weighted by road class | ✅ |
| F5.5 | Traffic Style Toggle — heatmap (red→yellow→green) vs. terminal (green) | ✅ (beyond spec) |
| F5.6 | CCTV Feed List — searchable camera list with thumbnails | ✅ |
| F5.7 | CCTV Feed Player — HLS stream + static image fallback | ✅ |
| F5.8 | CCTV Billboards — camera markers on 3D globe | ✅ |
| F5.9 | Center Stage Mode — fly map to selected camera location | ✅ (beyond spec) |
| F5.10 | Multi-Source CCTV — Austin, Caltrans (12 districts), NY511, Arkansas | ✅ (beyond spec) |
| F5.11 | Server HLS Relay — CORS bypass for token-gated streams | ✅ (beyond spec) |
| F5.12 | USGS Earthquake Data — 60s poll, 500km viewport filter | ✅ |
| F5.13 | Earthquake Visualization — expanding concentric rings | ✅ |
| F5.14 | Magnitude Scaling — ring size + color by magnitude | ✅ |
| F5.15 | Feed Projection onto 3D geometry | ❌ Not implemented |
| F5.16 | Multi-Feed Display simultaneously | ❌ Not implemented |

#### Traffic Particle System

**Road Speed/Density by Classification:**

| OSM Highway Tag | Particle Speed | Particle Density |
|-----------------|----------------|------------------|
| motorway | Fast (1.0) | High |
| primary | Medium-fast | Medium-high |
| secondary | Medium | Medium |
| tertiary | Medium-slow | Medium-low |
| residential | Slow (0.2) | Low |

**Display modes:**
- **Heatmap**: Red → yellow → green color gradient by speed
- **Terminal**: Monochrome green, consistent with NVG/CRT aesthetics

#### CCTV Sources (implemented)

| Source | Agency | Scale |
|--------|--------|-------|
| Austin Open Data | Austin Transportation Dept. | ~200 cameras |
| Caltrans CWWP2 | California DOT | 12 districts, hundreds of cameras |
| NY511 | New York DOT | New York State |
| Arkansas DOT | Arkansas DOT | Arkansas highways |

> **Note:** Original PRD specified Austin only. Coverage was substantially expanded during implementation.

---

### Milestone 6: Timeline Playback ⏳ Not Started

**Goal:** Record and replay OSINT snapshots — capture the state of all data layers at points in time and play them back.

This milestone is fully specified but not yet implemented. It represents the highest-value remaining feature — the ability to reconstruct events like Operation Epic Fury directly in WorldView.

#### Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F6.1 | Snapshot Capture | Record all layer states at timestamp | P0 |
| F6.2 | Snapshot Storage | IndexedDB persistence | P0 |
| F6.3 | Timeline Scrubber | Visual timeline with snapshot markers | P0 |
| F6.4 | Playback Controls | Play, pause, speed control (0.5×, 1×, 2×, 4×) | P0 |
| F6.5 | Layer Interpolation | Smooth animation between snapshots | P1 |
| F6.6 | Event Markers | Notable events flagged on timeline | P1 |
| F6.7 | Bookmarks | Save named points in timeline | P1 |
| F6.8 | Live Mode Toggle | Switch between live data and playback | P0 |
| F6.9 | Export | Generate shareable timeline file | P2 |
| F6.10 | Import | Load external timeline file | P2 |

#### Snapshot Data Structure

```typescript
interface Snapshot {
  timestamp: number;           // Unix timestamp
  camera: CameraState;         // Position, orientation, zoom
  satellites: SatelliteState[]; // Positions at timestamp
  flights: FlightState[];      // Aircraft positions
  ships: ShipState[];          // Vessel positions
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
| AC4 | Speed controls work (0.5×, 1×, 2×, 4×) |
| AC5 | Clicking timeline jumps to that point |
| AC6 | Event markers are visible and clickable |
| AC7 | Live mode toggle returns to real-time data |
| AC8 | Snapshots persist across page reloads |

---

## UI Component Reference

### Left Panel (`src/ui/LeftPanelComponent.tsx`)

| Component | Features |
|-----------|----------|
| City Selector | Dropdown — 8 cities |
| POI Navigation | PREV/NEXT buttons, current POI display |
| Layer Toggles | Satellites, Ships, Planes, Ground (master toggles) |
| Satellite Categories | Stations, Military, GNSS, Research, Starlink (visible when sats enabled) |
| Ground Sub-layers | Traffic (+ style toggle), CCTV, Seismic |
| Disabled Stubs | AUTO HOF SPY, PROJECTION, AUTO CAL, ALIGN-DRAPE |
| System Log | 20-entry ring buffer of user actions and system events |
| CCTV Camera List | Searchable list, thumbnails, "Center Stage" button |

### Right Panel (`src/ui/RightPanelComponent.tsx`)

| Component | Features |
|-----------|----------|
| Shader Mode Selector | Radio: Normal / CRT / NVG / FLIR / AH64 |
| Intensity Slider | Master scale (0–100) affecting all shader params |
| Effect Sliders | PIXELATION, DISTORTION, INSTABILITY (disabled when Normal) |
| Live Readouts | Lat, Lon, Alt, GSD, NIIRS, Pitch — synced to camera |
| Entity Info Panels | Conditional: satellite / ship / plane info on selection |

### Bottom Bar (`src/ui/BottomBarComponent.tsx`)

- Mode indicator: current shader name
- 8 city quick-jump tabs

### Command Bar (`src/ui/CommandBar.tsx`)

- Press `:` to activate
- Supports: `:goto`, `:follow`, `:home`, `:help`
- Error/success feedback inline
- ESC to dismiss

---

## Unimplemented UI Stubs

The following controls are visible in the UI but disabled. Most correspond to upstream features that are planned but not yet wired up:

| Control | Location | Notes |
|---------|----------|-------|
| AUTO HOF SPY | Left panel | No-op toggle (purpose unclear from upstream) |
| PROJECTION | Left panel | No-op selector — likely tied to CCTV projection mode |
| AUTO CAL | Left panel | Planned: CCTV calibration (auto-solve homography from feed → 3D geometry) |
| ALIGN - DRAPE | Left panel | Planned: manual reference-point alignment for CCTV draping |
| Orbit Camera Mode | Store defined | Not exposed in UI |
| Detection Mode (sparse / full) | Not present | Planned upstream feature — label density toggle |

---

## Future Considerations

### AI Query Layer

Natural language queries against the spatial data:

- "Show me all flights that passed over this location in the last hour"
- "Find the nearest satellite that will pass overhead in the next 30 minutes"
- "Highlight military aircraft within 100 miles"
- "What changed in this area since yesterday?"

### GPS Jamming Inference Layer

As demonstrated in the Operation Epic Fury reconstruction: aggregate GPS confidence degradation from commercial ADS-B transponders to infer active electronic warfare zones — no classified sensors required. Render as a heatmap of red tiles over affected geography. Pairs naturally with the existing flight layer.

### Named Reconnaissance Satellite Catalog

Upgrade the satellite layer to recognize specific high-value commercial and military recon birds, with descriptive metadata on click:

- **Commercial EO:** Maxar (WorldView Legion), Pléiades Neo, SPOT, Capella SAR
- **US military:** Persona 3, USA-234 (Topaz), KH-11 Keyhole
- **Russian:** BARS-M
- **Chinese:** Gaofen 11/12

When any of these passes over a selected AOI, draw a connecting line from the satellite to the ground footprint to make the surveillance pass legible ("line connect" feature in the upstream playback mode).

### Detection Mode (Label Density Toggle)

Upstream WorldView has a sparse / full toggle for label rendering across satellites and planes — sparse for clean visuals at globe scale, full for detailed analysis at city scale. Should be added as a global toggle in the left panel.

### CCTV Calibration / Drape System

The `AUTO CAL` and `ALIGN-DRAPE` buttons currently stubbed in the left panel correspond to a feature Bilawal demonstrated as in-progress: drop a few reference points in both the camera feed and the 3D model, solve the homography, and project the live feed onto the building geometry beneath it. This is what closes the gap between "CCTV billboard with a video player" and "CCTV draped onto the actual 3D building."

### Cascading Airspace Closure Visualization

Render no-fly zones as a polygon layer, color-coded by closure time, so the cascade across countries (e.g. Iran → Iraq → Kuwait → Bahrain → Qatar during Epic Fury) is visible on a timeline. Pair with holding-pattern detection (planes circling near closed airspace).

### Internet Blackout Monitoring

Integrate Cloudflare Radar / IODA outage feeds to overlay national or regional internet blackouts on the globe.

### Agent-Driven Snapshot Recording

As Bilawal did during the Iran strikes: a CLI/messaging-triggered agent that begins capturing every data feed before caches clear, producing a re-playable timeline. This is the bridge between Milestone 6 (timeline playback) and SpatialOS.

### Detection Overlays

Computer vision applied to CCTV feeds:

- Vehicle detection and counting
- Change detection between imagery dates
- Anomaly highlighting

### Multi-Source Fusion

Cross-referencing data sources:

- Correlate flight paths with satellite passes overhead
- Match vessel movements with maritime satellite imagery
- Integrate weather data with flight tracking
- Overlay GPS jamming zones against air traffic

### Extended City Coverage

- San Francisco, NYC, London traffic cameras (deeper coverage)
- Generic OSM traffic simulation for all 8 cities

### SpatialOS Integration

The full thesis — a continuously updating model of the physical world:

- Real-time change detection
- Predictive modeling
- AI agents querying spatial state
- Multi-user collaboration

---

## API Key Requirements

### Required Keys

| Service | Key | Setup |
|---------|-----|-------|
| Google Maps Tile API | `GOOGLE_MAPS_TILE_API_KEY` | console.cloud.google.com → enable Map Tiles API |

### Optional Keys

| Service | Key | Effect if absent |
|---------|-----|-----------------|
| AISStream | `AISSTREAM_API_KEY` | Ships layer disabled |
| OpenSky Network | Registered account (via env) | Falls back to anonymous (lower rate limits) |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial Load | < 5s first meaningful paint |
| Frame Rate | 30+ FPS during normal navigation |
| Tile Loading | < 2s on pan to new area |
| Data Refresh | < 1s for flight/satellite position updates |
| Memory Usage | < 2GB peak |

---

## Security Considerations

- API keys are server-side only — proxied through `localhost:3001`, never bundled into frontend
- Keys in `.env`, never committed to git
- No user data collection, no authentication required
- All data sources are public
- CCTV feeds are publicly accessible city cameras
- Classification markings are purely aesthetic — no actual classified information

---

## References

### Primary Sources

1. [Bilawal Sidhu — I Built a Spy Satellite Simulator](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator) — Original project announcement; thesis statement on spatial intelligence and sousveillance; details the AI-agent-swarm build methodology
2. [YouTube — Ex-Google Maps PM Vibe Coded Palantir In a Weekend](https://www.youtube.com/watch?v=rXvU7bPJ8n4) — 10-minute walkthrough of the original WorldView (CRT/NVG/FLIR/Anime modes, 6.7K flights, satellite tracking, military flights via ADS-B, traffic, CCTV, seismic). 672K views
3. [Bilawal Sidhu — The Intelligence Monopoly Is Over](https://www.spatialintelligence.ai/p/the-intelligence-monopoly-is-over) — Operation Epic Fury OSINT reconstruction (ADS-B + satellites + GPS jamming + AIS + no-fly zones fused on a 3D globe) — validates the data fusion approach and demonstrates timeline playback
4. [YouTube — Ex-Google PM Builds God's Eye to Monitor Iran in 4D](https://www.youtube.com/watch?v=0p8o7AeHDzg) — 11-minute breakdown of Operation Epic Fury reconstruction with playback mode, named recon satellites (Maxar, Capella, Gaofen, Persona 3, USA-234 Topaz, Pléiades Neo, WorldView Legion, SPOT), GPS jamming, Strait of Hormuz shutdown, cascading airspace closures. 1.9M views
5. [@bilawalsidhu on X](https://x.com/bilawalsidhu) — Original demo posts and ongoing updates

### Technical Documentation

5. [Google Maps Tile API](https://developers.google.com/maps/documentation/tile) — 3D Tiles integration
6. [CesiumJS Documentation](https://cesium.com/learn/cesiumjs/ref-doc/) — 3D globe rendering
7. [CelesTrak](https://celestrak.org/) — Satellite TLE data
8. [OpenSky Network API](https://opensky-network.org/apidoc/) — Flight tracking
9. [AISStream](https://aisstream.io/) — Maritime AIS data
10. [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — OSM road network queries
11. [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/) — Seismic data
12. [satellite.js](https://github.com/shashwatak/satellite-js) — SGP4/SDP4 orbital propagation

### Design References

13. [Military Display Specifications](https://en.wikipedia.org/wiki/FLIR) — FLIR/NVG visual reference
14. [Palantir Gotham](https://www.palantir.com/platforms/gotham/) — Intelligence platform reference

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-07 | Initial PRD draft |
| 2.0 | 2026-05-01 | Updated to reflect implemented state: SolidJS added to stack; M1–M5 marked complete; Ships layer (M4B) documented; shader modes corrected (AH64 replaces ANIME/NAVI); CCTV sources expanded to 4 agencies; command bar, follow mode, dead-reckoning, rate-limit handling, traffic style toggle, Center Stage mode, FPS counter all documented; unimplemented stubs listed; Operation Epic Fury article added to references; M6 remains pending |

---

## Appendix A: POI Coordinates

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

```typescript
function calculateGSD(altitudeMeters: number): number {
  const gsd = altitudeMeters / 1000;
  return Math.round(gsd * 100) / 100;
}
// Display: "GSD: 0.5m"
```

### NIIRS Rating (aesthetic approximation)

```typescript
function calculateNIIRS(altitudeMeters: number): number {
  const niirs = 9 - Math.log10(altitudeMeters / 100) * 2.5;
  return Math.max(1, Math.min(9, Math.round(niirs * 10) / 10));
}
// Display: "NIIRS: 7.2"
```

### Altitude

```typescript
function getAltitude(viewer: Cesium.Viewer): number {
  return Math.round(viewer.camera.positionCartographic.height);
}
// Display: "ALT: 12345m"
```

### Sub-satellite Point Elevation

```typescript
function getSubElevation(viewer: Cesium.Viewer): number {
  const pitch = Cesium.Math.toDegrees(viewer.camera.pitch);
  return Math.round(Math.abs(pitch) * 10) / 10;
}
// Display: "SUB: 45.0° EL"
```
