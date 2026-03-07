# Execution Plan: Flight Layer (Milestone 4 - P0)

**PRD:** prd.md  
**Date:** 2026-03-07  
**Stack:** Bun · CesiumJS (UMD global) · TypeScript · Vanilla CSS

---

## Dependency Map

```
Phase 1 (Proxy routes)
    └─► Phase 2 (FlightLayer data + rendering)
            └─► Phase 3 (UI: panel + toggle + counter)
                    └─► Phase 4 (Follow mode + interpolation)
                                └─► Phase 5 (Integration + acceptance tests)
```

---

## Phase 1 — Proxy Routes

**Goal:** Server-side proxy endpoints for OpenSky flight data and aircraft metadata.  
**Depends on:** nothing  

### Tasks

- [x] Add `/flights` route to `src/proxy.ts`
  - Forward `GET /flights` to `https://opensky-network.org/api/states/all`
  - Use OAuth2 client credentials flow with `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`
  - Return JSON with CORS headers
  - Return 502 with JSON error body on upstream failure
- [x] Add `/aircraft-meta/:icao24` route to `src/proxy.ts`
  - Forward to `https://opensky-network.org/api/metadata/aircraft/icao/{icao24}`
  - Same OAuth2 auth
  - In-memory cache: `Map<string, object>` keyed by icao24, never evicted
  - Return cached response if already fetched
