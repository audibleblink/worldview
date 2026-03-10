# SolidJS Migration Regression Fixes — Design Spec

**Date:** 2026-03-09  
**Status:** Approved  
**Branch strategy:** 5 parallel git worktrees, one per regression group

---

## Context

The app was recently migrated from vanilla TypeScript to SolidJS. Eight regressions were identified. This spec describes the root cause and fix for each, grouped into five parallel worktrees that can be executed simultaneously.

---

## Worktree 1 — `wt-follow`: Camera Follow Mode

### Regressions Covered
- Following a satellite no longer jumps to a centered view of that satellite
- Following doesn't move the viewport as the satellite moves
- Verify this logic is shared and working with planes and boats

### Root Cause Analysis

**`useFollowMode` hook** (`src/cesium/hooks/useFollowMode.ts`): The `track()` call starts follow mode, but on the first frame `lastCamPos` is `null`. The `camera.lookAt()` call in `usePreRender` should teleport the camera immediately. However, the position getter passed in may return `null` for the first frame or two (position cache not yet populated).

**Satellites** (`src/layers/satellites/SatelliteLayer.tsx`):
- `startFollowMode()` calls `track(() => satellitePositions.get(noradId) ?? null)` — this is correct only if `satellitePositions` has been populated. The first call to `propagateAll()` fills `satellitePositions`, so it should be populated by the time the user double-clicks. But if `selectSatellite()` is called from the command bar (external selection) before propagation runs, the position won't be cached.
- The `selectSatellite()` function doesn't do an initial `flyTo` jump before starting follow mode. The old vanilla code likely called `camera.flyTo()` first, then switched to `lookAt`-based follow. The SolidJS version skips the initial jump entirely.

**Flights** (`src/layers/flights/FlightLayer.tsx`):
- `startFollowingFlight()` passes `getCurrentPosition()` as the position getter, which reads from `interpolatedPositions`. This should work correctly. The `useGroundLevel: true` option targets ground level, which is correct for approach/departure views.
- No initial flyTo jump either.

**Ships** (`src/layers/ships/ShipLayer.tsx`):
- `startFollowMode()` passes `() => interpolatedPositions.get(mmsi) ?? null`. Looks correct.
- Same missing initial jump.

### Fix Plan

