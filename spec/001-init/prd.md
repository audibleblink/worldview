# PRD: WorldView — Milestone 1: Globe Foundation

**Project:** WorldView (toy spy satellite simulator)  
**Milestone:** 1 of N — 3D Globe Foundation + UI Shell  
**Status:** Draft  
**Date:** 2026-03-07

---

## Overview

Build the foundational shell of WorldView: a browser-based geospatial dashboard styled as a classified intelligence terminal. This milestone delivers a navigable 3D globe powered by Google Photorealistic 3D Tiles, a faithful recreation of the UI chrome seen in the original, and city/POI fly-to navigation. No live data feeds. No shaders. This is the skeleton everything else builds on.

The output of this milestone should feel like a working intelligence terminal that happens to have no active feeds yet — the aesthetic is complete, the data layers are stubbed.

---

## Reference Material

- **Original project:** [spatialintelligence.ai article](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator)
- **Video walkthrough:** [YouTube — rXvU7bPJ8n4](https://www.youtube.com/watch?v=rXvU7bPJ8n4)
- **UI reference screenshots:** Substack article images (circular vignette, left/right panels, terminal aesthetic) - located in ./spec/001-init/*.png

---

## Goals

- Load and render Google Photorealistic 3D Tiles in-browser via CesiumJS
- Implement camera navigation with animated fly-to for 8 preset cities and their POIs
- Render the full UI shell matching the classified terminal aesthetic
- Stub all future data layer controls (disabled state)
- Stub mode switcher buttons (CRT/NVG/FLIR/Normal/Anime) — visible but no-op
- Proxy Google Maps Tile API key server-side via a thin Bun proxy

## Non-Goals (deferred to later milestones)

- Post-processing shaders (CRT scanlines, NVG, FLIR, cel-shading)
- Live satellite tracking (CelesTrak TLE)
- Live flight data (OpenSky, ADS-B Exchange)
- Street traffic particle system (OpenStreetMap)
- CCTV camera feeds and projection
- Seismic/earthquake overlay
- Timeline/playback system
- AI query layer

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Bun | Single tool for dev server, bundler, proxy script |
| 3D Renderer | CesiumJS | Built-in 3D Tiles support, camera/orbital math, well-documented |
| Frontend language | TypeScript | Type safety for the geospatial data structures |
| Styling | Vanilla CSS | No framework overhead; terminal aesthetic is custom anyway |
| Backend | Bun HTTP server (minimal) | CORS proxy to keep Google API key server-side |
| API key storage | `.env` file | Already present in repo; `GOOGLE_MAPS_TILE_API_KEY` var |

---

## Architecture

```
dev/
├── src/
│   ├── main.ts          # Entry point, CesiumJS init
│   ├── globe.ts         # 3D Tiles setup, camera controller
│   ├── pois.ts          # City + POI definitions, fly-to logic
│   ├── ui/
│   │   ├── shell.ts     # Top-level UI layout orchestration
│   │   ├── left-panel.ts  # City selector, POI nav, stubbed controls
│   │   ├── right-panel.ts # Telemetry readout, parameters panel (stubbed)
│   │   └── bottom-bar.ts  # Mode switcher buttons, style preset indicator
│   └── proxy.ts         # Bun HTTP server — tiles API proxy
├── public/
│   └── index.html
└── .env                 # GOOGLE_MAPS_TILE_API_KEY
```

---

## Feature Requirements

### F1 — Project Scaffold

- Initialize Bun project with TypeScript
- Install CesiumJS as a dependency
- Configure Bun bundler to handle CesiumJS assets (Workers, static files)
- `bun run dev` starts both the frontend dev server and the proxy on separate ports
- `bun run build` produces a production bundle

### F2 — Google 3D Tiles Proxy

The Google Maps Tile API key must never be exposed to the client.

- Bun HTTP server listens on `localhost:3001`
- Proxies requests to `https://tile.googleapis.com` with the API key appended
- Frontend CesiumJS points its tile root URL at the local proxy
- `.env` variable: `GOOGLE_MAPS_TILE_API_KEY`
- Setup steps documented below in [API Key Setup](#api-key-setup)

### F3 — 3D Globe (CesiumJS)

- Full Earth renders on load using Google Photorealistic 3D Tiles
- Default opening view: full globe (altitude ~15,000km), centered on 0°N 0°E
- Camera: standard mouse/touch controls (orbit, zoom, pan) via CesiumJS defaults
- Terrain and photorealistic building models load progressively as user zooms in
- No Cesium branding/attribution stripped (leave default attribution)

### F4 — City & POI System

8 cities, each with multiple named POIs. POI coordinates are sourced from OpenStreetMap bounding box centers (not naive lat/lng) to ensure the camera frames the landmark correctly.

**Cities and initial POIs:**

| City | Key POIs |
|---|---|
| Austin, TX | Texas State Capitol, Congress Ave Bridge, UT Tower, Sixth Street |
| San Francisco, CA | Golden Gate Bridge, Salesforce Tower, Alcatraz, Bay Bridge |
| New York, NY | Empire State Building, Brooklyn Bridge, Statue of Liberty, One WTC |
| Tokyo, Japan | Tokyo Tower, Shibuya Crossing, Senso-ji, Tokyo Skytree |
| London, UK | Tower Bridge, Big Ben, Buckingham Palace, The Shard |
| Paris, France | Eiffel Tower, Arc de Triomphe, Notre-Dame, Louvre |
| Dubai, UAE | Burj Khalifa, Palm Jumeirah, Dubai Frame, Burj Al Arab |
| Washington, DC | US Capitol, Washington Monument, Pentagon, Lincoln Memorial |

**Navigation behavior:**
- Keyboard shortcuts `Q W E R T` cycle through POIs within the currently selected city
- Fly-to animation: smooth CesiumJS camera flight (duration ~2s) to each POI
- Camera arrives at a consistent "looking down at ~45° angle from ~500m altitude" perspective per POI
- POI name displays in the bottom-center location tooltip during/after fly-to

### F5 — UI Shell (Classified Terminal Aesthetic)

The UI must match the visual style seen in the reference screenshots. All panels rendered as HTML/CSS overlaid on the CesiumJS canvas.

**Global styles:**
- Background: `#000` (pure black)
- Primary text color: `#00f0ff` (cyan) for labels and active elements
- Secondary text: `#4a9e8a` (muted teal) for readouts
- Active/highlight: `#00ff88` (green) for enabled toggles
- Font: monospace — `'Courier New'` or similar terminal font
- All text uppercase
- Subtle scanline texture on the overall page (CSS only, not a shader)

**Top bar:**
- Left: `WORLDVIEW` wordmark + `NO PLACE LEFT BEHIND` tagline beneath it
- Center: thin separator line
- Right: `CRT` mode indicator (large, bright — updates when mode switches)
- Far right corner: `REC` indicator with timestamp (`YYYY-MM-DD HH:MM:SSZ`, live clock)
- Below REC: fake telemetry string (static): `GRB: XXXXX PASS: DESC:XXX`
- Top-left watermark (small, faint): `TOP SECRET // SI-TK // NOFORN`

**Center viewport:**
- CesiumJS canvas fills the entire browser window
- Circular vignette overlay (CSS `radial-gradient`) darkens the edges, creating the "lens" effect seen in screenshots
- Vignette is purely cosmetic CSS, not a WebGL shader

**Left panel** (positioned absolute, left side, semi-transparent dark bg):
- **City selector:** dropdown showing current city (default: Austin)
- Changing city flies the camera to that city's first POI
- **POI navigation:** PREV / NEXT buttons + current POI name display
- Keyboard shortcuts Q/W/E/R/T mapped to POIs 1–5 of current city
- **Stubbed controls** (visible, disabled, greyed out):
  - COVERAGE ON toggle
  - AUTO HOF SPY toggle
  - PROJECTION IN toggle
  - AUTO CAL button
  - ALIGN - DRAPE button
- **Calibration sliders** (stubbed, no-op): AZIMUTH, PITCH, FOC, RANGE, HEIGHT, NORTH, EAST
- SAVE CAL / RESET CAL buttons (stubbed)
- CCTV thumbnail area (black placeholder with "NO FEED" text)
- System log readout at bottom (static placeholder text)

**Right panel** (positioned absolute, right side):
- PARAMETERS header
- Three sliders (stubbed, no-op): **Pixelation / Distortion / Instability**
- Bottom readout (live): `GSD: Xm | NIIRS: X.X | ALT: XXXXm | SUB: XX.X° EL`
  - GSD and ALT derive from current CesiumJS camera altitude
  - NIIRS is a fake calculation (log scale of altitude, clamped 1–9)
  - SUB angle is camera pitch

**Bottom bar:**
- Center: `STYLE PRESETS` label + mode switcher buttons:
  - `NORMAL | CRT | NVG | FLIR | ANIME | NAVI`
  - Active mode highlighted in cyan, others dimmed
  - Clicking changes the active state visually only (no shader applied this milestone)
- Below buttons: `STYLE: [CURRENT MODE]` text indicator
- Left of buttons: city quick-jump tabs (Austin, SF, NY, Tokyo, London, Paris, Dubai, Washington DC) — clicking jumps to that city's first POI
- Right of buttons: location tooltip showing current POI name + city

**Classification watermarks:**
- Top-left corner: `TOP SECRET // SI-TK // NOFORN` (small, 30% opacity, cyan)
- Scrolling ticker at very top (optional): repeating `RNEI-XXXX SPS-XXXX` style fake codes

---

## API Key Setup

These steps belong in the project README but are documented here for completeness.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Map Tiles API**
4. Create an API key under **Credentials**
5. Restrict the key to the Map Tiles API (recommended)
6. Add to `.env`:
   ```
   GOOGLE_MAPS_TILE_API_KEY=your_key_here
   ```
7. The proxy server reads this at startup — never commit `.env` (already in `.gitignore`)

---

## Acceptance Criteria

| # | Criteria |
|---|---|
| AC1 | `bun run dev` starts successfully with no errors |
| AC2 | Google Photorealistic 3D Tiles load and render the full Earth globe |
| AC3 | Zooming into any of the 8 cities shows photorealistic 3D buildings |
| AC4 | City dropdown switches city and camera flies to that city's first POI |
| AC5 | Q/W/E/R/T keyboard shortcuts fly to POIs 1–5 of the current city |
| AC6 | PREV/NEXT buttons navigate POIs within the current city |
| AC7 | All UI panels render with the correct terminal aesthetic (black bg, cyan text, monospace) |
| AC8 | Circular vignette lens effect is visible on the globe viewport |
| AC9 | Mode switcher buttons (CRT/NVG/FLIR/NORMAL/ANIME/NAVI) are present and toggle visual active state |
| AC10 | Stubbed controls in left and right panels are visible but clearly disabled |
| AC11 | Right panel shows live-updating ALT and SUB values from camera state |
| AC12 | REC timestamp in top bar shows live UTC clock |
| AC13 | Google API key is never present in frontend bundle (proxy confirmed working) |
| AC14 | No console errors on load in Chrome/Firefox |

---

## Out of Scope Clarifications

- **No Cesium Ion** — use Google Maps Tile API directly, not Cesium's own tile service
- **No React / Vue / Svelte** — vanilla TS + DOM manipulation only
- **No CSS framework** — custom CSS only to match the terminal aesthetic precisely
- **No mobile optimization** — desktop browser only for this milestone

---

## Open Questions (resolved)

| Question | Decision |
|---|---|
| Renderer | CesiumJS |
| Build tool | Bun |
| API key exposure | Proxied server-side |
| UI fidelity | Faithful clone of reference screenshots |
| Default view | Full globe on load |
| Cities | Core 8 from the original video |
| Shaders in scope? | No — mode buttons are no-op stubs |
| Left panel scope | City selector + POI nav only; everything else stubbed |