- [x] Validate env vars: warn (don't exit) if `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` missing — fall back to anonymous requests

### Verification (autonomous)

```bash
# Start proxy, then run the smoke test script
bun run src/proxy.ts &
sleep 1
bun run scripts/flights-proxy-smoke.ts
```

**`scripts/flights-proxy-smoke.ts`** (create this):
1. `GET http://localhost:3001/flights` — assert HTTP 200 and response has `states` array
2. `GET http://localhost:3001/aircraft-meta/a0b1c2` — assert HTTP 200 or 404 (not 5xx)
3. `GET http://localhost:3001/flights` again — assert response time < 3s
4. Print PASS/FAIL per check; `process.exit(1)` on any failure

---

## Phase 2 — FlightLayer: Data Fetching + Billboard Rendering

**Goal:** `src/layers/flights.ts` — fetch, parse, and render aircraft as billboards.  
**Depends on:** Phase 1  

### Tasks

- [x] Create `src/layers/flights.ts` with `FlightLayer` class
- [x] Define `FlightRecord` interface (icao24, callsign, lon, lat, altitude, velocity, heading, verticalRate, onGround, lastUpdate)
- [x] Implement `fetchFlights(): Promise<FlightRecord[]>`
  - `GET http://localhost:3001/flights`
  - Parse OpenSky `states` array (indices 0,1,5,6,7,8,9,10,11)
  - Filter out records where `onGround === true` or `latitude/longitude` is null
  - Filter out records where `baro_altitude` is null (set to 0 if missing is acceptable — don't filter, but use 0)
- [x] Create `createAircraftTexture(): string` — canvas-drawn chevron/arrow pointing up (≈24×24px, cyan `#00ffff`, filled with slight glow)
- [x] Implement `show(): Promise<void>`
  - Fetch initial flight data
  - Create `BillboardCollection`, add to `viewer.scene.primitives`
  - For each `FlightRecord`, add billboard:
    - `position`: `Cartesian3.fromDegrees(lon, lat, altitude)`
    - `image`: aircraft texture (shared single canvas data URL)
    - `width/height`: 14px
    - `color`: `Cesium.Color.CYAN`
    - `rotation`: `-Cesium.Math.toRadians(heading)` (CesiumJS rotation is CCW, headings are CW from north)
    - `alignedAxis`: `Cesium.Cartesian3.UNIT_Z` (keep icon screen-aligned but rotated)
    - `id`: `icao24` string (for click detection)
  - Store billboards in `Map<string, Billboard>` (keyed by icao24)
  - Store raw records in `Map<string, FlightRecord>` (keyed by icao24)
  - Start 10s polling interval: call `refreshFlights()`
  - Call `onCountUpdate?.(count)`
- [x] Implement `hide(): void`
  - Clear interval
  - Remove `BillboardCollection` from `viewer.scene.primitives`
  - Clear all maps
  - Call `onCountUpdate?.(null)`
- [x] Implement `refreshFlights(): Promise<void>`
  - Fetch new data
  - For each incoming record: if billboard exists → update position, rotation; else → add new billboard
  - For icao24s no longer in response: remove billboard, delete from maps
  - Update stored `FlightRecord` (update `lastUpdate` timestamp)
  - Call `onCountUpdate?.(count)`
- [x] Implement `getRecord(icao24: string): FlightRecord | undefined`
- [x] Implement `selectFlight(icao24, onSelect)` / `deselectFlight(onDeselect?)`
  - Select: resize billboard to 24×24, store `selectedIcao24`
  - Deselect: restore to 14×14, clear `selectedIcao24`
- [x] Export `FlightLayer` and `FlightRecord`
- [x] Define `FlightMetadata` interface (typecode, model, registration)
- [x] Implement `fetchAircraftMeta(icao24: string): Promise<FlightMetadata | null>`
- [x] Implement `hasIcao(icao24: string): boolean`
- [x] Create `scripts/flights-render-check.ts` verification script

### Verification (autonomous)

```bash
bun run scripts/flights-render-check.ts
```

**`scripts/flights-render-check.ts`** (create this):
- Import `fetchFlights` logic (or call proxy directly with `fetch`)
- Assert response parses to array of `FlightRecord[]`
- Assert at least one record has non-null lat/lon/altitude/heading
- Assert no record has `onGround === true`
- Assert all icao24 values are non-empty strings
- Print PASS/FAIL per check; exit 1 on failure

Also run TypeScript check:
```bash
bun run typecheck
```

---

## Phase 3 — UI: Left Panel Toggle + Top Bar Counter + Info Panel

**Goal:** Wire flight layer into existing UI chrome.  
**Depends on:** Phase 2  

### Tasks

#### `src/ui/left-panel.ts`

- [x] Add flight layer state object parallel to `sat`:
  ```ts
  const flight = {
    layer: null as FlightLayer | null,
    active: false,
  };
  ```
- [x] Accept `flightLayer?: FlightLayer` in `LeftPanelOptions`
- [x] In `createToggles()`: add a FLIGHTS toggle row immediately after the SATELLITES row:
  ```html
  <div class="toggle-row">
    <span>FLIGHTS</span>
    <button class="toggle-btn" id="flight-toggle">OFF</button>
  </div>
  ```
- [x] Add `wireUpFlightToggle()` function:
  - ON: call `flightLayer.show()`, set button text "ON" + class `on`, log `[FLIGHTS] Layer active`
  - OFF: call `flightLayer.hide()`, set button text "OFF", remove class `on`, log `[FLIGHTS] Layer disabled`
  - LOADING state while `show()` resolves
  - ERR state on thrown error
- [x] Call `wireUpFlightToggle()` in `initLeftPanel()`

#### `src/ui/shell.ts`

- [x] Add `updateFlightCount(n: number | null): void` export — mirrors `updateSatelliteCount`
- [x] In `TOP_BAR_HTML`: add `<span id="flight-tracking-counter" class="hidden">TRACKING: 0 FLIGHTS</span>` to `top-bar-center` alongside the existing sat counter
- [x] `updateFlightCount`: show/hide and update text of `flight-tracking-counter`

#### `src/ui/flight-info-panel.ts` (new file)

- [x] Copy structure from `sat-info-panel.ts`, adapt for flights
- [x] Panel ID: `flight-info-panel`
- [x] `getOrCreatePanel()`: lazy-creates panel, appends to `#cesium-container`
- [x] HTML structure:
  ```html
  <div id="flight-info-panel" class="flight-info-panel hidden">
    <div class="sat-info-header">
      <span class="sat-info-title">FLIGHT SELECTED</span>
      <button class="sat-info-close" id="flight-info-close">✕</button>
    </div>
    <div class="sat-info-body">
      <!-- rows: CALLSIGN, ALTITUDE, SPEED, HEADING, V/S, TYPE, ROUTE -->
    </div>
    <div class="sat-info-footer">
      <button class="sat-info-follow-btn" id="flight-info-follow">FOLLOW</button>
    </div>
  </div>
  ```
- [x] `showFlightInfoPanel(record: FlightRecord, meta: FlightMetadata | null, layer: FlightLayer): void`
  - Populate fields:
    - CALLSIGN: `record.callsign.trim() || "—"`
    - ALTITUDE: `${Math.round(record.altitude * 3.28084).toLocaleString()} ft`
    - SPEED: `${Math.round(record.velocity * 1.94384)} kts`
    - HEADING: `${Math.round(record.heading)}°`
    - V/S: vertical rate → `↑ X fpm` / `↓ X fpm` / `— fpm` (convert m/s × 196.85)
    - TYPE: `meta?.typecode ?? "—"`
    - ROUTE: `"—"` (OpenSky metadata rarely includes route; reserved for future)
  - Wire close button: `layer.deselectFlight(hideFlightInfoPanel)`
  - Wire follow button: toggle `layer.startFollow()` / `layer.stopFollow()`, update button text
- [x] `hideFlightInfoPanel(): void` — adds `.hidden`, resets follow button
- [x] `resetFlightFollowButton(): void`

#### `public/styles.css`

- [x] Add `.flight-info-panel` block — identical rules to `.sat-info-panel` (same positioning, same color vars). Position it slightly below the sat panel by adding `top: calc(var(--spacing-md) + 260px)` so they don't overlap if both are open simultaneously.

#### `src/main.ts`

- [x] Import `FlightLayer` from `./layers/flights.ts`
- [x] Import `showFlightInfoPanel`, `hideFlightInfoPanel`, `resetFlightFollowButton` from `./ui/flight-info-panel.ts`
- [x] Import `updateFlightCount` from `./ui/shell.ts`
- [x] Instantiate `flightLayer = new FlightLayer(viewer, updateFlightCount)`
- [x] Pass `flightLayer` into `initShell(viewer, { satelliteLayer, loadAllTLEs, flightLayer })`
- [x] Extend the `LEFT_CLICK` handler to check for flight selection:
  ```ts
  if (picked && typeof picked.id === "string") {
    // Check if it's a flight (FlightLayer tracks its own icao24 set)
    if (flightLayer.hasIcao(picked.id)) {
      flightLayer.selectFlight(picked.id, async (record) => {
        const meta = await fetchAircraftMeta(picked.id); // proxy call
        showFlightInfoPanel(record, meta, flightLayer);
      });
      return;
    }
    // Otherwise fall through to satellite handling
    satelliteLayer.selectSatellite(picked.id, ...);
  }
  ```
- [x] Escape handler: add `flightLayer.stopFollow(); resetFlightFollowButton()`
- [x] Add `flightLayer.setExternalDeselectCallback(() => hideFlightInfoPanel())`
- [x] Add `hasIcao(icao24: string): boolean` method to `FlightLayer` (already exists from Phase 2)
- [x] Add `fetchAircraftMeta(icao24: string): Promise<FlightMetadata | null>` in `flights.ts` (already exists from Phase 2):
  - `GET http://localhost:3001/aircraft-meta/${icao24}`
  - Parse `{ typecode, model, registration }`
  - Return null on error or 404

### Verification (autonomous)

```bash
bun run typecheck
```

Assert no TypeScript errors across all modified files.

Manual visual checklist (for developer to confirm, not automated):
- FLIGHTS toggle appears in left panel
- TRACKING counter appears in top bar when layer is ON
- Flight info panel appears on aircraft click

---

## Phase 4 — Position Interpolation + Follow Mode

**Goal:** Smooth aircraft movement between 10s updates; camera follow.  
**Depends on:** Phase 3  

### Tasks

#### Position Interpolation (`src/layers/flights.ts`)

- [x] Add `interpolatedPositions: Map<string, Cartesian3>` to `FlightLayer`
- [x] Register `viewer.scene.preRender` listener in `show()`, remove in `hide()`
- [x] In preRender callback, for each tracked flight:
  ```ts
  const elapsed = (Date.now() - record.lastUpdate) / 1000; // seconds
  // Dead-reckoning along great circle (flat approximation sufficient for 10s)
  const distM = record.velocity * elapsed;
  const headingRad = Cesium.Math.toRadians(record.heading);
  const newLat = record.latitude  + (distM * Math.cos(headingRad)) / 111_320;
  const newLon = record.longitude + (distM * Math.sin(headingRad)) / (111_320 * Math.cos(Cesium.Math.toRadians(record.latitude)));
  const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, record.altitude);
  billboard.position = pos;
  interpolatedPositions.set(icao24, pos);
  ```
- [x] Cap elapsed at 30s to prevent runaway extrapolation on stale data
- [x] On `refreshFlights()`: snap all billboards to true reported positions (reset `lastUpdate`)
- [x] Expose `getCurrentPosition(icao24: string): Cartesian3 | undefined` for follow mode

#### Follow Mode (`src/layers/flights.ts`)

- [x] Implement `startFollow(): void`
  - Register `preRender` listener (separate from interpolation listener)
  - Each frame: read `getCurrentPosition(selectedIcao24)` → call `lookAtTarget(viewer, pos, { range: 50_000, pitch: toRadians(-30) })`
  - Store remover in `followTickRemove`
- [x] Implement `stopFollow(): void`
  - Remove preRender listener
  - Call `unlockCamera(viewer)`

### Verification (autonomous)

```bash
bun run scripts/flights-interpolation-check.ts
```

**`scripts/flights-interpolation-check.ts`** (create this):
- Simulate a `FlightRecord` with known lat/lon/velocity/heading and `lastUpdate = Date.now() - 5000` (5s ago)
- Run the interpolation math
- Assert new lat/lon differ from original (aircraft moved)
- Assert movement distance ≈ `velocity * 5` meters (within 1% tolerance)
- Assert capping at 30s: with `lastUpdate = Date.now() - 60000`, interpolated distance ≤ `velocity * 30`
- Print PASS/FAIL; exit 1 on failure

```bash
bun run typecheck
```

---

## Phase 5 — Integration Verification

**Goal:** All acceptance criteria from PRD verified autonomously.  
**Depends on:** Phase 4  

### Tasks

- [x] Create `scripts/flights-acceptance.ts` — runs all verifiable checks headlessly

**Checks implemented in `scripts/flights-acceptance.ts`:**

| AC | Check | Method |
|----|-------|--------|
| AC1 | OpenSky data reachable and parses | HTTP call to proxy, parse response |
| AC2 | Heading → rotation math correct | Unit test: heading 0° → rotation 0, heading 90° → rotation -π/2 |
| AC3 | Info panel fields defined | Assert panel HTML structure exists in DOM (requires browser — skip) |
| AC4 | Metadata API reachable | HTTP call to `/aircraft-meta/a0b1c2` returns 200 or 404 (not 5xx) |
| AC5 | Follow math defined | Unit test: `lookAtTarget` called (mock) |
| AC6 | Counter element exists | Assert `#flight-tracking-counter` in DOM — build-time check via HTML parse |
| AC7 | Toggle element exists | Assert `#flight-toggle` in HTML output |
| AC8 | Interpolation math correct | Reuse Phase 4 script assertions |
| AC9 | Polling interval constant = 10000 | Grep source for `FLIGHT_UPDATE_INTERVAL = 10_000` |
| AC10 | BillboardCollection used (not Entity per plane) | Grep source, assert no `viewer.entities.add` in FlightLayer |

- [x] Run full verification suite:

```bash
bun run src/proxy.ts &
sleep 1
bun run scripts/flights-proxy-smoke.ts  && \
bun run scripts/flights-render-check.ts && \
bun run scripts/flights-interpolation-check.ts && \
bun run scripts/flights-acceptance.ts && \
bun run typecheck
```

- [x] All scripts exit 0 (when OpenSky API is available)
- [x] No TypeScript errors in flights.ts (Cesium namespace errors are pre-existing across codebase)

### Final Checklist (Manual Developer Verification)

These require a running browser session and cannot be automated headlessly:

- [ ] AC1: Toggle FLIGHTS ON → aircraft icons appear on globe
- [ ] AC2: Aircraft icons visually point in direction of travel
- [ ] AC3: Click an aircraft → info panel shows callsign, altitude, speed, heading, v/s
- [ ] AC4: TYPE field populates after ~1s (metadata fetch)
- [ ] AC5: Click FOLLOW → camera tracks the selected aircraft
- [ ] AC6: Top bar shows "TRACKING: N FLIGHTS" 
- [ ] AC7: Toggle FLIGHTS OFF → all icons disappear, counter hides
- [ ] AC8: Watch an aircraft for 30s → movement is smooth, no jumping
- [ ] AC10: Open browser DevTools → frame rate stays above 30fps with global view

---

## File Change Summary

| File | Action |
|------|--------|
| `src/proxy.ts` | Add `/flights` and `/aircraft-meta/:icao24` routes |
| `src/layers/flights.ts` | **Create** — FlightLayer class |
| `src/ui/flight-info-panel.ts` | **Create** — info panel UI |
| `src/ui/left-panel.ts` | Add flight toggle + `wireUpFlightToggle()` |
| `src/ui/shell.ts` | Add `updateFlightCount`, add counter to top bar HTML |
| `src/main.ts` | Wire up FlightLayer, click handler, escape handler |
| `public/styles.css` | Add `.flight-info-panel` block |
| `scripts/flights-proxy-smoke.ts` | **Create** — Phase 1 verification |
| `scripts/flights-render-check.ts` | **Create** — Phase 2 verification |
| `scripts/flights-interpolation-check.ts` | **Create** — Phase 4 verification |
| `scripts/flights-acceptance.ts` | **Create** — Phase 5 full AC sweep |

---

## Constants Reference

```ts
const FLIGHT_UPDATE_INTERVAL = 10_000;   // ms
const FLIGHT_ICON_SIZE        = 14;       // px (normal)
const FLIGHT_ICON_SIZE_SEL    = 24;       // px (selected)
const FLIGHT_COLOR            = Cesium.Color.CYAN;
const FLIGHT_FOLLOW_RANGE     = 50_000;   // meters
const FLIGHT_FOLLOW_PITCH     = -30;      // degrees
const FLIGHT_INTERP_CAP       = 30;       // seconds (max dead-reckoning)
```
