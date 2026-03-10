# Planes Render Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make planes render on the globe. Diagnose whether the issue is the GLTF model, the OpenSky API data, or the Cesium Entity setup.

**Architecture:** `FlightLayer` fetches flight data from the proxy, creates Cesium Entities with a 3D aircraft model, and updates positions via dead-reckoning in `usePreRender`. Diagnose systematically: data → entity creation → model loading.

**Tech Stack:** SolidJS, CesiumJS, TypeScript, Bun, OpenSky Network API

---

## Chunk 1: Diagnose the root cause

### Task 1: Verify the flights API is returning data

**Files:**
- Modify: `src/layers/flights/FlightLayer.tsx` (add temporary logging)

- [ ] **Step 1: Add logging after `refreshFlights` to confirm data is received**

In `refreshFlights()`, after `setFlights(records, total)`, add:
```typescript
console.log(`[FlightLayer] API returned ${total} total states, filtered to ${records.length} flights`);
console.log(`[FlightLayer] Entity map has ${entityMap.size} entities`);
```

- [ ] **Step 2: Run the app and check the console**

```bash
bun run src/server.ts
```

Open app → enable Flights layer → check console output.

**If total is 0:** The API is not returning data. Go to Task 2 (API debugging).  
**If total > 0 but entityMap.size is 0:** Entity creation is failing. Go to Task 3 (entity debugging).  
**If entityMap.size > 0 but nothing renders:** Model loading is failing. Go to Task 4 (model debugging).

---

### Task 2: Debug the OpenSky proxy endpoint (if API returns 0 states)

**Files:**
- Check: proxy server routes

- [ ] **Step 1: Test the proxy endpoint directly**

```bash
curl "http://localhost:3001/flights" | head -200
```

Expected: `{ "states": [[...], [...], ...], "time": ... }`

- [ ] **Step 2: If endpoint returns `{ "states": null }` or `{ "states": [] }`**

OpenSky may require authentication or be rate-limiting. Check the proxy server code for the `/flights` route. Look for auth headers or error handling.

Find the flights route:
```bash
grep -r "flights" src/server/ --include="*.ts" -l
```

- [ ] **Step 3: If proxy server is not forwarding auth correctly**

Check `.env` for `OPENSKY_USERNAME` and `OPENSKY_PASSWORD`. Verify they are set. Verify the proxy forwards them as Basic auth.

- [ ] **Step 4: If OpenSky API is down or rate-limited, add mock data temporarily**

To unblock testing of the rendering issue, add a mock response:

```typescript
// Temporary: return mock flight data for testing
if (!data.states || data.states.length === 0) {
  console.warn("[FlightLayer] No live data, using mock for testing");
  // Mock: 3 flights over the US
  return {
    records: [
      { icao24: "test01", callsign: "TEST01", longitude: -97.7, latitude: 30.3, altitude: 10000, velocity: 250, heading: 90, verticalRate: 0, onGround: false, lastUpdate: Date.now() },
      { icao24: "test02", callsign: "TEST02", longitude: -87.6, latitude: 41.9, altitude: 8000, velocity: 220, heading: 270, verticalRate: 0, onGround: false, lastUpdate: Date.now() },
    ],
    total: 2,
  };
}
```

This is **temporary** — remove it once the real issue is fixed.

---

### Task 3: Debug entity creation (if records come in but entities aren't created)

**Files:**
- Modify: `src/layers/flights/FlightLayer.tsx`

- [ ] **Step 1: Add logging inside `addEntity()`**

```typescript
function addEntity(record: FlightRecord, v: Cesium.Viewer): void {
  console.log(`[FlightLayer] Adding entity for ${record.icao24} at ${record.latitude},${record.longitude},${record.altitude}`);
  // ... rest of function
}
```

- [ ] **Step 2: Verify entities are added to `v.entities`**

After adding, check: `console.log('[FlightLayer] Total entities:', v.entities.values.length)`.

- [ ] **Step 3: Verify the viewer is not destroyed when entities are added**

Check the `on(ready, ...)` effect — confirm `ready()` is true before `refreshFlights` is called.

---

### Task 4: Debug model loading (if entities exist but are invisible)

**Files:**
- Modify: `src/layers/flights/FlightLayer.tsx`

- [ ] **Step 1: Replace the 3D model with a simple point temporarily**

In `addEntity()`, add a `point` alongside the model to confirm position is correct:

```typescript
const entity = v.entities.add({
  id: record.icao24,
  name: record.callsign || record.icao24,
  position: positionProperty,
  orientation: orientationProperty,
  // Add a visible point for debugging
  point: {
    pixelSize: 10,
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
  },
  model: {
    uri: LOCAL_ASSETS.aircraftModel,
    // ...
  },
  // ...
});
```

If red points appear but no models → model file issue.  
If no points appear either → entity position/altitude issue.

- [ ] **Step 2: If points appear but no models — test the GLTF URI**

Open browser DevTools → Network tab → look for requests to `/models/aircraft.glb`. If 404 → asset path wrong. If 200 but model invisible → GLB file is corrupt or incompatible.

- [ ] **Step 3: Verify the GLTF path**

```bash
curl -I http://localhost:3000/models/aircraft.glb
```

Expected: `HTTP/1.1 200 OK` with `Content-Type: model/gltf-binary`.

If 404: Check server routing. The file is at `public/models/aircraft.glb`. The server should serve `public/` at root.

- [ ] **Step 4: If GLB is 404, verify server routing for `/models/`**

In `src/server.ts`, find where static files are served. Ensure `public/models/` is in the static file serving path.

- [ ] **Step 5: If GLB loads but model is invisible**

Try a known-good Cesium sample model. Download from: https://github.com/KhronosGroup/glTF-Sample-Models/raw/main/2.0/Box/glTF-Binary/Box.glb

Place at `public/models/aircraft.glb` temporarily. If the box renders, the original GLB is the issue.

---

### Task 5: Fix and clean up

**Files:**
- Modify: `src/layers/flights/FlightLayer.tsx`

- [ ] **Step 1: Remove all debug logging and temporary mock data**

- [ ] **Step 2: If model path was wrong, fix `LOCAL_ASSETS.aircraftModel` in `src/config.ts`**

- [ ] **Step 3: If GLB was corrupt, replace with a working aircraft model**

Good source: Cesium's built-in aircraft sample, or download from:
```bash
# Download a simple GLB aircraft model
curl -L "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb" -o public/models/aircraft.glb
```

- [ ] **Step 4: Verify flights render correctly**

- Red points at correct lat/lng/altitude ✓ (confirmed during debugging)
- 3D model renders and rotates with heading ✓
- Label shows callsign, altitude, heading ✓

- [ ] **Step 5: Commit**

```bash
git add src/layers/flights/FlightLayer.tsx src/config.ts public/models/aircraft.glb
git commit -m "fix: planes rendering on globe"
```

---

## Final Verification

- [ ] Flights endpoint returns data (non-empty states)
- [ ] Flight entities are created with correct positions
- [ ] 3D aircraft model renders at each flight position
- [ ] Labels are visible when zoomed in close
- [ ] Follow mode works on flights (depends on wt-follow fix)
- [ ] No 404s in Network tab for model assets