1. **Add initial flyTo jump** before activating follow mode in all three layers. When follow mode starts, call `camera.flyTo(target, { duration: 1.5 })` then activate follow. Use a short duration (1-2s) so the transition is smooth.
2. **Warm up satellite positions** — in `SatelliteLayer.startFollowMode()`, if `satellitePositions.get(noradId)` is null, compute the position immediately inline before calling `track()`.
3. **Verify follow loop** — ensure `usePreRender` callback is running and not short-circuiting. Add a console.log to confirm.
4. **Fix the `useFollowMode` initial frame** — on the first frame when `lastCamPos` is null, immediately apply `lookAt` without the orbit detection check (since there's no previous position to compare against). This is already the case in current code (the `if (lastCamPos !== null)` guard is correct), but verify it.

### Files to Touch
- `src/cesium/hooks/useFollowMode.ts`
- `src/layers/satellites/SatelliteLayer.tsx`
- `src/layers/flights/FlightLayer.tsx`
- `src/layers/ships/ShipLayer.tsx`

---

## Worktree 2 — `wt-citynav`: City/POI Navigation

### Regressions Covered
- Jumping/flying to cities no longer works

### Root Cause Analysis

`LeftPanelComponent.tsx` has `handleCityChange()`, `handlePrevPOI()`, and `handleNextPOI()` which update local state and add log entries — but **never call any camera movement function**. The POI data has `lat`, `lng`, `altitude`, and `pitch` fields, all of which are needed for a `flyTo`. This camera call was dropped entirely during migration.

Additionally, the CommandBar's `handleGoto` geocoding path uses the proxy's `/geocode` endpoint correctly, but calls `flyTo` with `longitude` first, `latitude` second — verify argument order matches Cesium's `flyTo` destination.

### Fix Plan

1. In `LeftPanel`, add a `flyToPOI(poi: POI)` function that calls `viewer().camera.flyTo(...)` using the poi's `lat`, `lng`, `altitude`, and `pitch`.
2. Call `flyToPOI` in `handleCityChange` (fly to first POI of new city) and in `handlePrevPOI`/`handleNextPOI` (fly to newly selected POI).
3. The `useCesium()` hook is not currently imported in `LeftPanelComponent`. Import it, destructure `viewer`, and use it.
4. Confirm CommandBar's `flyTo` argument order is correct: `flyTo(longitude, latitude, height)` → Cesium.Cartesian3.fromDegrees(longitude, latitude, height). This looks correct.

### Files to Touch
- `src/ui/LeftPanelComponent.tsx`

---

## Worktree 3 — `wt-planes`: Planes Don't Render

### Regressions Covered
- Planes don't render

### Root Cause Analysis

`FlightLayer` uses `LOCAL_ASSETS.aircraftModel = "/models/aircraft.glb"` as the 3D model URI for Cesium entities. The file exists at `public/models/aircraft.glb`. The dev server serves `public/` at root, so `/models/aircraft.glb` should resolve correctly.

Likely causes to investigate:
1. **Cesium Entity model loading** — Cesium resolves model URIs relative to the page URL. `/models/aircraft.glb` is an absolute path which should work.
2. **GLTF validation** — The `.glb` file may be corrupted or incompatible with Cesium's GLTF loader.
3. **minimumPixelSize vs scale** — `MODEL_SCALE = 50` may make the model invisible at high altitude (too small). With `minimumPixelSize: 64`, models should always be at least 64px — but if the model itself has issues, nothing will render.
4. **Entity API vs BillboardCollection** — Flights use `v.entities.add()` with a model, while satellites and ships use BillboardCollection. The Entity API works differently. Check if the entities are being added but the model fails silently.
5. **OpenSky data returning empty** — If the `/flights` endpoint is failing or returning no states, no entities get added. Check if the API is returning data.

### Fix Plan

1. Add console logging to confirm entities are being added: log the entity count after `refreshFlights()`.
2. If entities are added but invisible: try replacing the GLTF model with a simple `point` or `billboard` fallback temporarily to confirm the entity positioning is correct.
3. If the model file is the issue: re-export or replace `aircraft.glb` with a known-good Cesium-compatible model.
4. If OpenSky data is the issue: the proxy server may have changed the response format. Log raw API response and verify `data.states` is present and non-empty.
5. Consider switching flights to BillboardCollection (like ships/satellites) if the Entity API model loading remains problematic — this also improves performance.

### Files to Touch
- `src/layers/flights/FlightLayer.tsx`
- `public/models/aircraft.glb` (if model replacement needed)
- `src/server/` (if proxy endpoint format changed)

---

## Worktree 4 — `wt-layers-default`: Layer Default State

### Regressions Covered
- Default all layers to off on initial load
- When turning satellites on, sub-layers should show and be enabled with the exception of Starlink, which should be off

### Root Cause Analysis

**All layers default to `true`:**
- `src/stores/layers.ts`: `initialState` sets `satellites: true, flights: true, ships: true, ground: true`.
- `src/layers/ground/store.ts`: `initialState` sets `trafficEnabled: true, cctvEnabled: true, seismicEnabled: true`.

**Satellite sub-layer (category) initialization:**
- `src/layers/satellites/store.ts`: `hiddenCategories` defaults to `new Set()` (all visible).
- When the satellite layer is toggled on, no code runs to set Starlink as hidden by default.
- The `SatelliteLayer` component loads all categories on mount and creates billboards for all. There's no "on enable" initialization hook.

### Fix Plan

1. **`src/stores/layers.ts`**: Change all layer defaults to `false`.
2. **`src/layers/ground/store.ts`**: Change `trafficEnabled`, `cctvEnabled`, `seismicEnabled` to `false`.
3. **Satellite category init**: When the satellite layer is first enabled (`layers.satellites` goes from `false` to `true`), initialize `hiddenCategories` with `new Set(["starlink"])`.
   - In `SatelliteLayer.tsx`, add a `createEffect` that watches `layers.satellites`. On first activation, call `setCategoryVisible("starlink", false)`.
   - Alternatively, change the satellite store's `initialState.hiddenCategories` to `new Set(["starlink"])` — but this only works if the layer starts disabled (since the billboard creation effect also checks `hiddenCategories`).
4. **Left panel sub-layers**: When satellites are turned on, the UI should show sub-layer toggles. The current LeftPanel only shows ground sub-layer toggles. Add satellite sub-layer toggles (by category) that reflect `hiddenCategories`.
   - The LeftPanel already has a `<Show when={config.id === "ground" && layers.ground}>` pattern. Add a similar pattern for satellites showing category toggles.

### Files to Touch
- `src/stores/layers.ts`
- `src/layers/ground/store.ts`
- `src/layers/satellites/SatelliteLayer.tsx`
- `src/layers/satellites/store.ts`
- `src/ui/LeftPanelComponent.tsx`

---

## Worktree 5 — `wt-cctv`: Traffic Cameras & CCTV Feature

### Regressions Covered
- Traffic cameras aren't showing on the ground layer
- The whole-ass CCTV feature is missing

### Root Cause Analysis

**Traffic cameras not showing:**
- `CCTVLayer.tsx` exists and is wired into `GroundLayer.tsx`. It's mounted when `groundState.cctvEnabled` is true.
- With the fix from wt-layers-default, CCTV starts off. When enabled, it fetches cameras in viewport and renders markers.
- The likely issue: `PROXY_ENDPOINTS.cctvCameras = /api/cctv/cameras` — this backend endpoint may not be implemented in the proxy server, or may return an empty array or error.
- The `getViewportBbox()` function requires the camera to be looking at the ground. If the camera is looking at sky/space, `globe.pick()` returns null and bbox cannot be computed → no fetch.

**CCTV feature "missing":**
- `CCTVLayer.tsx` renders camera markers. The "center stage" feature (clicking a camera to view its video feed) is defined in `groundState.centerStageCameraId` but there's no UI component that displays the video. The store has `setCenterStageCamera()` but `CCTVLayer` doesn't have a click handler that sets it, and no panel displays CCTV video.
- Looking at the old `dev` branch would clarify what the CCTV UI looked like, but based on the store/config structure, there should be a CCTV video panel that opens when a camera is selected.

### Fix Plan

1. **Verify proxy endpoint**: Check `src/server/` for a `/api/cctv/cameras` handler. If missing, the endpoint needs to be added (fetching from a CCTV data source).
2. **Debug viewport bbox**: Add logging when `getViewportBbox()` returns null to identify if the camera angle is the issue.
3. **Add CCTV click handler**: In `CCTVLayer.tsx`, add a `ScreenSpaceEventHandler` for `LEFT_CLICK` that picks billboards from the camera marker collection and calls `setCenterStageCamera(camera.id)`.
4. **Add CCTV video panel**: Create a UI component (panel or overlay) that shows when `groundState.centerStageCameraId` is non-null. It should display:
   - Camera name
   - Live stream via HLS.js (using `PROXY_ENDPOINTS.cctvStream(id)`)
   - Thumbnail fallback (using `PROXY_ENDPOINTS.cctvThumbnail(id)`)
   - Close button that calls `setCenterStageCamera(null)`
5. **Wire panel into Shell**: Add the CCTV panel to `ShellComponent.tsx` or `GroundLayer.tsx`.

### Files to Touch
- `src/layers/ground/CCTVLayer.tsx`
- `src/layers/ground/store.ts`
- `src/ui/` (new CCTV panel component)
- `src/ui/ShellComponent.tsx`
- `src/server/` (verify/add CCTV proxy routes)

---

## Execution Strategy

All five worktrees are independent and can be executed in parallel by separate subagents. Each worktree:
1. Creates a git worktree from the current HEAD
2. Implements only the changes described in its section
3. Verifies the fix compiles (TypeScript check)
4. Does NOT merge — leaves the branch ready for review

**Worktree naming convention:**
```
../solid-migration-wt-follow
../solid-migration-wt-citynav
../solid-migration-wt-planes
../solid-migration-wt-layers-default
../solid-migration-wt-cctv
```

**Branch naming convention:**
```
fix/follow-mode
fix/city-navigation
fix/planes-render
fix/layer-defaults
fix/cctv-feature
```

---

## Shared Principles

- Do not add fallbacks that hide real failures
- Follow existing SolidJS patterns (`createEffect`, `on`, `createSignal`, `onCleanup`)
- All camera calls go through the `useCesium()` hook's `viewer()` accessor
- Do not introduce new global state — use existing stores
- Keep changes minimal and focused on the regression, no opportunistic refactoring
