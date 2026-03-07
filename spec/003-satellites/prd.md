# WorldView — Milestone 3: Satellite Layer PRD

**Feature:** Real-Time Satellite Tracking Layer  
**Version:** 1.0  
**Status:** Approved  
**Date:** 2026-03-07

---

## Overview

Add a real-time satellite tracking layer to the WorldView globe. Users can toggle satellite visibility, see 180+ satellites at their actual orbital positions, click to select a satellite, view orbital paths, and enter follow mode to track a selected satellite from orbit altitude.

---

## Goals

1. Render active, space station, and military satellites at real orbital positions using SGP4 propagation
2. Enable click-to-select with an info panel and orbital path overlay
3. Support follow mode (orbit-altitude chase cam)
4. Integrate cleanly into the existing layer toggle UI without dedicated new panels

---

## Non-Goals

- Starlink constellation (excluded — too many satellites for the aesthetic)
- GPS constellation (excluded at launch)
- Weather satellites (excluded at launch)
- Pass prediction over viewer location
- TLE background refresh (fetch once on page load only)
- 3D satellite models

---

## Data Source

**CelesTrak TLE API**

| Category | CelesTrak Group | Color |
|----------|----------------|-------|
| Active satellites | `active` | `#00ff41` (terminal green) |
| Space stations | `stations` | `#00cfff` (blue) |
| Military | `military` | `#ff4444` (red) |

- Fetch endpoint: `https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle`
- Fetch timing: Once on page load, when satellite layer is first enabled
- No background refresh during a session

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| TLE fetching | Direct browser fetch (via existing tile proxy if CORS issues) | Simple, no new infra |
| SGP4 propagation | `satellite.js` npm package | Most widely used JS SGP4 port, well-maintained, CesiumJS-compatible |
| Rendering | CesiumJS `BillboardCollection` with glow textures | Performant at 200+ points, native CesiumJS |
| Orbital path | CesiumJS `Polyline` / `SampledPositionProperty` | Smooth interpolated paths |
| Update loop | `setInterval` at 5-second cadence | SGP4 is cheap; 5s is imperceptible for orbital speeds |

---

## Features

### F3.1 — TLE Data Fetching

- Fetch TLE data for three groups on first layer enable: `active`, `stations`, `military`
- Parse raw TLE text format (name line + line 1 + line 2 triplets)
- Store parsed TLE records in memory for the session
- Show a loading indicator in the layer toggle while fetching

### F3.2 — SGP4 Position Propagation

- Use `satellite.js` `propagate()` with current UTC time to compute ECI position
- Convert ECI → geodetic (lat/lon/alt) using `satellite.js` `eciToGeodetic()`
- Compute positions for all satellites every 5 seconds via `setInterval`
- Positions updated in-place on existing CesiumJS entities (no entity churn)

### F3.3 — Satellite Rendering

- Render each satellite as a billboard point with a soft circular glow texture
- Point size: ~8px screen-space, glow radius ~16px
- Color-coded by category (see table above)
- Selected satellite: larger point (~14px) with brighter glow and targeting reticle overlay
- "TRACKING: N SATS" counter displayed in the existing HUD status bar

### F3.4 — Orbital Path Display

- Shown only for the selected satellite
- Compute full 360° orbit by propagating positions at uniform time steps (e.g., every 60 seconds across one full orbital period)
- Render as a `Polyline` with category color, 50% opacity
- Path recomputed on selection; not updated on the 5-second tick (orbit shape is stable)

### F3.5 — Click-to-Select

- Clicking a satellite billboard fires CesiumJS pick event
- Highlights selected satellite (larger glow, reticle)
- Displays info panel (see F3.7)
- Renders orbital path (see F3.4)
- Clicking empty space or another satellite deselects the previous

### F3.6 — Follow Mode

- Toggle button in the info panel: `[FOLLOW]` / `[UNFOLLOW]`
- Camera behavior: orbit-altitude chase cam — camera locks behind/above the satellite at its orbital altitude, looking nadir (down toward Earth)
- Implemented via CesiumJS `viewer.trackedEntity` or equivalent camera lock
- Exiting follow mode: click `[UNFOLLOW]`, press `Escape`, or click empty space on globe
- Follow mode does not prevent the 5-second position update

### F3.7 — Info Panel

Displayed in the existing right-side info panel when a satellite is selected:

| Field | Value |
|-------|-------|
| Name | Satellite common name (from TLE line 0) |
| NORAD ID | Catalog number from TLE line 1 |
| Velocity | Orbital velocity in km/s (computed from SGP4 velocity vector) |
| Category | Active / Space Station / Military |

Panel clears on deselect. No dedicated satellite panel — reuses existing info panel component.

### F3.8 — Layer Toggle Integration

- Add `SATELLITES` toggle to existing layer panel alongside flights, traffic, CCTV
- Toggle ON: fetch TLEs (if not yet fetched), begin 5-second update loop, render all satellites
- Toggle OFF: stop update loop, remove all satellite entities and orbital paths, clear any active selection and info panel

### F3.9 — Constellation Filtering (P1)

- Filter sub-controls within the satellite layer toggle for each category
- Checkboxes or buttons: `[ACTIVE]` `[STATIONS]` `[MILITARY]`
- Hiding a category removes its billboards; showing re-adds them
- Selected satellite is deselected if its category is hidden

---

## Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | 100+ satellites render at correct orbital positions on layer enable |
| AC2 | Satellite positions visually update every 5 seconds |
| AC3 | Each category renders in the correct color (green / blue / red) |
| AC4 | Clicking a satellite selects it and shows name, NORAD ID, velocity in info panel |
| AC5 | Full orbital path polyline renders for selected satellite |
| AC6 | Follow mode locks camera to satellite at orbital altitude |
| AC7 | Toggling layer off clears all satellites, paths, selection, and info panel |
| AC8 | "TRACKING: N SATS" counter reflects visible satellite count |
| AC9 | Frame rate does not drop below 30fps with satellite layer enabled (Chrome, M1 Mac baseline) |
| AC10 | Category filters show/hide satellite groups without full data re-fetch |

---

## Out of Scope (Future Milestones)

- Pass prediction over map center
- Satellite search / name filter
- TLE auto-refresh
- GPS / Starlink / Weather categories
- Historical playback

---

## Open Questions

_None — all resolved in PRD interview._
