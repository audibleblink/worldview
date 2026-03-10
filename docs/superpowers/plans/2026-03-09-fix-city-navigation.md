# City/POI Navigation Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix city and POI navigation so that selecting a city or clicking Prev/Next POI actually flies the camera to the selected location.

**Architecture:** `LeftPanelComponent.tsx` has city/POI state but never calls Cesium's `camera.flyTo()`. Fix: import `useCesium()` to get `viewer()`, then call `flyTo` in the navigation handlers using the POI's `lat`, `lng`, `altitude`, and `pitch` fields.

**Tech Stack:** SolidJS, CesiumJS, TypeScript, Bun

---

## Chunk 1: Wire POI navigation to camera flyTo

### Task 1: Understand the POI data structure

**Files:**
- Read: `src/data/pois.json`

- [ ] **Step 1: Inspect `pois.json` to confirm field names**

```bash
head -30 src/data/pois.json
```

Confirm each POI has: `name`, `lat`, `lng`, `altitude`, `pitch`.

---

### Task 2: Add camera flyTo to `LeftPanelComponent`

**Files:**
- Modify: `src/ui/LeftPanelComponent.tsx`

- [ ] **Step 1: Import `useCesium` at the top of the file**

Add after existing imports:
```typescript
import { useCesium } from "../cesium/useCesium";
```

- [ ] **Step 2: Get `viewer` inside the `LeftPanel` component**

At the top of the `LeftPanel` function body, add:
```typescript
const { viewer } = useCesium();
```

- [ ] **Step 3: Add a `flyToPOI` helper function**

```typescript
function flyToPOI(poi: POI): void {
  const v = viewer();
  if (!v || v.isDestroyed()) return;

  // Offset latitude slightly to compensate for oblique camera angle
  const pitch = poi.pitch ?? -45;
  const pitchRad = Math.abs(pitch) * (Math.PI / 180);
  const latOffset = (poi.altitude / 111000) * Math.tan(pitchRad);

  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      poi.lng,
      poi.lat - latOffset,
      poi.altitude
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(pitch),
      roll: 0,
    },
    duration: 2,
  });
}
```

Note: `declare const Cesium` is already declared globally in the app via the script tag. Add at the top of the file if not already present:
```typescript
declare const Cesium: typeof import("cesium");
```

- [ ] **Step 4: Call `flyToPOI` in `handleCityChange`**

After `setCurrentCityIndex` and `setCurrentPOIIndex(0)`, fly to the first POI of the newly selected city:

```typescript
function handleCityChange(event: Event): void {
  const select = event.target as HTMLSelectElement;
  const index = parseInt(select.value, 10);
  setCurrentCityIndex(index);
  setCurrentPOIIndex(0);
  addLogEntry(`[NAV] Flying to ${cities[index]?.name}`);
  
  // Fly to first POI of selected city
  const firstPOI = cities[index]?.pois[0];
  if (firstPOI) {
    flyToPOI(firstPOI);
  }
}
```

- [ ] **Step 5: Call `flyToPOI` in `handlePrevPOI`**

```typescript
function handlePrevPOI(): void {
  if (canGoPrev()) {
    const newIndex = currentPOIIndex() - 1;
    setCurrentPOIIndex(newIndex);
    const poi = currentCity()?.pois[newIndex];
    if (poi) {
      addLogEntry(`[NAV] POI: ${poi.name}`);
      flyToPOI(poi);
    }
  }
}
```

- [ ] **Step 6: Call `flyToPOI` in `handleNextPOI`**

```typescript
function handleNextPOI(): void {
  if (canGoNext()) {
    const newIndex = currentPOIIndex() + 1;
    setCurrentPOIIndex(newIndex);
    const poi = currentCity()?.pois[newIndex];
    if (poi) {
      addLogEntry(`[NAV] POI: ${poi.name}`);
      flyToPOI(poi);
    }
  }
}
```

Note: The existing `handlePrevPOI`/`handleNextPOI` have a subtle bug — they log using `currentPOIIndex() - 1` before the state updates (index is stale). The new version uses the local `newIndex` variable, which is correct.

- [ ] **Step 7: Optionally fly to initial city on mount**

Add an `onMount` call to fly to the default city/POI:

```typescript
onMount(() => {
  console.log("[LeftPanel] Mounted");
  
  // Fly to initial POI after a short delay (viewer may not be ready immediately)
  setTimeout(() => {
    const poi = currentPOI();
    if (poi) {
      flyToPOI(poi);
    }
  }, 2000);
});
```

- [ ] **Step 8: Commit**

```bash
git add src/ui/LeftPanelComponent.tsx
git commit -m "fix: wire city/POI navigation to camera flyTo"
```

---

## Chunk 2: Verify CommandBar geocoding

### Task 3: Verify goto command flies correctly

**Files:**
- Read: `src/ui/CommandBar.tsx`

- [ ] **Step 1: Confirm `flyTo` argument order is correct**

In `CommandBar.tsx`, the `flyTo` function calls:
```typescript
v.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(longitude, latitude - latOffset, height),
  ...
});
```

`Cesium.Cartesian3.fromDegrees` takes `(longitude, latitude, height)`. ✓ Correct.

- [ ] **Step 2: Test `:goto Austin` in the command bar**

Run app, press `:` to open command bar, type `goto Austin`, press Enter. Camera should fly to Austin, TX.

- [ ] **Step 3: Test `:goto 30.2672, -97.7431` (coordinate format)**

Camera should fly to Austin by coordinates.

- [ ] **Step 4: If geocoding fails, check the proxy server's `/geocode` endpoint**

```bash
curl "http://localhost:3001/geocode?address=Austin"
```

Confirm it returns `{ ok: true, results: [...] }`.

---

## Final Verification

- [ ] Selecting a city from the dropdown flies the camera to that city's first POI
- [ ] Clicking PREV/NEXT POI flies to the newly selected POI
- [ ] The log entries reflect the correct POI name (not stale index)
- [ ] Command bar `:goto <place>` works correctly
- [ ] No console errors during navigation
