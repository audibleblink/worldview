# Execution Plan: WorldView Milestone 1

**PRD Reference:** `spec/001-init/prd.md`  
**Date:** 2026-03-07

---

## Overview

This plan breaks down Milestone 1 (3D Globe Foundation + UI Shell) into 6 phases. Each phase produces a complete, testable, and functional component. Dependencies between phases are explicitly noted.

---

## Phase 1: Project Scaffold & Build System

**Depends on:** Nothing (foundation phase)  
**Output:** Working Bun project with TypeScript, CesiumJS installed, and dual dev server/proxy script

### Checklist

- [x] Initialize Bun project (`bun init`)
- [x] Add TypeScript configuration (`tsconfig.json`)
- [x] Install CesiumJS dependency (`bun add cesium`)
- [x] Create directory structure:
  ```
  src/
    main.ts
    globe.ts
    pois.ts
    ui/
      shell.ts
      left-panel.ts
      right-panel.ts
      bottom-bar.ts
    proxy.ts
  public/
    index.html
  ```
- [x] Configure Bun bundler for CesiumJS assets (workers, static files)
- [x] Create `package.json` scripts:
  - `dev` — starts both frontend dev server and proxy concurrently
  - `build` — produces production bundle
- [x] Verify `.env` exists with `GOOGLE_MAPS_TILE_API_KEY` placeholder
- [x] Update `.gitignore` to exclude `.env` and build artifacts

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 1 verification script: scripts/verify-phase1.sh

set -e

echo "=== Phase 1 Verification ==="

# Check directory structure exists
echo "Checking directory structure..."
[ -d "src" ] && echo "  src/ exists" || (echo "  FAIL: src/ missing" && exit 1)
[ -d "src/ui" ] && echo "  src/ui/ exists" || (echo "  FAIL: src/ui/ missing" && exit 1)
[ -d "public" ] && echo "  public/ exists" || (echo "  FAIL: public/ missing" && exit 1)

# Check required files exist
echo "Checking required files..."
[ -f "src/main.ts" ] && echo "  src/main.ts exists" || (echo "  FAIL: src/main.ts missing" && exit 1)
[ -f "src/proxy.ts" ] && echo "  src/proxy.ts exists" || (echo "  FAIL: src/proxy.ts missing" && exit 1)
[ -f "public/index.html" ] && echo "  public/index.html exists" || (echo "  FAIL: public/index.html missing" && exit 1)
[ -f "tsconfig.json" ] && echo "  tsconfig.json exists" || (echo "  FAIL: tsconfig.json missing" && exit 1)
[ -f "package.json" ] && echo "  package.json exists" || (echo "  FAIL: package.json missing" && exit 1)

# Check CesiumJS is installed
echo "Checking dependencies..."
grep -q '"cesium"' package.json && echo "  cesium installed" || (echo "  FAIL: cesium not in package.json" && exit 1)

# Check scripts exist in package.json
echo "Checking npm scripts..."
grep -q '"dev"' package.json && echo "  dev script exists" || (echo "  FAIL: dev script missing" && exit 1)
grep -q '"build"' package.json && echo "  build script exists" || (echo "  FAIL: build script missing" && exit 1)

# TypeScript compilation check
echo "Running TypeScript check..."
bun run tsc --noEmit && echo "  TypeScript compiles" || (echo "  FAIL: TypeScript errors" && exit 1)

echo ""
echo "=== Phase 1 PASSED ==="
```

---

## Phase 2: Google 3D Tiles Proxy Server

**Depends on:** Phase 1 (project structure must exist)  
**Output:** Working Bun HTTP proxy server that forwards requests to Google Maps Tile API with the API key injected

### Checklist

- [x] Implement `src/proxy.ts`:
  - Bun HTTP server listening on `localhost:3001`
  - Read `GOOGLE_MAPS_TILE_API_KEY` from environment
  - Proxy all requests to `https://tile.googleapis.com`
  - Inject API key as query parameter
  - Set proper CORS headers for local development
- [x] Add startup validation (fail fast if API key missing)
- [x] Log requests for debugging (optional toggle)

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 2 verification script: scripts/verify-phase2.sh

