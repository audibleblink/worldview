# Execution Plan: Ground Layer (Milestone 5)

**PRD:** `spec/005-ground/prd.md`  
**Created:** March 7, 2026  
**Phases:** 5 (3 feature phases + integration + polish)

---

## Overview

This plan implements the Ground Layer in **5 phases**, each leaving a fully functional and tested component:

| Phase | Feature | Dependencies | Est. Duration |
|-------|---------|--------------|---------------|
| 1 | Traffic Particle System | None | Core feature |
| 2 | CCTV Integration | Phase 1 (proxy pattern) | Core feature |
| 3 | Earthquake Visualization | None | Can parallel Phase 2 |
| 4 | Integration & Layer Toggle | Phases 1-3 | Wiring |
| 5 | Performance & Polish | Phase 4 | Optimization |

---

## Phase 1: Traffic Particle System

**Goal:** Animated particles flowing along Austin streets at 30+ FPS

**Depends on:** Nothing (standalone)

### Tasks

- [x] **1.1 Create file structure**
  - Create `src/ground/` directory
  - Create `src/ground/traffic/` subdirectory
  - Create placeholder files: `index.ts`, `TrafficParticleSystem.ts`, `RoadNetwork.ts`, `OSMFetcher.ts`, `particleStyles.ts`

- [x] **1.2 Implement OSMFetcher**
  - Add proxy route `/api/osm` to `src/proxy.ts` for Overpass API
  - Create `OSMFetcher.ts` with:
    - `fetchRoads(bbox: BoundingBox): Promise<RawOSMWay[]>`
    - Overpass query for highway types: motorway, primary, secondary, tertiary, residential
    - Parse response into way geometries with tags
  - Add IndexedDB caching layer keyed by tile coordinates

- [x] **1.3 Implement RoadNetwork**
  - Create `RoadNetwork.ts` with:
    - `RoadSegment` interface: `{ points: [number, number][], highway: string, oneway: boolean }`
    - `buildNetwork(ways: RawOSMWay[]): RoadSegment[]`
    - Convert OSM ways to line segments
    - Extract `oneway` tag for direction
    - Build intersection connectivity graph

- [x] **1.4 Implement TrafficParticleSystem**
  - Create `TrafficParticleSystem.ts` with:
    - Cesium `PointPrimitiveCollection` for rendering
    - `ParticleState[]` pool (max 5,000)
    - `initialize(viewer: Cesium.Viewer)`
    - `update(deltaTime: number)` — advance particles along segments
    - `destroy()` — cleanup primitives
  - Implement particle movement along road segments
  - Handle segment transitions at intersections

- [x] **1.5 Implement particle styles**
  - Create `particleStyles.ts` with:
    - `getHeatmapColor(speed: number): Cesium.Color` — red→yellow→green
    - `getTerminalColor(speed: number): Cesium.Color` — phosphor green with intensity
    - Road classification color mapping
  - Add style toggle method to `TrafficParticleSystem`

- [x] **1.6 Implement one-way street support**
  - Parse OSM `oneway=yes|no|-1` tag
  - Set particle direction based on tag
  - Bidirectional flow for non-oneway roads

- [x] **1.7 Implement density by road class**
  - Allocate particles: motorway 40%, primary 25%, secondary 20%, tertiary 10%, residential 5%
  - Adjust particle count based on segment length

### Verification Script

