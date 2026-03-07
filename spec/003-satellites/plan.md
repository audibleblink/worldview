# WorldView — Milestone 3: Satellite Layer Execution Plan

**PRD:** `prd.md`  
**Date:** 2026-03-07

---

## Overview

Five sequential phases, each producing a complete, independently testable increment. Phases 2–5 depend on Phase 1. Phase 5 depends on Phase 4.

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
  (lib)    (fetch)  (render)  (select)  (follow+filter)
```

---

## Phase 1 — Library Installation & SGP4 Smoke Test

**Goal:** `satellite.js` installed, importable, and correctly propagating a known satellite position.  
**Depends on:** Nothing — safe to do first, isolated from Cesium.

### Tasks

- [x] `bun add satellite.js` — install the SGP4 library
- [x] Verify `satellite.js` types are available (`@types/satellite.js` or bundled)
- [x] Create `src/layers/satellites.ts` — stub module with named exports (empty for now)
- [x] Create `spec/003-satellites/` directory for plan and any reference assets
- [x] Copy `prd.md` → `spec/003-satellites/prd.md` and `plan.md` → `spec/003-satellites/plan.md`

### Verification — Autonomous Check

Create a temporary script `scripts/sgp4-smoke.ts`:

```ts
import * as satellite from "satellite.js";

// ISS TLE (well-known, stable for testing shape of output)
const line1 = "1 25544U 98067A   24001.00000000  .00001234  00000-0  23456-4 0  9990";
const line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50000000000000";

const satrec = satellite.twoline2satrec(line1, line2);
const now = new Date();
const result = satellite.propagate(satrec, now);

if (!result.position || typeof result.position === "boolean") {
  console.error("FAIL: propagate returned no position");
  process.exit(1);
}

const gmst = satellite.gstime(now);
const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);

console.log("PASS: ISS propagated successfully");
console.log(`  Lat: ${satellite.degreesLat(geo.latitude).toFixed(4)}°`);
console.log(`  Lon: ${satellite.degreesLong(geo.longitude).toFixed(4)}°`);
console.log(`  Alt: ${(geo.height * 6371).toFixed(1)} km`);
```

Run: `bun scripts/sgp4-smoke.ts`  
**Pass criteria:** Prints `PASS:` with plausible ISS altitude (350–430 km). Exit code 0.

---

## Phase 2 — TLE Fetching & Parsing

**Goal:** A `SatelliteLayer` class that fetches, parses, and stores TLE records for all three categories. No rendering yet — pure data pipeline.  
**Depends on:** Phase 1

### Tasks

- [x] Define `SatelliteRecord` TypeScript interface in `src/layers/satellites.ts`:
  ```ts
  interface SatelliteRecord {
    name: string;
    noradId: string;
    category: "active" | "stations" | "military";
    satrec: satellite.SatRec;
    color: Cesium.Color;
  }
  ```
- [x] Implement `fetchTLEs(category)` — fetches from CelesTrak, parses raw TLE triplets, returns `SatelliteRecord[]`
  - URL: `https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle`
  - Parse: split on `\n`, group into triplets (name + line1 + line2), call `satellite.twoline2satrec`
  - Skip records where `satrec.error !== 0`
  - Assign color per category: `active=#00ff41`, `stations=#00cfff`, `military=#ff4444`
- [x] Implement `loadAllTLEs()` — parallel-fetches all three categories, merges into `records: SatelliteRecord[]`
- [x] Add CORS fallback: if direct fetch fails, retry via `http://localhost:3001/tle?group={group}` (proxy route to be added)
- [x] Add proxy route to `src/proxy.ts` for `/tle?group=` → forward to CelesTrak (handles CORS in browser)

### Verification — Autonomous Check

Create `scripts/tle-fetch-smoke.ts`:

```ts
// Run with: bun scripts/tle-fetch-smoke.ts
// Requires proxy running: bun run src/proxy.ts (or direct fetch if CORS OK)
import { loadAllTLEs } from "../src/layers/satellites";

const records = await loadAllTLEs();

console.log(`Total records: ${records.length}`);
if (records.length < 100) { console.error("FAIL: fewer than 100 records"); process.exit(1); }

const categories = { active: 0, stations: 0, military: 0 };
for (const r of records) categories[r.category]++;
console.log("Categories:", categories);

if (categories.active < 50) { console.error("FAIL: too few active sats"); process.exit(1); }
if (!records.every(r => r.satrec && r.noradId && r.name)) {
  console.error("FAIL: malformed records"); process.exit(1);
}

console.log("PASS: TLE fetch and parse successful");
console.log(`  Sample: ${records[0].name} (NORAD ${records[0].noradId})`);
```

Run: `bun scripts/tle-fetch-smoke.ts`  
**Pass criteria:** 100+ records, all three categories present, `PASS:` printed. Exit code 0.

---

## Phase 3 — Rendering: Billboards & Position Update Loop

**Goal:** Satellites appear on the globe as color-coded glow points, positions updating every 5 seconds. Layer toggle wires into the existing left panel UI. TRACKING counter shown in the HUD.  
**Depends on:** Phase 2

### Tasks

- [ ] Install `satellite.js` type bindings if not already bundled — confirm `import * as satellite from "satellite.js"` resolves types
- [ ] Implement `propagateAll(records, date)` — returns `{ record, cartesian: Cesium.Cartesian3 }[]`
  - Call `satellite.propagate(satrec, date)` per record
  - Skip if result has no position (satellite below horizon / decayed)
  - Convert ECI → geodetic → `Cesium.Cartesian3.fromRadians(lon, lat, altMeters)`
- [ ] Create glow billboard texture: 32×32 canvas radial gradient (white center, transparent edge), stored as data URL
- [ ] Implement `SatelliteLayer` class:
  - `billboards: Cesium.BillboardCollection` added to `viewer.scene.primitives`
  - `show()` — populate BillboardCollection from propagated positions; start 5-second `setInterval`
  - `hide()` — stop interval, remove BillboardCollection from scene
  - `updatePositions()` — called by interval; update each Billboard's `position` in-place (no add/remove)
- [ ] Wire layer toggle into `src/ui/left-panel.ts`:
  - Replace the stubbed `COVERAGE` (or add new) `SATELLITES` toggle button — remove `disabled` attribute
  - On toggle ON: instantiate `SatelliteLayer`, call `show()`, update button class to `.on`
  - On toggle OFF: call `hide()`, clear info panel, update button class
- [ ] Add `TRACKING: N SATS` counter to the top bar center (`<div class="top-bar-center">`) in `src/ui/shell.ts`
  - Export `updateSatelliteCount(n: number | null)` from `shell.ts`
  - Call with current visible count after each position update; call with `null` on layer hide

### Verification — Autonomous Check

Create `scripts/render-check.ts` (headless Cesium is not feasible, so this verifies the data pipeline that feeds rendering):

```ts
// Verifies that propagation produces valid Cartesian3 positions for 95%+ of records
import { loadAllTLEs, propagateAll } from "../src/layers/satellites";
import * as Cesium from "cesium";

const records = await loadAllTLEs();
const positions = propagateAll(records, new Date());

const valid = positions.filter(p => p.cartesian && !isNaN(p.cartesian.x));
const pct = ((valid.length / records.length) * 100).toFixed(1);

console.log(`Propagated: ${valid.length}/${records.length} (${pct}%)`);
if (valid.length < 100) { console.error("FAIL: fewer than 100 valid positions"); process.exit(1); }
if (parseFloat(pct) < 90) { console.error("FAIL: >10% propagation failures"); process.exit(1); }

// Spot-check: ISS should be at 350–430km altitude
const iss = records.find(r => r.name.includes("ISS") || r.name.includes("ZARYA"));
if (iss) {
  const issPos = positions.find(p => p.record.noradId === iss.noradId);
  if (issPos) {
    const carto = Cesium.Cartographic.fromCartesian(issPos.cartesian);
    const altKm = carto.height / 1000;
    console.log(`ISS altitude: ${altKm.toFixed(1)} km`);
    if (altKm < 300 || altKm > 500) { console.error("FAIL: ISS altitude out of expected range"); process.exit(1); }
  }
}

console.log("PASS: Render data pipeline verified");
```