set -e

echo "=== Phase 2 Verification ==="

# Check proxy.ts exists and has required content
echo "Checking proxy implementation..."
[ -f "src/proxy.ts" ] && echo "  src/proxy.ts exists" || (echo "  FAIL: src/proxy.ts missing" && exit 1)
grep -q "3001" src/proxy.ts && echo "  port 3001 configured" || (echo "  FAIL: port 3001 not found" && exit 1)
grep -q "tile.googleapis.com" src/proxy.ts && echo "  Google Tiles URL configured" || (echo "  FAIL: Google Tiles URL missing" && exit 1)
grep -q "GOOGLE_MAPS_TILE_API_KEY" src/proxy.ts && echo "  API key env var referenced" || (echo "  FAIL: API key env var not referenced" && exit 1)

# Start proxy and test it responds
echo "Starting proxy server..."
bun run src/proxy.ts &
PROXY_PID=$!
sleep 2

# Test proxy is running
echo "Testing proxy health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null || echo "000")
kill $PROXY_PID 2>/dev/null || true

if [ "$HTTP_CODE" != "000" ]; then
  echo "  Proxy responds (HTTP $HTTP_CODE)"
else
  echo "  FAIL: Proxy not responding"
  exit 1
fi

# Verify API key is NOT in any frontend file
echo "Checking API key is not exposed..."
if grep -r "GOOGLE_MAPS_TILE_API_KEY" src/main.ts src/globe.ts public/ 2>/dev/null; then
  echo "  FAIL: API key found in frontend code!"
  exit 1
else
  echo "  API key not exposed in frontend"
fi

echo ""
echo "=== Phase 2 PASSED ==="
```

---

## Phase 3: 3D Globe with CesiumJS

**Depends on:** Phase 1 (build system), Phase 2 (proxy for tiles)  
**Output:** Full Earth rendered with Google Photorealistic 3D Tiles, default camera position, standard navigation controls

### Checklist

- [ ] Implement `src/globe.ts`:
  - Initialize CesiumJS Viewer
  - Disable Cesium Ion (use custom tile endpoint)
  - Configure Google 3D Tiles tileset via proxy URL (`http://localhost:3001`)
  - Set default camera: altitude ~15,000km, centered on 0N 0E
  - Enable standard mouse/touch controls (orbit, zoom, pan)
- [ ] Implement `src/main.ts`:
  - Import and initialize globe
  - Mount to DOM element
- [ ] Update `public/index.html`:
  - Include Cesium CSS
  - Create container div for Cesium viewer
  - Load bundled JS

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 3 verification script: scripts/verify-phase3.sh

set -e

echo "=== Phase 3 Verification ==="

# Check globe.ts implementation
echo "Checking globe implementation..."
[ -f "src/globe.ts" ] && echo "  src/globe.ts exists" || (echo "  FAIL: src/globe.ts missing" && exit 1)
grep -q "Viewer" src/globe.ts && echo "  CesiumJS Viewer used" || (echo "  FAIL: Viewer not found" && exit 1)
grep -q "Cesium3DTileset" src/globe.ts && echo "  3D Tileset configured" || (echo "  FAIL: 3D Tileset not found" && exit 1)
grep -q "localhost:3001" src/globe.ts && echo "  Proxy URL configured" || (echo "  FAIL: Proxy URL not found" && exit 1)

# Check main.ts initialization
echo "Checking main entry point..."
[ -f "src/main.ts" ] && echo "  src/main.ts exists" || (echo "  FAIL: src/main.ts missing" && exit 1)
grep -q "globe" src/main.ts && echo "  globe module imported" || (echo "  FAIL: globe not imported" && exit 1)

# Build check
echo "Running build..."
bun run build && echo "  Build succeeds" || (echo "  FAIL: Build failed" && exit 1)

# Check no Cesium Ion token in code
echo "Checking Cesium Ion is disabled..."
if grep -r "Ion.defaultAccessToken" src/ 2>/dev/null | grep -v "= ''" | grep -v '= ""' | grep -v "= undefined"; then
  echo "  WARNING: Cesium Ion token may be set"