```bash
# test/phase1-verify.ts
# Run with: bun test/phase1-verify.ts

import { TrafficParticleSystem } from "../src/ground/traffic/TrafficParticleSystem";
import { OSMFetcher } from "../src/ground/traffic/OSMFetcher";

const AUSTIN_BBOX = { west: -97.76, south: 30.25, east: -97.72, north: 30.29 };

async function verify() {
  console.log("Phase 1 Verification\n");
  
  // Test 1: OSM fetch works
  console.log("1. Testing OSM fetch...");
  const fetcher = new OSMFetcher();
  const roads = await fetcher.fetchRoads(AUSTIN_BBOX);
  console.assert(roads.length > 0, "Should fetch roads");
  console.log(`   ✓ Fetched ${roads.length} road segments`);
  
  // Test 2: Road network builds
  console.log("2. Testing road network...");
  const { buildNetwork } = await import("../src/ground/traffic/RoadNetwork");
  const network = buildNetwork(roads);
  console.assert(network.length > 0, "Should build network");
  console.log(`   ✓ Built ${network.length} segments`);
  
  // Test 3: Has motorway segments
  const motorways = network.filter(s => s.highway === "motorway");
  console.log(`   ✓ Found ${motorways.length} motorway segments`);
  
  // Test 4: Has one-way streets
  const oneways = network.filter(s => s.oneway);
  console.log(`   ✓ Found ${oneways.length} one-way segments`);
  
  // Test 5: Particle system initializes (headless check)
  console.log("3. Testing particle system (module load)...");
  const { TrafficParticleSystem } = await import("../src/ground/traffic/TrafficParticleSystem");
  console.assert(TrafficParticleSystem, "Should export TrafficParticleSystem");
  console.log("   ✓ TrafficParticleSystem exports correctly");
  
  // Test 6: Style functions work
  console.log("4. Testing particle styles...");
  const { getHeatmapColor, getTerminalColor } = await import("../src/ground/traffic/particleStyles");
  const heatSlow = getHeatmapColor(0.2);
  const heatFast = getHeatmapColor(1.0);
  const terminal = getTerminalColor(0.5);
  console.assert(heatSlow.red > heatFast.red, "Slow should be redder");
  console.assert(terminal.green > terminal.red, "Terminal should be green");
  console.log("   ✓ Color functions work correctly");
  
  console.log("\n✅ Phase 1 verification complete");
}

verify().catch(console.error);
```

### Acceptance Criteria Covered
- AC1: Traffic particles animate along Austin streets at 30+ FPS
- AC2: Particles flow in correct direction on one-way streets
- AC3: Particle color/speed varies by road classification
- AC4: User can toggle between heat-map and terminal particle styles

---

## Phase 2: CCTV Integration

**Goal:** Live traffic camera feeds projected into 3D scene as billboards

**Depends on:** Phase 1 (uses same proxy pattern, extends left panel)

### Tasks

- [ ] **2.1 Research Austin CCTV data source**
  - Check Austin Open Data Portal for traffic camera endpoints
  - Document camera catalog format (JSON with coordinates, stream URLs)
  - Identify MJPEG stream URL pattern
  - **Fallback:** Use static camera list with known working streams

- [ ] **2.2 Create CCTV proxy endpoints**
  - Add to `src/proxy.ts`:
    - `GET /api/cctv/cameras?bbox=` — return cameras in viewport
    - `GET /api/cctv/thumbnail/:id` — return latest JPEG frame
    - `GET /api/cctv/stream/:id` — relay MJPEG stream
  - Implement frame sampling (1fps for thumbnails)
  - Cache camera catalog in memory

- [ ] **2.3 Create CCTV types and manager**
  - Create `src/ground/cctv/types.ts`:
    ```typescript
    interface Camera {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      streamUrl: string;
      status: "live" | "offline";
    }
    ```
  - Create `src/ground/cctv/CCTVManager.ts`:
    - `fetchCamerasInViewport(bbox): Promise<Camera[]>`
    - `getActiveBillboards(): CCTVBillboard[]`
    - `projectCamera(camera: Camera): void`
    - `removeProjection(cameraId: string): void`

- [ ] **2.4 Create CCTV Panel UI**
  - Create `src/ground/cctv/CCTVPanel.ts`:
    - Viewport-filtered camera list
    - Thumbnail images (1fps refresh)
    - Live/offline status indicator
    - Click handler to project camera
  - Style with terminal aesthetic (`.cctv-panel`, `.cctv-item`, `.cctv-thumb`)
  - Add to `public/styles.css`

- [ ] **2.5 Implement 3D billboard projection**
  - Create `src/ground/cctv/CCTVBillboard.ts`:
    - Create Cesium Entity with billboard + label
    - Position at camera GPS coords, 15m above ground
    - Size: 8m × 6m (4:3 aspect)
    - Update texture from video frame (~15fps)
  - Implement canvas-to-texture pipeline
  - Add terminal green border styling

- [ ] **2.6 Wire up panel to left panel**
  - Replace CCTV placeholder in `src/ui/left-panel.ts`
  - Add viewport change listener to refresh camera list
  - Connect click handlers to CCTVManager

### Verification Script

