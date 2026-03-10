# Execution Plan: WorldView SolidJS Migration

> Generated from `prd.md`. Each phase leaves a **complete, fully functioning, tested component**.
> Phases marked with `→ depends on: Phase N` cannot start until their dependency is complete.
>
> **Tech Debt Policy:** See PRD "Tech Debt Blocklist" — 11 anti-patterns from the old codebase that must never appear. Each phase notes which blocklist items apply.

---

## Phase 0: Project Bootstrap & Build Infrastructure

**Goal:** SolidJS compiles, the dev server serves a SolidJS app with Cesium loaded, and the existing proxy server still works. Nothing is broken.

**Depends on:** Nothing (starting point)

### Tasks

- [x] Run `bun install` to restore existing dependencies
- [x] Install SolidJS: `bun add solid-js`
- [x] Install Babel preset for SolidJS JSX: `bun add -d babel-preset-solid @babel/core`
- [x] Update `tsconfig.json`:
  - Set `"jsx": "preserve"` and `"jsxImportSource": "solid-js"`
  - Add path aliases if needed (`@/` → `src/`)
- [x] Create `bunfig.toml` with SolidJS JSX transform configuration (Bun uses `babel-preset-solid` via preload or plugin)
- [x] Create `src/config.ts` — shared constants: `PROXY_BASE_URL` (from env or default `http://localhost:3001`). **All proxy URLs come from here, never hardcoded.** (Blocklist #6)
- [x] Create a minimal `src/index.tsx` entry point that renders a SolidJS `<h1>WorldView</h1>` into `#app`
- [x] Create a new `public/index.html` (or modify existing) that:
  - Loads Cesium UMD as before
  - Loads the SolidJS entry via `<script type="module" src="/src/index.tsx">`
  - Keeps import maps for `satellite.js` and `hls.js`
- [x] Bundle aircraft 3D model locally: copy `Cesium_Air.glb` to `public/models/aircraft.glb` (Blocklist #4)
- [x] Update `src/server.ts` to serve `.tsx` files with SolidJS transpilation
- [x] Verify the proxy server (`src/proxy/index.ts`) still starts and responds to `/health`
- [x] Update `scripts/build.ts` to handle SolidJS JSX (production build)
- [x] Create `.env.example` listing all required/optional environment variables with comments

### Verification

```bash
# verify-phase0.ts
// 1. Start dev server, fetch index page, confirm it contains SolidJS-rendered content
// 2. Start proxy server, hit /health, confirm 200
// 3. Run: bun build src/index.tsx --outdir /tmp/phase0-check && echo "BUILD OK"
// 4. Confirm no TypeScript errors: bunx tsc --noEmit
```

**Script:** `scripts/verify-phase0.ts`
- Starts dev server on port 3000, fetches `/`, asserts response contains `WorldView`
- Starts proxy server on port 3001, fetches `/health`, asserts 200
- Runs `bun build` on the SolidJS entry, asserts no errors
- Runs `tsc --noEmit`, asserts exit code 0
- Prints `✓ Phase 0 complete` or lists failures

**Done when:** Dev server renders SolidJS content, proxy works, TypeScript compiles, build succeeds.

---

## Phase 1: Core Cesium Bindings & Provider

**Goal:** A `<CesiumProvider>` wraps the app, creates/destroys the Cesium Viewer, and reactive hooks (`useCesium`, `usePreRender`, `useCamera`, `useSelection`) are functional. The globe renders.

**Depends on:** → Phase 0

### Tasks

- [x] Create `src/cesium/CesiumProvider.tsx`
  - SolidJS context provider
  - Creates `Cesium.Viewer` in `onMount`, destroys in `onCleanup`
  - Accepts viewer options as props
  - Loads Google 3D Tiles (port logic from `src/globe.ts`)
- [x] Create `src/cesium/useCesium.ts`
  - Hook returning viewer instance from context
  - Throws if used outside provider
- [x] Create `src/cesium/hooks/usePreRender.ts`
  - Subscribes to `scene.preRender` event
  - Auto-unsubscribes via `onCleanup`
- [x] Create `src/cesium/hooks/useCamera.ts`
  - Reactive camera state (position, heading, pitch, roll)
  - `flyTo`, `lookAt`, `unlock` methods (port from `src/camera.ts`)
- [x] Create `src/cesium/hooks/useSelection.ts`
  - Subscribes to `viewer.selectedEntityChanged`
  - Auto-unsubscribes via `onCleanup`
- [x] Create `src/cesium/createEntity.ts`
  - Reactive entity binding: accepts accessor returning entity options
  - Creates entity on viewer, updates reactively via `createEffect`
  - **Position updates MUST mutate existing properties** via `property.setValue()`, never allocate new `ConstantPositionProperty` (Blocklist #1)
  - Returns entity reference, destroys on `onCleanup`
- [x] Create `src/cesium/createBillboardCollection.ts`
  - Reactive `BillboardCollection` binding for high-count layers (100+ items)
  - Manages collection lifecycle, billboard add/remove
  - Single draw call regardless of billboard count
  - **This is the required API for satellites and ships** (Blocklist #3)
- [x] Create `src/cesium/createPointCollection.ts`
  - Reactive `PointPrimitiveCollection` binding for traffic particles
  - Batched updates, LOD support
- [x] Create `src/cesium/createPrimitive.ts`
  - Reactive primitive binding
  - Add/remove from `scene.primitives`
- [x] Create `src/cesium/hooks/useFollowMode.ts`
  - **Single shared implementation** of camera follow mode (Blocklist #5)
  - `track(position, options)` — starts following with heading/pitch/range
  - `stop()` — returns to free camera
  - Uses single preRender listener, user-orbit detection, proper cleanup
  - Replaces the 3 copy-pasted implementations from old code
- [x] Update `src/index.tsx` to wrap app in `<CesiumProvider>` and render globe
- [x] Port Cesium viewer configuration from `src/globe.ts` into provider options

### Verification

**Script:** `scripts/verify-phase1.ts`
- Starts the app, waits for Cesium container to have a canvas element
- Calls each hook in a test component, asserts they return non-null values
- Creates a test entity via `createEntity`, verifies it appears in `viewer.entities`
- Removes the test component, verifies entity is cleaned up (`viewer.entities.length` returns to original)
- Verifies `usePreRender` callback fires (set a flag on first call)
- Prints `✓ Phase 1 complete` or lists failures

**Done when:** Globe renders via SolidJS, all hooks work, entities create/destroy properly.

---

## Phase 2: Store Foundation

**Goal:** All centralized stores exist and are reactive. Stores are tested independently of any UI or layer.

**Depends on:** → Phase 0 (no Cesium dependency for pure store logic)

### Tasks

- [x] Create `src/stores/layers.ts`
  - `createStore` with layer visibility map: `{ satellites: bool, flights: bool, ships: bool, ground: bool }`
  - `toggleLayer(id)`, `setLayerEnabled(id, bool)` mutations
- [x] Create `src/stores/selection.ts`
  - `createStore` with `{ type, id, data }` as per PRD
  - `selectEntity(type, id)`, `clearSelection()` mutations
  - Structured for future event-sourcing (mutations go through named functions)
- [x] Create `src/stores/camera.ts`
  - `createStore` with `{ mode, target, position }` (mode: 'free' | 'follow' | 'orbit')
  - `setFollowTarget(type, id)`, `setFreeCamera()` mutations
- [x] Create `src/stores/ui.ts`
  - `createStore` with `{ leftPanelOpen, rightPanelOpen, commandMode, currentCity }`
  - Toggle mutations
- [x] Create `src/stores/shaders.ts`
  - `createStore` with `{ active, intensity, parameters }` as per PRD
  - `setShader(name)`, `setIntensity(n)` mutations
  - Port parameter mapping from `src/shaders/types.ts`

### Verification

**Script:** `scripts/verify-phase2.ts`
- Imports each store directly (no browser needed, pure SolidJS reactivity)
- For each store:
  - Reads initial state, asserts defaults are correct
  - Calls mutations, asserts state changes
  - Uses `createEffect` to verify reactivity (effect fires on mutation)
- Runs via `bun scripts/verify-phase2.ts`
- Prints `✓ Phase 2 complete` or lists failures

**Done when:** All 5 stores are importable, mutations work, reactivity fires correctly.

---

## Phase 3: Layer Registry & System

**Goal:** A typed layer registration system exists. Layers can be registered, queried by ID, and their visibility is controlled by the layers store.

**Depends on:** → Phase 2 (needs layers store)

### Tasks

- [x] Create `src/layers/registry.ts`
  - `LayerDefinition` type: `{ id, name, icon, component, store?, defaultEnabled }`
  - `registerLayer(def)` function: adds to internal map
  - `getLayer(id)`, `getAllLayers()`, `getEnabledLayers()` queries
  - Wire `defaultEnabled` into the layers store initial state
- [x] Create `src/layers/LayerRenderer.tsx`
  - SolidJS component that reads layers store
  - For each enabled layer, renders its `component`
  - Uses `<Show>` / `<For>` for conditional rendering
  - Handles mount/unmount cleanly (layer components `onCleanup`)
- [x] Create stub layer components for initial testing:
  - `src/layers/satellites/SatelliteLayer.tsx` — empty component, logs mount/unmount
  - `src/layers/flights/FlightLayer.tsx` — empty component, logs mount/unmount
  - `src/layers/ships/ShipLayer.tsx` — empty component, logs mount/unmount
  - `src/layers/ground/GroundLayer.tsx` — empty component, logs mount/unmount
- [x] Create registration files for each layer:
  - `src/layers/satellites/index.ts` — calls `registerLayer()`
  - `src/layers/flights/index.ts`
  - `src/layers/ships/index.ts`
  - `src/layers/ground/index.ts`
- [x] Wire `<LayerRenderer>` into `App.tsx` inside `<CesiumProvider>`

### Verification

**Script:** `scripts/verify-phase3.ts`
- Imports registry, asserts all 4 layers are registered
- Toggles layer visibility in store, asserts `getEnabledLayers()` reflects change
- In a test render context: mounts `<LayerRenderer>`, verifies enabled layers' components are in the tree
- Disables a layer, verifies its component unmounts (cleanup logged)
- Prints `✓ Phase 3 complete` or lists failures

**Done when:** Registry has 4 layers, toggling store controls rendering, components mount/unmount cleanly.

---

## Phase 4: Satellite Layer Migration

**Goal:** Satellites render on the globe via SolidJS with full feature parity: TLE fetch, SGP4 propagation, billboard rendering, category filtering, selection, follow mode, orbital paths.

**Depends on:** → Phase 1 (Cesium bindings), → Phase 3 (layer system)

### Tasks

- [x] Create `src/layers/satellites/store.ts`
  - Satellite-specific store: `{ records, hiddenCategories, followingNoradId, lastUpdated }`
  - Mutations: `setSatellites(records)`, `toggleCategory(cat)`, `followSatellite(id)`
- [x] Implement `src/layers/satellites/SatelliteLayer.tsx`
  - Port TLE fetch logic — **use `PROXY_BASE_URL` from config.ts** (Blocklist #6)
  - Port SGP4 propagation loop (use `usePreRender` for per-frame position updates)
  - **Use `createBillboardCollection`** — NOT Entity API (Blocklist #3)
  - Port satellite texture generation (single canvas sprite, GPU color tinting per category)
  - Port category filtering (reactive: hidden categories from store filter billboards)
  - Port selection handling (click billboard → update selection store)
  - **Use `useFollowMode` hook** — NOT copy-pasted preRender listener (Blocklist #5)
  - Port orbital path rendering
  - All listeners cleaned up via `onCleanup`
- [x] Wire satellite store data into the selection store when a satellite is selected
- [x] Verify proxy `/tle` endpoint still serves TLE data

### Verification

**Script:** `scripts/verify-phase4.ts`
- Starts dev server + proxy server
- Fetches `/tle?group=stations` from proxy, asserts valid TLE data returned
- In browser context (or headless check):
  - Asserts satellite store has records after initial load
  - Asserts billboard collection is non-empty
  - Toggles a category off, asserts billboard count decreases
  - Simulates satellite selection, asserts selection store updates
- Alternatively: run `scripts/sgp4-smoke.ts` (existing) to verify propagation math
- Prints `✓ Phase 4 complete` or lists failures

**Done when:** Satellites render, propagate, filter, select, and follow — all via SolidJS reactivity.

---

## Phase 5: Flight Layer Migration

**Goal:** Live flights render on the globe with full parity: OpenSky data, 3D aircraft models, dead-reckoning interpolation, selection, follow mode, route lookup.

**Depends on:** → Phase 1 (Cesium bindings), → Phase 3 (layer system)

### Tasks

- [x] Create `src/layers/flights/store.ts`
  - Flight-specific store: `{ flights, selectedIcao24, followingIcao24, lastUpdated }`
  - Mutations: `setFlights(records)`, `selectFlight(icao24)`, `followFlight(icao24)`
- [x] Implement `src/layers/flights/FlightLayer.tsx`
  - Port OpenSky fetch + polling — **use `PROXY_BASE_URL` from config.ts** (Blocklist #6)
  - Port entity creation with 3D aircraft models — **use local `/models/aircraft.glb`** (Blocklist #4)
  - Entity API is acceptable here (MAX_VISIBLE_FLIGHTS = 50, 3D models need Entity)
  - Port dead-reckoning interpolation (use `usePreRender`)
  - **Position updates via `property.setValue()`** — never allocate new ConstantPositionProperty (Blocklist #1)
  - Port label rendering (callsign, altitude, speed)
  - Port frustum culling for performance
  - Port selection → update selection store
  - **Use `useFollowMode` hook** — NOT copy-pasted preRender listener (Blocklist #5)
  - Cleanup all entities and listeners via `onCleanup`
- [x] Wire flight data into selection store
- [x] Verify proxy `/flights` and `/flight-route/:callsign` endpoints work

### Verification

**Script:** `scripts/verify-phase5.ts`
- Starts proxy, fetches `/flights`, asserts valid flight state vectors
- Asserts flight store populates after initial fetch
- Asserts entities are created in viewer
- Simulates flight selection, asserts selection store updates
- Runs existing `scripts/flights-proxy-smoke.ts` for proxy verification
- Prints `✓ Phase 5 complete` or lists failures

**Done when:** Flights render with 3D models, interpolate, select, and follow — all reactive.

---

## Phase 6: Ship Layer Migration

**Goal:** Ships render on the globe with full parity: AISStream WebSocket data, billboard icons, viewport-based loading, selection, follow mode.

**Depends on:** → Phase 1, → Phase 3

**Critical fix from old code:** The old implementation used Entity API for 100 ships (200+ draw calls). This migration MUST use `BillboardCollection` + `LabelCollection` like satellites.

### Tasks

- [x] Create `src/layers/ships/store.ts`
  - Ship-specific store: `{ ships, selectedMmsi, followingMmsi, isRateLimited, lastBbox }`
  - Mutations: `setShips(records)`, `selectShip(mmsi)`, `followShip(mmsi)`, `setRateLimited(bool)`
- [x] Implement `src/layers/ships/ShipLayer.tsx`
  - Port ship data fetching — **use `PROXY_BASE_URL` from config.ts** (Blocklist #6)
  - Port viewport bbox calculation (use `useCamera` for camera changes)
  - **Use `createBillboardCollection`** — NOT Entity API (Blocklist #3)
  - **Use separate `LabelCollection`** for ship names (primitive-level, not Entity labels)
  - Port canvas-drawn ship icons (5 types, cached, GPU color tinting)
  - Port heading rotation on billboards via `billboard.rotation`
  - Port selection handling → update selection store
  - **Use `useFollowMode` hook** (Blocklist #5)
  - **Interpolate ALL visible ships** — old code only interpolated 60/100, causing visual freezing
  - Cleanup all primitives and listeners via `onCleanup`
- [x] Wire ship data into selection store
- [x] Verify proxy `/ships` endpoint + AISStream WebSocket relay work

### Verification

**Script:** `scripts/verify-phase6.ts`
- Starts proxy, fetches `/ships?bbox=...`, asserts valid response
- Asserts ship store populates
- Asserts billboards are created
- Simulates selection, asserts store updates
- Prints `✓ Phase 6 complete` or lists failures

**Done when:** Ships render, update from AIS feed, select, and follow — all reactive.

---

## Phase 7: Ground Layer Migration

**Goal:** Ground features (traffic particles, CCTV cameras, earthquakes) render with full parity.

**Depends on:** → Phase 1, → Phase 3

### Tasks

- [x] Create `src/layers/ground/store.ts`
  - Ground-specific store: `{ trafficEnabled, cctvEnabled, seismicEnabled, earthquakes, cctvCameras }`
  - Mutations: `toggleSubLayer(name)`, `setEarthquakes(data)`, `setCameras(data)`
- [x] Implement traffic sub-layer:
  - Port `TrafficParticleSystem.ts`, `OSMFetcher.ts`, `RoadNetwork.ts`
  - Wrap in reactive component, use `usePreRender` for particle animation
  - Cleanup particles on unmount
- [x] Implement CCTV sub-layer:
  - Port `CCTVManager.ts`, `CCTVBillboard.ts`
  - **Use `BillboardCollection`** for camera markers (Blocklist #3)
  - **NO `toDataURL()` for texture updates** — pass canvas directly to billboard image (Blocklist #2)
  - Reactive billboard management
  - Port center-stage mode for video viewing
  - Cleanup on unmount
- [x] Implement seismic sub-layer:
  - Port `EarthquakeLayer.ts`, `USGSFetcher.ts`, `RingAnimation.ts`
  - Reactive entity creation for earthquakes
  - Ring animation via `usePreRender`
  - Cleanup on unmount
- [x] Create `src/layers/ground/GroundLayer.tsx` orchestrator
  - Renders sub-layers based on ground store toggles
  - Uses `<Show>` for conditional sub-layer rendering
- [x] Verify proxy endpoints: `/api/cctv/cameras`, `/api/cctv/stream/:id`, `/api/osm`

### Verification

**Script:** `scripts/verify-phase7.ts`
- Fetches CCTV cameras from proxy, asserts valid data
- Fetches USGS earthquake data, asserts valid GeoJSON
- Asserts ground store initializes correctly
- Toggles sub-layers, verifies only enabled sub-layers render primitives
- Prints `✓ Phase 7 complete` or lists failures

**Done when:** All ground features render, toggle independently, and clean up on unmount.

---

## Phase 8: UI Shell & Layout

**Goal:** The full UI shell renders via SolidJS: top bar, left panel, right panel, bottom bar. Layer toggles work. All UI reads from stores.

**Depends on:** → Phase 2 (stores), → Phase 3 (layer registry for toggle list)

### Tasks

- [x] Create `src/App.tsx`
  - Root component: `<CesiumProvider>` → `<Shell>` → `<LayerRenderer>`
- [x] Create `src/ui/Shell.tsx`
  - Port layout from `src/ui/shell.ts`
  - Top bar: classification watermark, clock, telemetry counters
  - Compass, vignette overlay
  - Reads UI store for panel visibility
  - Keyboard shortcuts via `onMount` / `onCleanup`
- [x] Create `src/ui/LeftPanel.tsx`
  - Port from `src/ui/left-panel.ts`
  - City selector (reads from `pois.json`)
  - POI navigation
  - Layer toggles (reads layer registry, toggles layers store)
  - CCTV panel integration
- [x] Create `src/ui/RightPanel.tsx`
  - Port from `src/ui/right-panel.ts`
  - Shader/effect controls (reads/writes shaders store)
  - Live readouts: lat/lng/alt/GSD/NIIRS (reads camera store or computes from viewer)
- [x] Create `src/ui/BottomBar.tsx`
  - Port from `src/ui/bottom-bar.ts`
  - Mode switcher tabs
  - City tabs
  - Location tooltip (coordinates under cursor)
- [x] Port `src/ui/performance-monitor.ts` as a SolidJS component
- [x] Ensure all UI updates are reactive (no manual DOM manipulation)

### Verification

**Script:** `scripts/verify-phase8.ts`
- Starts dev server, fetches page
- Asserts key DOM elements exist: `.top-bar`, `.left-panel`, `.right-panel`, `.bottom-bar`
- Asserts clock updates (text content changes over 2 seconds)
- Asserts layer toggle buttons exist for all registered layers
- Simulates UI store mutation (toggle left panel), asserts DOM reflects change
- Prints `✓ Phase 8 complete` or lists failures

**Done when:** Full UI shell renders via SolidJS, all panels respond to store changes.

---

## Phase 9: Info Panels & Selection UI

**Goal:** Selecting an entity (satellite, flight, ship) shows the correct info panel with detail data. Command bar works.

**Depends on:** → Phase 8 (UI shell), → Phase 4/5/6 (layers populate selection store)

### Tasks

- [x] Create `src/ui/panels/SatelliteInfo.tsx`
  - Port from `src/ui/sat-info-panel.ts`
  - Reads selection store, displays satellite metadata
  - Follow button writes to camera store
- [x] Create `src/ui/panels/FlightInfo.tsx`
  - Port from `src/ui/flight-info-panel.ts`
  - Reads selection store, displays flight metadata
  - Route info from `/flight-route/:callsign`
  - Follow button
- [x] Create `src/ui/panels/ShipInfo.tsx`
  - Port from `src/ui/ship-info-panel.ts`
  - Reads selection store, displays ship metadata
  - Follow button
- [x] Create `src/ui/CommandBar.tsx`
  - Port from `src/ui/command-bar.ts` + `src/ui/command-parser.ts`
  - Vim-style `:goto`, `:follow`, `:home`, `:help` commands
  - Reads/writes to camera store, selection store
  - Activates on `:` key, reads from UI store `commandMode`
- [x] Wire `<RightPanel>` to show correct info panel based on `selection.type`
- [x] Wire command bar into Shell

### Verification

**Script:** `scripts/verify-phase9.ts`
- Programmatically set selection store to `{ type: 'satellite', id: '25544' }`
- Assert `SatelliteInfo` component renders with ISS data
- Set selection to `{ type: 'flight', id: 'abc123' }`
- Assert `FlightInfo` renders
- Clear selection, assert no info panel shown
- Test command parser: `parseCommand(':goto NYC')` returns correct structure
- Prints `✓ Phase 9 complete` or lists failures

**Done when:** All info panels render correctly based on selection, command bar parses and executes commands.

---

## Phase 10: Shader System Migration

**Goal:** All 4 shader effects (CRT, NVG, FLIR, AH-64) work reactively. Switching and intensity are controlled via the shaders store.

**Depends on:** → Phase 1 (Cesium bindings for post-processing), → Phase 2 (shaders store)

### Tasks

- [x] Create `src/shaders/index.ts`
  - Shader registry: maps shader names to their `PostProcessStage` configurations
  - Port `ShaderManager` crossfade logic as a reactive effect
- [x] Port shader GLSL files:
  - `src/shaders/crt.ts` — CRT effect (scanlines, chromatic aberration, barrel distortion)
  - `src/shaders/nvg.ts` — Night vision goggles
  - `src/shaders/flir.ts` — Forward-looking infrared
  - `src/shaders/ah64.ts` — Apache HUD overlay
  - `src/shaders/normal.ts` — Pass-through (shader off)
- [x] Create reactive shader effect:
  - `createEffect` watches `shaderState.active`
  - On change: remove old `PostProcessStage`, add new one with crossfade
  - **Parameter changes MUST modify uniform values on existing stage** — never recreate stage (Blocklist #9)
  - Cleanup all stages on `onCleanup`
- [ ] Wire shader controls in `RightPanel.tsx` to shaders store

### Verification

**Script:** `scripts/verify-phase10.ts`
- Asserts all shaders are registered (4 + normal)
- Sets `shaderState.active = 'crt'`, asserts `scene.postProcessStages` has CRT stage
- Sets `shaderState.active = 'nvg'`, asserts stage swapped
- Sets `shaderState.active = null`, asserts no custom stages
- Sets `shaderState.intensity = 0.5`, asserts uniform updated
- Prints `✓ Phase 10 complete` or lists failures

**Done when:** All shaders apply/remove reactively, intensity slider works, crossfade transitions work.

---

## Phase 11: Backend Refactor

**Goal:** Proxy server is restructured with Bun.serve route map, TTL caching, request coalescing, and consistent patterns. This is a significant improvement, not just cleanup.

**Depends on:** Nothing (independent of frontend phases, but best done after frontend is stable)

### Tasks

- [x] Create `src/server/cache.ts`
  - `TTLCache<K, V>` class with configurable TTL and optional LRU eviction
  - `coalesce<T>(key, fetcher)` — if a fetch is in-flight for `key`, return the same promise
  - Used by TLE (5min), OpenSky (10s), Geocode (LRU)
  - **This eliminates upstream rate-limit exhaustion** (Blocklist #8)
- [x] Create `src/server/middleware.ts`
  - `withErrorBoundary(handler)` — catches all errors, returns consistent error response
  - `withCORS(handler)` — adds CORS headers
  - `withLogging(handler)` — request/response logging
- [x] Create `src/server/types.ts`
  - Extend existing response helpers: add `errorResponse(message, status)`, `imageResponse(data, type)`, `textResponse(text)`
  - Standardize error shape: always `{ error: string, status: number }`
- [x] Refactor `src/server/index.ts`
  - **Use Bun.serve `routes` object** — NOT if/else chain (Blocklist #7)
  - Move Google Tiles to explicit `/tiles/:z/:x/:y` — no catch-all
  - Apply middleware to all handlers
- [x] Refactor `src/server/routes/tle.ts`
  - Add 5-minute TTL cache per group
  - Add request coalescing for concurrent identical fetches
- [x] Refactor `src/server/routes/flights.ts`
  - Add 10-second TTL cache for OpenSky `/states/all`
  - **Transform data server-side**: strip unused fields, filter ground-only aircraft
  - Add LRU eviction to metadata cache (was unbounded)
- [x] Refactor `src/server/routes/geocode.ts`
  - Add LRU cache (max 1000 entries)
  - Standardize error response shape to match other endpoints
- [x] Refactor `src/server/routes/cctv.ts`
  - Use `imageResponse()` helper instead of manual Response construction
  - Remove `as unknown as BlobPart` casts (Blocklist #11)
- [x] Refactor `src/server/websocket/ships.ts` (AISStream)
  - Add heartbeat monitoring: if no message in 30s, force reconnect
  - Add parse-error counter instead of silent catch
- [x] Verify all CCTV responses use `corsResponse()` helper (5 instances currently bypass it)

### Verification

**Script:** `scripts/verify-phase11.ts`
- Starts proxy server
- Hits every endpoint with valid and invalid parameters:
  - `GET /health` → 200
  - `GET /tle?group=stations` → valid TLE, response is cached (2nd request instant)
  - `GET /flights` → valid JSON, response is cached
  - `GET /ships?bbox=...` → valid JSON
  - `GET /geocode?q=NYC` → valid JSON, response is cached
  - `GET /api/cctv/cameras` → valid JSON
  - `GET /tiles/0/0/0` → proxied tile (not catch-all)
  - Invalid requests → proper error responses with consistent shape (not 500s)
- Verifies CORS headers present on all responses
- Verifies cache hit on second identical request (timing check)
- Prints `✓ Phase 11 complete` or lists failures

**Done when:** All proxy endpoints respond correctly, caching works, no if/else routing, consistent error shapes.

---

## Phase 12: Cleanup & Removal of Old Code

**Goal:** Remove all vanilla TypeScript code that has been replaced. Only SolidJS code and the proxy remain.

**Depends on:** → All previous phases (4-11)

### Tasks

- [x] Remove old frontend files:
  - `src/main.ts` (replaced by `src/index.tsx`)
  - `src/globe.ts` (replaced by `CesiumProvider`)
  - `src/camera.ts` (replaced by `useCamera`)
  - `src/pois.ts` (data moved, logic in UI components)
  - `src/geocoder.ts` (inlined into CommandBar.tsx)
  - `src/errors.ts` (no longer used)
  - `src/layers/satellites.ts` (replaced by SolidJS layer)
  - `src/layers/flights.ts` (replaced by SolidJS layer)
  - `src/layers/ships.ts` (replaced by SolidJS layer)
  - `src/layers/mapView.ts` (replaced or integrated)
  - `src/ground/` old manager files removed, utilities kept for new layers
  - `src/shaders/index.ts` simplified to export only SolidJS system
  - `src/ui/*.ts` old files (replaced by SolidJS UI components)
- [x] Remove `src/proxy/` directory (replaced by `src/server/`)
- [x] Remove `src/proxy.ts` re-export file
- [x] Update `public/index.html` to remove unused cesium-container div
- [x] Update scripts in `scripts/` that reference old code (flights-acceptance.ts)
- [x] Verify no dead imports or broken references remain

### Verification

**Script:** `scripts/verify-phase12.ts`
- Run `bunx tsc --noEmit` — assert no TypeScript errors
- Run `bun build` — assert production build succeeds
- Grep for imports of deleted files — assert none found
- Start dev server, load page — assert app works
- Start proxy — assert all endpoints work
- Prints `✓ Phase 12 complete` or lists failures

**Done when:** No old code remains, everything compiles, app is fully functional.

---

## Phase 13: Integration Testing & Polish

**Goal:** End-to-end verification that every feature works. Performance audit. Resource leak check.

**Depends on:** → Phase 12

### Tasks

- [x] Full feature walkthrough test:
  - Globe renders with 3D tiles
  - Satellites load, propagate, render, filter by category
  - Flights load, render with 3D models, interpolate
  - Ships load, render, update from AIS feed
  - Ground features: traffic particles, CCTV cameras, earthquakes
  - Selection works for all entity types (click → info panel)
  - Follow mode works for satellites, flights, ships
  - Shader effects: cycle through all 4, verify visual change
  - Command bar: `:goto NYC`, `:follow ISS`, `:home`
  - Layer toggles: disable/enable each layer
  - Panel toggles: open/close left and right panels
- [x] Performance audit:
  - Check FPS with all layers enabled
  - Profile memory with DevTools
  - Verify no unbounded growth (entity accumulation)
  - Check bundle size
- [x] Resource leak verification:
  - Enable a layer, disable it, re-enable — check entity count returns to expected
  - Follow a satellite, unfollow — check preRender listener count
  - Open CCTV stream, close — check no orphan HLS players
- [x] Tech debt blocklist audit:
  - Grep for `new ConstantPositionProperty` — assert 0 matches in per-frame code
  - Grep for `toDataURL` — assert 0 matches in CCTV texture code
  - Grep for `localhost:3001` — assert 0 matches (all URLs via config.ts)
  - Verify ships use BillboardCollection, not Entity API
  - Verify follow mode uses shared hook, not copy-pasted listeners
- [x] UI polish:
  - Verify all CSS applies correctly (import `styles.css`)
  - Check keyboard shortcuts all work
  - Verify clock updates, counters update
  - Check responsive behavior of panels

### Verification

**Script:** `scripts/verify-phase13.ts` (comprehensive)
- Runs all previous verification scripts in sequence
- Additional checks:
  - Memory snapshot before/after layer toggle cycle
  - Entity count assertions after enable/disable cycles
  - FPS measurement (log warning if < 30fps with all layers)
- Prints full report with per-phase status
- Runs tech debt blocklist checks (grep for anti-patterns)
- Prints `✓ Phase 13 complete — MIGRATION DONE` or lists remaining issues

**Done when:** All features work, no resource leaks, performance acceptable, all verification scripts pass, tech debt blocklist has 0 violations.

---

## Dependency Graph

```
Phase 0 (Bootstrap)
  ├── Phase 1 (Cesium Bindings)  ──────────────────┐
  ├── Phase 2 (Stores)                              │
  │     ├── Phase 3 (Layer Registry) ←── Phase 2    │
  │     │     ├── Phase 4 (Satellites) ←── 1, 3     │
  │     │     ├── Phase 5 (Flights)    ←── 1, 3     │
  │     │     ├── Phase 6 (Ships)      ←── 1, 3     │
  │     │     └── Phase 7 (Ground)     ←── 1, 3     │
  │     └── Phase 8 (UI Shell)   ←── 2, 3           │
  │           └── Phase 9 (Info Panels) ←── 8, 4-6  │
  └── Phase 10 (Shaders)        ←── 1, 2            │
                                                     │
Phase 11 (Backend Refactor) ←── independent          │
                                                     │
Phase 12 (Cleanup)          ←── all of 4-11          │
  └── Phase 13 (Integration) ←── 12                  │
```

**Parallelism opportunities:**
- Phases 1 and 2 can run in parallel (after Phase 0)
- Phases 4, 5, 6, 7 can run in parallel (after Phases 1 + 3)
- Phase 10 can run in parallel with Phases 4-7
- Phase 11 can run at any time independently

---

## Estimated Effort Summary

| Phase | Description | Relative Size | Notes |
|-------|-------------|---------------|-------|
| 0 | Bootstrap | Small | + config.ts, local model, .env.example |
| 1 | Cesium Bindings | Medium | + useFollowMode, createBillboardCollection, createPointCollection |
| 2 | Stores | Small | |
| 3 | Layer Registry | Small | |
| 4 | Satellites | Large | Uses BillboardCollection, useFollowMode |
| 5 | Flights | Large | Entity API OK (50 items), property mutation |
| 6 | Ships | Medium→Large | **Major change:** BillboardCollection instead of Entity API |
| 7 | Ground | Large | CCTV texture fix (no toDataURL) |
| 8 | UI Shell | Medium | |
| 9 | Info Panels | Medium | |
| 10 | Shaders | Medium | Uniform mutation instead of stage recreation |
| 11 | Backend Refactor | Small→Medium | **Major change:** caching, route map, middleware |
| 12 | Cleanup | Small | |
| 13 | Integration | Medium | + tech debt blocklist audit |

---

## Tech Debt Blocklist Reference

These patterns from the old codebase must NEVER appear in the new code. Phase 13 includes automated checks.

1. `new ConstantPositionProperty()` or `new ConstantProperty()` in loop/per-frame
2. `canvas.toDataURL()` for billboard texture updates
3. Entity API for layers with >50 items
4. Remote URLs for bundled assets
5. Copy-pasted follow-mode preRender listeners
6. Hardcoded `localhost:3001` or any proxy URL literal
7. `if/else` route chain in server code
8. Upstream API calls without server-side caching
9. `PostProcessStage` recreation for parameter-only changes
10. Module-level mutable singletons for state
11. `as unknown as BlobPart` or similar unsafe casts