else
  echo "  Cesium Ion disabled"
fi

echo ""
echo "=== Phase 3 PASSED ==="
```

**Manual Verification Required:**
- Open browser to dev server URL
- Confirm Earth globe renders
- Confirm 3D tiles load progressively on zoom
- Confirm mouse controls work (orbit, zoom, pan)

---

## Phase 4: City & POI Navigation System

**Depends on:** Phase 3 (globe must be rendering)  
**Output:** 8 cities with POIs defined, keyboard navigation (Q/W/E/R/T), fly-to animations working

### Checklist

- [ ] Implement `src/pois.ts`:
  - Define City interface with name and POI array
  - Define POI interface with name, lat, lng, altitude, pitch
  - Create data for all 8 cities:
    - Austin, TX (4 POIs)
    - San Francisco, CA (4 POIs)
    - New York, NY (4 POIs)
    - Tokyo, Japan (4 POIs)
    - London, UK (4 POIs)
    - Paris, France (4 POIs)
    - Dubai, UAE (4 POIs)
    - Washington, DC (4 POIs)
  - Implement `flyToPOI(viewer, poi)` function with 2s animation
  - Camera arrives at ~500m altitude, ~45 degree pitch
  - Implement city/POI state management (current city, current POI index)
- [ ] Add keyboard event listeners in `src/main.ts`:
  - Q = POI 1, W = POI 2, E = POI 3, R = POI 4, T = POI 5
- [ ] Export functions for UI integration:
  - `getCities()`, `getCurrentCity()`, `setCurrentCity()`
  - `getCurrentPOI()`, `nextPOI()`, `prevPOI()`

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 4 verification script: scripts/verify-phase4.sh

set -e

echo "=== Phase 4 Verification ==="

# Check pois.ts implementation
echo "Checking POI implementation..."
[ -f "src/pois.ts" ] && echo "  src/pois.ts exists" || (echo "  FAIL: src/pois.ts missing" && exit 1)

# Check all 8 cities are defined
echo "Checking cities..."
for city in "Austin" "San Francisco" "New York" "Tokyo" "London" "Paris" "Dubai" "Washington"; do
  grep -q "$city" src/pois.ts && echo "  $city defined" || (echo "  FAIL: $city missing" && exit 1)
done

# Check POIs for each city (spot check)
echo "Checking POIs..."
grep -q "Texas State Capitol" src/pois.ts && echo "  Austin POIs defined" || (echo "  FAIL: Austin POIs missing" && exit 1)
grep -q "Golden Gate" src/pois.ts && echo "  SF POIs defined" || (echo "  FAIL: SF POIs missing" && exit 1)
grep -q "Empire State" src/pois.ts && echo "  NYC POIs defined" || (echo "  FAIL: NYC POIs missing" && exit 1)
grep -q "Tokyo Tower" src/pois.ts && echo "  Tokyo POIs defined" || (echo "  FAIL: Tokyo POIs missing" && exit 1)
grep -q "Tower Bridge" src/pois.ts && echo "  London POIs defined" || (echo "  FAIL: London POIs missing" && exit 1)
grep -q "Eiffel Tower" src/pois.ts && echo "  Paris POIs defined" || (echo "  FAIL: Paris POIs missing" && exit 1)
grep -q "Burj Khalifa" src/pois.ts && echo "  Dubai POIs defined" || (echo "  FAIL: Dubai POIs missing" && exit 1)
grep -q "Capitol" src/pois.ts && echo "  DC POIs defined" || (echo "  FAIL: DC POIs missing" && exit 1)

# Check fly-to function exists
echo "Checking navigation functions..."
grep -q "flyTo" src/pois.ts && echo "  flyTo function exists" || (echo "  FAIL: flyTo function missing" && exit 1)

# Check keyboard handlers
echo "Checking keyboard handlers..."
grep -q "keydown\|KeyboardEvent" src/main.ts && echo "  Keyboard handlers present" || (echo "  FAIL: Keyboard handlers missing" && exit 1)

# TypeScript check
echo "Running TypeScript check..."
bun run tsc --noEmit && echo "  TypeScript compiles" || (echo "  FAIL: TypeScript errors" && exit 1)

echo ""
echo "=== Phase 4 PASSED ==="
```