```bash
# test/phase2-verify.ts

async function verify() {
  console.log("Phase 2 Verification\n");
  
  // Test 1: Proxy endpoints exist
  console.log("1. Testing CCTV proxy endpoints...");
  const camerasRes = await fetch("http://localhost:3001/api/cctv/cameras?bbox=-97.76,30.25,-97.72,30.29");
  console.assert(camerasRes.ok, "Cameras endpoint should respond");
  const cameras = await camerasRes.json();
  console.log(`   ✓ Cameras endpoint returns ${cameras.length} cameras`);
  
  // Test 2: At least one camera in Austin
  if (cameras.length > 0) {
    const camera = cameras[0];
    console.log(`   ✓ Sample camera: ${camera.name} at ${camera.latitude}, ${camera.longitude}`);
    
    // Test 3: Thumbnail endpoint
    console.log("2. Testing thumbnail endpoint...");
    const thumbRes = await fetch(`http://localhost:3001/api/cctv/thumbnail/${camera.id}`);
    if (thumbRes.ok) {
      const contentType = thumbRes.headers.get("content-type");
      console.assert(contentType?.includes("image"), "Should return image");
      console.log(`   ✓ Thumbnail returns ${contentType}`);
    } else {
      console.log(`   ⚠ Thumbnail unavailable (camera may be offline)`);
    }
  }
  
  // Test 4: CCTVManager module loads
  console.log("3. Testing CCTVManager...");
  const { CCTVManager } = await import("../src/ground/cctv/CCTVManager");
  console.assert(CCTVManager, "Should export CCTVManager");
  console.log("   ✓ CCTVManager exports correctly");
  
  // Test 5: CCTVPanel module loads
  console.log("4. Testing CCTVPanel...");
  const { CCTVPanel } = await import("../src/ground/cctv/CCTVPanel");
  console.assert(CCTVPanel, "Should export CCTVPanel");
  console.log("   ✓ CCTVPanel exports correctly");
  
  console.log("\n✅ Phase 2 verification complete");
}

verify().catch(console.error);
```

### Acceptance Criteria Covered
- AC5: CCTV cameras in viewport appear in left panel with thumbnails
- AC6: Thumbnails update live (1fps)
- AC7: Clicking camera projects billboard into 3D scene
- AC8: Billboard displays live video feed

---

## Phase 3: Earthquake Visualization

**Goal:** Real-time seismic activity with animated expanding rings

**Depends on:** Nothing (can run parallel with Phase 2)

### Tasks

- [ ] **3.1 Create seismic file structure**
  - Create `src/ground/seismic/` directory
  - Create files: `EarthquakeLayer.ts`, `USGSFetcher.ts`, `RingAnimation.ts`

- [ ] **3.2 Implement USGSFetcher**
  - Create `USGSFetcher.ts`:
    - Fetch `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
    - Parse GeoJSON response
    - Filter by viewport proximity (within 500km)
    - Poll every 60 seconds

- [ ] **3.3 Implement demo fallback**
  - If no real earthquakes near viewport:
    - Generate synthetic earthquake at random location
    - Magnitude 2.5-4.5
    - Add "SIMULATED" label
  - Cycle demo earthquakes every 30 seconds

- [ ] **3.4 Implement RingAnimation**
  - Create `RingAnimation.ts`:
    - Use Cesium `EllipseGraphics` with animated radius
    - Ring properties by magnitude:
      - < 3.0: 10km, yellow, 2 rings
      - 3.0-4.5: 25km, orange, 3 rings
      - 4.5-6.0: 50km, red, 4 rings
      - > 6.0: 100km, deep red, 5 rings
    - Fade opacity as rings expand
  - Create pulsing epicenter dot

- [ ] **3.5 Implement EarthquakeLayer**
  - Create `EarthquakeLayer.ts`:
    - `initialize(viewer: Cesium.Viewer)`
    - `show()` / `hide()` lifecycle
    - Manage active earthquake entities
    - Coordinate fetcher + animations + demo fallback

- [ ] **3.6 Add epicenter labels**
  - Show "M{magnitude} - {place}" label
  - Position above epicenter dot
  - Terminal styling

### Verification Script