Run: `bun scripts/render-check.ts`  
**Pass criteria:** 90%+ propagation success, ISS altitude in range, `PASS:` printed. Exit code 0.

**Manual verification step** (run dev server, open browser):
- Enable satellite layer toggle
- Confirm 100+ colored points appear on globe
- Confirm TRACKING counter increments in top bar
- Wait 5 seconds — confirm points shift slightly (position update)

---

## Phase 4 — Click-to-Select, Info Panel & Orbital Path

**Goal:** Clicking a satellite selects it, shows an info panel with name/NORAD ID/velocity/category, and renders the full 360° orbital path as a polyline.  
**Depends on:** Phase 3

### Tasks

- [ ] Set `id` on each Billboard to the satellite's `SatelliteRecord` (or NORAD ID string) for pick resolution
- [ ] Wire `viewer.screenSpaceEventHandler` (or `viewer.selectedEntityChanged`) to handle left-click:
  - Pick billboard via `viewer.scene.pick(event.position)`
  - If hit is a satellite billboard: call `selectSatellite(record)`
  - If hit is empty space: call `deselectSatellite()`
- [ ] Implement `selectSatellite(record)`:
  - Scale selected billboard to 14px, increase glow brightness (new texture or `scale` property)
  - Compute velocity magnitude from SGP4 velocity vector: `|v| = sqrt(vx²+vy²+vz²)` in km/s (ECI km/s units)
  - Show info panel (see below)
  - Compute and render orbital path (see below)
  - Store reference to selected record
- [ ] Implement `deselectSatellite()`:
  - Restore previous billboard scale/texture
  - Hide info panel
  - Remove orbital path polyline
  - Clear `viewer.trackedEntity` if follow mode is active
- [ ] Info panel UI (`src/ui/left-panel.ts` or new floating div injected into `#globe-container`):
  - Fields: NAME, NORAD ID, VELOCITY (km/s), CATEGORY
  - Styled in terminal aesthetic (monospace, green-on-dark, border)
  - `[FOLLOW]` button (wired in Phase 5)
  - Hidden by default; shown via CSS class toggle on select
- [ ] Implement `computeOrbitalPath(record)` → `Cesium.Cartesian3[]`:
  - Get orbital period in minutes: `T = (2π / n) * (1/60)` where `n` = mean motion (rev/day × 2π / 86400)
  - Step through one full period at 60-second intervals using `satellite.propagate`
  - Return array of `Cartesian3` positions
- [ ] Render orbital path as `viewer.entities.add({ polyline: { positions, material, width: 1.5 } })`
  - Color = category color at 50% opacity
  - Store entity reference for cleanup on deselect

### Verification — Autonomous Check

Create `scripts/select-check.ts`:

```ts
// Verifies orbital path computation produces a closed loop with expected point count
import { loadAllTLEs } from "../src/layers/satellites";
import { computeOrbitalPath } from "../src/layers/satellites";
import * as Cesium from "cesium";

const records = await loadAllTLEs();

// Test ISS (LEO ~90 min period) and a GEO sat if present
const testSats = [
  records.find(r => r.name.includes("ISS") || r.name.includes("ZARYA")),
  records.find(r => r.category === "active" && r.name.includes("GOES")),
  records[0], // fallback: first record
].filter(Boolean) as typeof records;

for (const sat of testSats) {
  const path = computeOrbitalPath(sat);
  console.log(`${sat.name}: ${path.length} path points`);
  
  if (path.length < 10) { console.error(`FAIL: too few path points for ${sat.name}`); process.exit(1); }
  
  // First and last point should be close (closed orbit)
  const first = path[0];
  const last = path[path.length - 1];
  const dist = Cesium.Cartesian3.distance(first, last);
  const altKm = Cesium.Cartographic.fromCartesian(first).height / 1000;
  console.log(`  Altitude: ${altKm.toFixed(0)} km, Loop closure dist: ${(dist/1000).toFixed(1)} km`);
  
  if (dist > 500_000) { // 500 km — generous, GEO orbit is large
    console.warn(`  WARN: large loop gap for ${sat.name} — may be expected for highly eccentric orbit`);
  }
}

// Verify velocity computation
const record = testSats[0];
const * as satellite from "satellite.js";
const result = satellite.propagate(record.satrec, new Date());
if (result.velocity && typeof result.velocity !== "boolean") {
  const v = result.velocity;
  const speed = Math.sqrt(v.x**2 + v.y**2 + v.z**2);
  console.log(`Velocity check: ${speed.toFixed(3)} km/s`);
  if (speed < 1 || speed > 12) { console.error("FAIL: velocity out of physical range"); process.exit(1); }
}

console.log("PASS: Orbital path and velocity computation verified");
```

Run: `bun scripts/select-check.ts`  
**Pass criteria:** All test sats produce 10+ path points, velocity 1–12 km/s, `PASS:` printed. Exit code 0.

**Manual verification step:**
- Click any satellite — info panel appears with data
- Green/blue/red polyline traces the full orbit
- Click empty space — panel clears, polyline disappears
- Click a different satellite — previous deselects, new one selects

---

## Phase 5 — Follow Mode & Constellation Filtering

**Goal:** `[FOLLOW]` button locks camera to satellite at orbital altitude. Category filter buttons show/hide satellite groups without re-fetching TLEs.  
**Depends on:** Phase 4

### Tasks

**Follow Mode:**
- [ ] Wire `[FOLLOW]` button in info panel:
  - On click: set `viewer.trackedEntity` to a hidden `Cesium.Entity` whose `position` is a `CallbackProperty` returning the satellite's current `Cartesian3` (updated on each 5-second tick)
  - Set `viewer.trackedEntity.viewFrom` to `new Cesium.Cartesian3(0, 0, altMeters * 1.5)` for nadir-looking chase offset
  - Button label changes to `[UNFOLLOW]`
- [ ] Wire exit conditions:
  - `[UNFOLLOW]` button → `viewer.trackedEntity = undefined`
  - `Escape` key → same (add to existing keydown handler in `shell.ts`)
  - Click empty space → `deselectSatellite()` already clears tracked entity
- [ ] Ensure 5-second position update ticks update the tracked entity's `CallbackProperty` position source

**Constellation Filtering (F3.9):**
- [ ] Add three category filter buttons below the `SATELLITES` toggle in the left panel:
  - `[ACTIVE]` `[STATIONS]` `[MILITARY]` — all ON by default
  - Visual: `.toggle-btn.on` for active, `.toggle-btn` for inactive (reuses existing CSS)
- [ ] Implement `setCategory(category, visible: boolean)` on `SatelliteLayer`:
  - Track a `hiddenCategories: Set<string>` 
  - If category hidden: set all billboards of that category `show = false`
  - If category shown: set billboards `show = true`
  - Update `TRACKING: N SATS` counter to reflect only visible sats
  - If selected satellite's category is hidden: call `deselectSatellite()`
- [ ] Wire filter buttons to `setCategory()`

### Verification — Autonomous Check

Create `scripts/filter-check.ts`:

```ts
// Verifies category filtering logic without Cesium (pure data-layer test)
// Simulates the billboard show/hide behavior

const mockBillboards = [
  { category: "active", show: true },
  { category: "active", show: true },
  { category: "stations", show: true },
  { category: "military", show: true },
  { category: "military", show: true },
];

function setCategory(cat: string, visible: boolean) {
  for (const b of mockBillboards) {
    if (b.category === cat) b.show = visible;
  }
}

function visibleCount() { return mockBillboards.filter(b => b.show).length; }

// Test: hide military
setCategory("military", false);
if (visibleCount() !== 3) { console.error("FAIL: hiding military should leave 3 visible"); process.exit(1); }

// Test: show military again
setCategory("military", true);
if (visibleCount() !== 5) { console.error("FAIL: showing military should restore 5 visible"); process.exit(1); }

// Test: hide all
setCategory("active", false);
setCategory("stations", false);
setCategory("military", false);
if (visibleCount() !== 0) { console.error("FAIL: hiding all should leave 0 visible"); process.exit(1); }

console.log("PASS: Category filter logic verified");
```

Run: `bun scripts/filter-check.ts`  
**Pass criteria:** All assertions pass, `PASS:` printed. Exit code 0.

**Manual verification step:**
- Enable satellite layer → all sats visible
- Click `[MILITARY]` filter to OFF → red points disappear, counter decreases
- Click `[MILITARY]` back ON → red points reappear
- Select a military satellite → toggle military OFF → info panel clears, polyline disappears
- Select any satellite → click `[FOLLOW]` → camera locks to satellite, nadir view
- Press `Escape` → camera unlocks

---

## Final Acceptance Checklist

Run all smoke scripts in sequence:

```sh
bun scripts/sgp4-smoke.ts      # Phase 1
bun scripts/tle-fetch-smoke.ts  # Phase 2
bun scripts/render-check.ts    # Phase 3
bun scripts/select-check.ts    # Phase 4
bun scripts/filter-check.ts    # Phase 5
```

Then verify all PRD acceptance criteria manually in browser:

| AC | Criteria | Verified |
|----|----------|----------|
| AC1 | 100+ satellites at correct orbital positions | [ ] |
| AC2 | Positions visually update every 5 seconds | [ ] |
| AC3 | Category color coding correct (green/blue/red) | [ ] |
| AC4 | Click → info panel with name, NORAD ID, velocity | [ ] |
| AC5 | Full orbital path polyline on selection | [ ] |
| AC6 | Follow mode locks camera at orbital altitude | [ ] |
| AC7 | Toggle OFF clears all satellites, paths, panel | [ ] |
| AC8 | TRACKING counter reflects visible count | [ ] |
| AC9 | No significant frame rate drop (30fps+ baseline) | [ ] |
| AC10 | Category filters work without re-fetch | [ ] |

---

## File Manifest

New files created across all phases:

| File | Phase | Purpose |
|------|-------|---------|
| `src/layers/satellites.ts` | 1–5 | Main satellite layer module |
| `scripts/sgp4-smoke.ts` | 1 | Phase 1 verification |
| `scripts/tle-fetch-smoke.ts` | 2 | Phase 2 verification |
| `scripts/render-check.ts` | 3 | Phase 3 verification |
| `scripts/select-check.ts` | 4 | Phase 4 verification |
| `scripts/filter-check.ts` | 5 | Phase 5 verification |
| `spec/003-satellites/prd.md` | 1 | PRD archive |
| `spec/003-satellites/plan.md` | 1 | Plan archive |

Modified files:

| File | Phases | Changes |
|------|--------|---------|
| `package.json` | 1 | Add `satellite.js` dependency |
| `src/proxy.ts` | 2 | Add `/tle?group=` proxy route |
| `src/ui/left-panel.ts` | 3, 5 | Wire satellite toggle + category filters |
| `src/ui/shell.ts` | 3 | Add TRACKING counter to top-bar-center |
| `src/main.ts` | 3 | Initialize `SatelliteLayer`, pass to UI |