**Manual Verification Required:**
- Press Q/W/E/R/T and confirm camera flies to different POIs
- Confirm smooth 2s animation
- Confirm camera arrives at correct angle and altitude

---

## Phase 5: UI Shell — Layout & Styling

**Depends on:** Phase 3 (globe as visual backdrop), Phase 4 (navigation for city selector)  
**Output:** Complete terminal aesthetic UI with all panels rendered, vignette effect, live clock, stubbed controls

### Checklist

- [ ] Create `public/styles.css` with terminal aesthetic:
  - Black background (`#000`)
  - Primary cyan (`#00f0ff`)
  - Secondary teal (`#4a9e8a`)
  - Highlight green (`#00ff88`)
  - Monospace font (Courier New)
  - All text uppercase
  - CSS scanline texture overlay
- [ ] Implement `src/ui/shell.ts`:
  - Create top bar (WORLDVIEW wordmark, tagline, mode indicator, REC + timestamp)
  - Add classification watermark (`TOP SECRET // SI-TK // NOFORN`)
  - Add circular vignette overlay (CSS radial-gradient)
  - Initialize left panel, right panel, bottom bar
  - Start live clock interval (updates every second)
- [ ] Implement `src/ui/left-panel.ts`:
  - City selector dropdown (8 cities)
  - POI navigation (PREV/NEXT buttons, current POI display)
  - Stubbed toggles (COVERAGE ON, AUTO HOF SPY, PROJECTION IN)
  - Stubbed buttons (AUTO CAL, ALIGN - DRAPE)
  - Stubbed calibration sliders (7 sliders, disabled)
  - SAVE CAL / RESET CAL buttons (disabled)
  - CCTV placeholder ("NO FEED")
  - System log placeholder
- [ ] Implement `src/ui/right-panel.ts`:
  - PARAMETERS header
  - 3 stubbed sliders (Pixelation, Distortion, Instability)
  - Live readout (GSD, NIIRS, ALT, SUB)
  - Subscribe to camera change events for live updates
- [ ] Implement `src/ui/bottom-bar.ts`:
  - STYLE PRESETS label
  - Mode switcher buttons (NORMAL, CRT, NVG, FLIR, ANIME, NAVI)
  - Toggle active state on click (visual only)
  - City quick-jump tabs
  - Location tooltip (current POI + city)
- [ ] Wire up all event handlers:
  - City dropdown change -> fly to city
  - PREV/NEXT -> navigate POIs
  - Mode buttons -> toggle visual state
  - City tabs -> fly to city

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 5 verification script: scripts/verify-phase5.sh

set -e

echo "=== Phase 5 Verification ==="

# Check all UI files exist
echo "Checking UI file structure..."
[ -f "src/ui/shell.ts" ] && echo "  shell.ts exists" || (echo "  FAIL: shell.ts missing" && exit 1)
[ -f "src/ui/left-panel.ts" ] && echo "  left-panel.ts exists" || (echo "  FAIL: left-panel.ts missing" && exit 1)
[ -f "src/ui/right-panel.ts" ] && echo "  right-panel.ts exists" || (echo "  FAIL: right-panel.ts missing" && exit 1)
[ -f "src/ui/bottom-bar.ts" ] && echo "  bottom-bar.ts exists" || (echo "  FAIL: bottom-bar.ts missing" && exit 1)
[ -f "public/styles.css" ] && echo "  styles.css exists" || (echo "  FAIL: styles.css missing" && exit 1)

# Check CSS contains required styles
echo "Checking CSS terminal aesthetic..."
grep -q "#00f0ff" public/styles.css && echo "  Primary cyan color" || (echo "  FAIL: Cyan color missing" && exit 1)
grep -q "#4a9e8a" public/styles.css && echo "  Secondary teal color" || (echo "  FAIL: Teal color missing" && exit 1)
grep -q "#00ff88" public/styles.css && echo "  Highlight green color" || (echo "  FAIL: Green color missing" && exit 1)
grep -q "monospace\|Courier" public/styles.css && echo "  Monospace font" || (echo "  FAIL: Monospace font missing" && exit 1)
grep -q "uppercase" public/styles.css && echo "  Uppercase text" || (echo "  FAIL: Uppercase missing" && exit 1)
grep -q "radial-gradient" public/styles.css && echo "  Vignette gradient" || (echo "  FAIL: Vignette gradient missing" && exit 1)