```bash
# test/phase3-verify.ts

async function verify() {
  console.log("Phase 3 Verification\n");
  
  // Test 1: USGS API is accessible
  console.log("1. Testing USGS API...");
  const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson");
  console.assert(res.ok, "USGS API should respond");
  const data = await res.json();
  console.log(`   ✓ USGS returned ${data.features.length} earthquakes today`);
  
  // Test 2: USGSFetcher module loads
  console.log("2. Testing USGSFetcher...");
  const { USGSFetcher } = await import("../src/ground/seismic/USGSFetcher");
  const fetcher = new USGSFetcher();
  const quakes = await fetcher.fetch();
  console.log(`   ✓ Fetcher parsed ${quakes.length} events`);
  
  // Test 3: RingAnimation module loads
  console.log("3. Testing RingAnimation...");
  const { RingAnimation } = await import("../src/ground/seismic/RingAnimation");
  console.assert(RingAnimation, "Should export RingAnimation");
  console.log("   ✓ RingAnimation exports correctly");
  
  // Test 4: Demo fallback generates synthetic quakes
  console.log("4. Testing demo fallback...");
  const { EarthquakeLayer } = await import("../src/ground/seismic/EarthquakeLayer");
  console.assert(EarthquakeLayer, "Should export EarthquakeLayer");
  console.log("   ✓ EarthquakeLayer exports correctly");
  
  // Test 5: Magnitude scaling is correct
  console.log("5. Testing magnitude scaling...");
  const { getMagnitudeConfig } = await import("../src/ground/seismic/RingAnimation");
  const m2 = getMagnitudeConfig(2.5);
  const m5 = getMagnitudeConfig(5.0);
  console.assert(m5.maxRadius > m2.maxRadius, "Larger magnitude = larger radius");
  console.assert(m5.ringCount > m2.ringCount, "Larger magnitude = more rings");
  console.log(`   ✓ M2.5: ${m2.maxRadius}km, ${m2.ringCount} rings`);
  console.log(`   ✓ M5.0: ${m5.maxRadius}km, ${m5.ringCount} rings`);
  
  console.log("\n✅ Phase 3 verification complete");
}

verify().catch(console.error);
```

### Acceptance Criteria Covered
- AC9: Earthquake rings animate outward from epicenter
- AC10: Ring size/color corresponds to magnitude
- AC11: Demo earthquakes appear if no real events nearby

---

## Phase 4: Integration & Layer Toggle

**Goal:** Unified Ground Layer with left-panel toggle

**Depends on:** Phases 1, 2, 3

### Tasks

- [ ] **4.1 Create GroundLayer orchestrator**
  - Create `src/ground/index.ts`:
    - `GroundLayer` class combining all sub-layers
    - `initialize(viewer: Cesium.Viewer)`
    - `show()` / `hide()` lifecycle
    - Pass-through to traffic, CCTV, seismic systems

- [ ] **4.2 Add left-panel toggle**
  - Add "GROUND" toggle row to `src/ui/left-panel.ts`
  - Wire up show/hide to `GroundLayer`
  - Add log entries for layer state changes

- [ ] **4.3 Add ground layer options row**
  - Sub-toggles for: TRAFFIC, CCTV, SEISMIC
  - Allow enabling/disabling individual components
  - Hidden when GROUND layer is OFF

- [ ] **4.4 Add particle style toggle**
  - Add toggle button: HEAT-MAP / TERMINAL
  - Wire to `TrafficParticleSystem.setStyleMode()`
  - Only visible when TRAFFIC is ON

- [ ] **4.5 Wire up to main.ts**
  - Import `GroundLayer` in `src/main.ts`
  - Initialize with viewer
  - Pass to `initLeftPanel` options

- [ ] **4.6 Update count display**
  - Add "CAMERAS: N" to top bar (alongside SATELLITES, FLIGHTS)
  - Update when CCTV panel viewport changes

### Verification Script

```bash
# test/phase4-verify.ts

async function verify() {
  console.log("Phase 4 Verification\n");
  
  // Test 1: GroundLayer module loads
  console.log("1. Testing GroundLayer...");
  const { GroundLayer } = await import("../src/ground/index");
  console.assert(GroundLayer, "Should export GroundLayer");
  console.log("   ✓ GroundLayer exports correctly");
  
  // Test 2: All sub-layers accessible
  console.log("2. Testing sub-layer access...");
  const layer = new GroundLayer();
  console.assert(layer.traffic, "Should have traffic sub-layer");
  console.assert(layer.cctv, "Should have cctv sub-layer");
  console.assert(layer.seismic, "Should have seismic sub-layer");
  console.log("   ✓ All sub-layers accessible");
  
  // Test 3: Left panel has GROUND toggle
  console.log("3. Testing left-panel integration...");
  // This requires DOM - skip in headless, verify manually
  console.log("   ⚠ Manual verification required (run app and check UI)");
  
  console.log("\n✅ Phase 4 verification complete");
  console.log("\n📋 Manual checks required:");
  console.log("   1. Open app in browser");
  console.log("   2. Verify GROUND toggle appears in left panel");
  console.log("   3. Toggle GROUND ON → see traffic particles");
  console.log("   4. Toggle TRAFFIC/CCTV/SEISMIC sub-options");
  console.log("   5. Toggle HEAT-MAP/TERMINAL style");
}

verify().catch(console.error);
```

### Acceptance Criteria Covered
- AC4 (completed): Style toggle wired to UI