# Check shell.ts content
echo "Checking shell implementation..."
grep -q "WORLDVIEW" src/ui/shell.ts && echo "  WORLDVIEW wordmark" || (echo "  FAIL: WORLDVIEW missing" && exit 1)
grep -q "TOP SECRET" src/ui/shell.ts && echo "  Classification watermark" || (echo "  FAIL: Classification missing" && exit 1)
grep -q "REC\|timestamp" src/ui/shell.ts && echo "  REC indicator" || (echo "  FAIL: REC indicator missing" && exit 1)

# Check left-panel.ts content
echo "Checking left panel..."
grep -q "dropdown\|select" src/ui/left-panel.ts && echo "  City selector" || (echo "  FAIL: City selector missing" && exit 1)
grep -q "PREV\|NEXT\|prev\|next" src/ui/left-panel.ts && echo "  POI navigation" || (echo "  FAIL: POI nav missing" && exit 1)
grep -q "disabled" src/ui/left-panel.ts && echo "  Stubbed controls" || (echo "  FAIL: Stubbed controls missing" && exit 1)

# Check right-panel.ts content
echo "Checking right panel..."
grep -q "PARAMETERS\|parameters" src/ui/right-panel.ts && echo "  Parameters header" || (echo "  FAIL: Parameters header missing" && exit 1)
grep -q "GSD\|ALT\|NIIRS" src/ui/right-panel.ts && echo "  Live readouts" || (echo "  FAIL: Live readouts missing" && exit 1)

# Check bottom-bar.ts content
echo "Checking bottom bar..."
grep -q "NORMAL\|CRT\|NVG\|FLIR" src/ui/bottom-bar.ts && echo "  Mode buttons" || (echo "  FAIL: Mode buttons missing" && exit 1)
grep -q "STYLE" src/ui/bottom-bar.ts && echo "  Style presets label" || (echo "  FAIL: Style presets missing" && exit 1)

# TypeScript check
echo "Running TypeScript check..."
bun run tsc --noEmit && echo "  TypeScript compiles" || (echo "  FAIL: TypeScript errors" && exit 1)

# Build check
echo "Running build..."
bun run build && echo "  Build succeeds" || (echo "  FAIL: Build failed" && exit 1)