---

## Phase 5: Performance & Polish

**Goal:** All features work together at 30+ FPS, production-ready

**Depends on:** Phase 4

### Tasks

- [ ] **5.1 Implement particle LOD**
  - Reduce particle count when camera altitude > 5km
  - Scale: 100% at ground level, 20% at 50km altitude
  - Smooth interpolation

- [ ] **5.2 Implement road culling**
  - Only update particles on roads in camera frustum
  - Skip offscreen segment calculations
  - Use Cesium `EllipsoidalOccluder` for visibility check

- [ ] **5.3 Implement texture pooling**
  - Reuse canvas/texture objects for CCTV feeds
  - Limit concurrent video elements to 4
  - Gracefully handle stream failures

- [ ] **5.4 Batch particle updates**
  - Update particles in chunks (500 per frame max)
  - Spread across multiple frames if needed
  - Maintain visual continuity

- [ ] **5.5 Performance monitoring**
  - Add FPS counter to bottom bar
  - Log warnings if frame time > 33ms
  - Add debug mode for performance stats

- [ ] **5.6 Final styling pass**
  - Ensure terminal aesthetic consistency
  - Add glow effects to particles (via shader)
  - Consistent colors across all ground features

- [ ] **5.7 Error handling & recovery**
  - Graceful degradation if OSM API fails
  - Retry logic for CCTV stream failures
  - User-visible error states

### Verification Script

```bash
# test/phase5-verify.ts

async function verify() {
  console.log("Phase 5 Verification (Performance)\n");
  console.log("⚠ This test requires browser with DevTools\n");
  
  console.log("📋 Manual performance verification:");
  console.log("   1. Open app in Chrome");
  console.log("   2. Open DevTools → Performance tab");
  console.log("   3. Enable GROUND layer");
  console.log("   4. Record 10 seconds of interaction");
  console.log("   5. Verify:");
  console.log("      - Frame rate: 30+ FPS average");
  console.log("      - No frames > 50ms");
  console.log("      - Memory stable (no leaks)");
  console.log("");
  console.log("   6. Test with all features:");
  console.log("      - Traffic ON + CCTV (2 feeds) + Seismic ON");
  console.log("      - Verify still 30+ FPS");
  console.log("");
  
  // Automated checks
  console.log("Automated module checks:");
  
  const { GroundLayer } = await import("../src/ground/index");
  const layer = new GroundLayer();
  
  // Check LOD method exists
  console.assert(typeof layer.traffic?.setLODLevel === "function", "Should have LOD method");
  console.log("   ✓ LOD methods exist");
  
  // Check culling method exists
  console.assert(typeof layer.traffic?.setCullingEnabled === "function", "Should have culling method");
  console.log("   ✓ Culling methods exist");
  
  console.log("\n✅ Phase 5 verification complete");
}

verify().catch(console.error);
```

### Acceptance Criteria Covered
- AC12: All features work together without dropping below 30 FPS

---

## Verification Summary

| Phase | Automated Tests | Manual Checks |
|-------|-----------------|---------------|
| 1 | OSM fetch, network build, module loads | Particles animate in browser |
| 2 | Proxy endpoints, module loads | CCTV panel shows, billboards project |
| 3 | USGS fetch, magnitude scaling | Rings animate correctly |
| 4 | Module integration | UI toggles work |
| 5 | Method existence | Performance profiling |

### Running All Verification Scripts

```bash
# Run all phase verifications
bun test/phase1-verify.ts && \
bun test/phase2-verify.ts && \
bun test/phase3-verify.ts && \
bun test/phase4-verify.ts && \
bun test/phase5-verify.ts
```

---

## Dependencies Graph

```
Phase 1 (Traffic) ─────┐
                       ├──► Phase 4 (Integration) ──► Phase 5 (Polish)
Phase 2 (CCTV) ────────┤
                       │
Phase 3 (Seismic) ─────┘
        │
        └──► (can run parallel with Phase 2)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Austin CCTV API unavailable | Use static camera list with known working streams |
| OSM rate limiting | Aggressive caching, tile-based fetching |
| MJPEG streams fail | Show "OFFLINE" status, retry logic |
| Austin has no earthquakes | Demo fallback with simulated events |
| Performance issues | LOD, culling, batching implemented in Phase 5 |

---

## Definition of Done

Each phase is complete when:

1. All tasks checked off
2. Verification script passes
3. No TypeScript errors (`bun run typecheck`)
4. Manual browser verification complete
5. Code committed with descriptive message

---

*End of Execution Plan*