echo ""
echo "=== Phase 5 PASSED ==="
```

**Manual Verification Required:**
- Visual inspection against reference screenshots
- Confirm vignette lens effect visible
- Confirm live clock updates every second
- Confirm stubbed controls appear disabled
- Confirm mode buttons toggle visually

---

## Phase 6: Integration, Polish & Acceptance Testing

**Depends on:** Phases 1-5 (all components must be complete)  
**Output:** Fully integrated application passing all acceptance criteria, no console errors, ready for demo

### Checklist

- [ ] Integration testing:
  - Start dev server (`bun run dev`)
  - Verify no console errors on load
  - Verify no TypeScript errors
  - Verify no network errors (except expected when API key missing)
- [ ] Verify all acceptance criteria (AC1-AC14):
  - AC1: `bun run dev` starts successfully
  - AC2: Google 3D Tiles render Earth
  - AC3: Zooming shows photorealistic buildings
  - AC4: City dropdown navigates
  - AC5: Q/W/E/R/T keyboard shortcuts work
  - AC6: PREV/NEXT buttons work
  - AC7: Terminal aesthetic correct
  - AC8: Vignette visible
  - AC9: Mode buttons toggle
  - AC10: Stubbed controls visible/disabled
  - AC11: Live ALT/SUB updating
  - AC12: Live REC timestamp
  - AC13: API key not in bundle
  - AC14: No console errors
- [ ] Polish and edge cases:
  - Handle missing API key gracefully (show error message)
  - Handle tile loading errors
  - Ensure keyboard shortcuts don't interfere with browser defaults
  - Test in Chrome and Firefox
- [ ] Update README with:
  - Setup instructions
  - API key configuration
  - Development commands
  - Architecture overview

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# Phase 6 verification script: scripts/verify-phase6.sh

set -e

echo "=== Phase 6 Verification: Acceptance Criteria ==="

# AC1: bun run dev starts successfully
echo "AC1: Testing dev server startup..."
timeout 10 bun run dev &
DEV_PID=$!
sleep 5
if ps -p $DEV_PID > /dev/null 2>&1; then
  echo "  PASS: Dev server started"
  kill $DEV_PID 2>/dev/null || true
else
  echo "  FAIL: Dev server crashed"
  exit 1
fi

# AC13: API key not in bundle
echo "AC13: Checking API key not exposed..."
bun run build
if grep -r "GOOGLE_MAPS_TILE_API_KEY\|AIza" dist/ 2>/dev/null; then
  echo "  FAIL: API key found in bundle!"
  exit 1
else
  echo "  PASS: API key not in bundle"
fi

# Check all source files compile
echo "Checking TypeScript compilation..."
bun run tsc --noEmit && echo "  PASS: No TypeScript errors" || (echo "  FAIL: TypeScript errors" && exit 1)

# Check all required exports exist
echo "Checking module exports..."
grep -q "export" src/globe.ts && echo "  globe.ts exports" || (echo "  FAIL: globe.ts missing exports" && exit 1)
grep -q "export" src/pois.ts && echo "  pois.ts exports" || (echo "  FAIL: pois.ts missing exports" && exit 1)
grep -q "export" src/ui/shell.ts && echo "  shell.ts exports" || (echo "  FAIL: shell.ts missing exports" && exit 1)

# Final build verification
echo "Final build check..."
bun run build && echo "  PASS: Production build succeeds" || (echo "  FAIL: Build failed" && exit 1)

echo ""
echo "=== Phase 6 PASSED ==="
echo ""
echo "MANUAL VERIFICATION REQUIRED:"
echo "  - AC2:  Globe renders with 3D tiles"
echo "  - AC3:  Zooming shows buildings"
echo "  - AC4:  City dropdown navigates"
echo "  - AC5:  Q/W/E/R/T shortcuts work"
echo "  - AC6:  PREV/NEXT buttons work"
echo "  - AC7:  Terminal aesthetic correct"
echo "  - AC8:  Vignette visible"
echo "  - AC9:  Mode buttons toggle"
echo "  - AC10: Stubbed controls disabled"
echo "  - AC11: Live ALT/SUB updating"
echo "  - AC12: Live REC timestamp"
echo "  - AC14: No console errors"
```

---

## Summary

| Phase | Name | Depends On | Estimated Complexity |
|-------|------|------------|---------------------|
| 1 | Project Scaffold & Build System | - | Low |
| 2 | Google 3D Tiles Proxy | Phase 1 | Low |
| 3 | 3D Globe with CesiumJS | Phase 1, 2 | Medium |
| 4 | City & POI Navigation | Phase 3 | Medium |
| 5 | UI Shell — Layout & Styling | Phase 3, 4 | High |
| 6 | Integration & Acceptance Testing | Phases 1-5 | Low |

---

## Dependency Graph

```
Phase 1 (Scaffold)
    │
    ├──> Phase 2 (Proxy)
    │        │
    │        v
    └──> Phase 3 (Globe) <────────┐
              │                    │
              v                    │
         Phase 4 (POIs)            │
              │                    │
              v                    │
         Phase 5 (UI) ─────────────┘
              │
              v
         Phase 6 (Integration)
```

---

## Verification Scripts Location

All verification scripts should be placed in `scripts/` directory:

```
scripts/
├── verify-phase1.sh
├── verify-phase2.sh
├── verify-phase3.sh
├── verify-phase4.sh
├── verify-phase5.sh
└── verify-phase6.sh
```

Run with: `bash scripts/verify-phaseN.sh`

Each script exits with code 0 on success, non-zero on failure, enabling CI/CD integration.
