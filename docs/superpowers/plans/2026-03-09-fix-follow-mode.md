# Follow Mode Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix camera follow mode so that selecting a satellite/plane/ship jumps to it immediately and the viewport tracks it continuously.

**Architecture:** Each layer calls `useFollowMode().track(positionGetter, options)` on double-click. The hook's `usePreRender` callback calls `camera.lookAt(target, hpr)` every frame. The missing piece is an initial flyTo jump before follow activates.

**Tech Stack:** SolidJS, CesiumJS, TypeScript, Bun

---

## Chunk 1: Diagnose and fix `useFollowMode`

### Task 1: Verify `usePreRender` is firing during follow mode

**Files:**
- Modify: `src/cesium/hooks/useFollowMode.ts`

- [ ] **Step 1: Add diagnostic logging to confirm the preRender callback fires**

In `useFollowMode.ts`, inside the `usePreRender` callback, add a temporary log:

```typescript
usePreRender(() => {
  if (!isFollowing()) return;
  if (!positionGetter) return;
  console.log("[useFollowMode] preRender tick, isFollowing=", isFollowing());
  // ... rest of logic
});
```

- [ ] **Step 2: Run the app and trigger follow mode**

```bash
bun run src/server.ts
```

Open browser → double-click a satellite → check browser console for `[useFollowMode] preRender tick` messages. If they appear, the hook is wiring correctly. If not, `usePreRender` is not being called.

- [ ] **Step 3: Check `usePreRender` registration**

Read `src/cesium/hooks/usePreRender.ts`. Confirm it registers a `scene.preRender.addEventListener` callback. Confirm it's cleaned up on `onCleanup`.

- [ ] **Step 4: Remove the diagnostic log once confirmed working**

---

### Task 2: Add initial flyTo jump when follow mode starts

**Files:**
- Modify: `src/cesium/hooks/useFollowMode.ts`

The `track()` function currently just sets state and calls `setIsFollowing(true)`. The camera snaps to `lookAt` on the next preRender frame, but the viewport doesn't animate — it teleports. If the satellite is far off-screen, this can be disorienting and may appear to "not work" if the camera ends up looking at empty space.

- [ ] **Step 1: Add an optional `flyToFirst` option to `FollowOptions`**

```typescript
export interface FollowOptions {
  heading?: number;
  pitch?: number;
  range?: number;
  useGroundLevel?: boolean;
  /** If true, fly to the initial position before starting continuous follow */
  flyToFirst?: boolean;
}
```

- [ ] **Step 2: Implement flyTo in `track()`**

```typescript
const track = (
  getPosition: () => Cesium.Cartesian3 | null,
  options: FollowOptions = {}
) => {
  positionGetter = getPosition;
  currentHeading = options.heading ?? DEFAULT_HEADING;
  currentPitch = options.pitch ?? DEFAULT_PITCH;
  currentRange = options.range ?? DEFAULT_RANGE;
  useGroundLevel = options.useGroundLevel ?? false;
  lastCamPos = null;

  // Optionally fly to target first, then activate continuous follow
  const position = getPosition();
  const v = viewer();
  if (position && v && !v.isDestroyed() && options.flyToFirst !== false) {
    // Determine target (ground level if needed)
    let target = position;
    if (useGroundLevel) {
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      target = Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        0
      );
    }

    v.camera.flyTo({
      destination: target,
      orientation: {
        heading: currentHeading,
        pitch: currentPitch,
        roll: 0,
      },
      offset: new Cesium.HeadingPitchRange(currentHeading, currentPitch, currentRange),
      duration: 1.5,
      complete: () => {
        setIsFollowing(true);
      },
    });
  } else {
    setIsFollowing(true);
  }

  console.log("[useFollowMode] Follow mode starting");
};
```

**Note:** `camera.flyTo` with an `offset` flies to keep the target in view at the given range. After completion, `setIsFollowing(true)` activates the per-frame `lookAt` tracking.

- [ ] **Step 3: Verify the flyTo callback fires**

In browser: double-click satellite → camera should animate toward it over 1.5s, then lock on and track.

- [ ] **Step 4: Commit**

```bash
git add src/cesium/hooks/useFollowMode.ts
git commit -m "fix: add initial flyTo jump before follow mode activates"
```

---

### Task 3: Fix satellite follow — warm up position before tracking

**Files:**
- Modify: `src/layers/satellites/SatelliteLayer.tsx`

- [ ] **Step 1: In `startFollowMode()`, ensure the position is available before calling `track()`**

Current code:
```typescript
function startFollowMode() {
  const noradId = selectedNoradId();
  if (!noradId) return;

  followSatellite(noradId);

  track(
    () => satellitePositions.get(noradId) ?? null,
    {
      heading: 0,
      pitch: -Math.PI / 4,
      range: FOLLOW_RANGE_METERS,
    }
  );
}
```

If `satellitePositions` doesn't have the entry yet, compute it:

```typescript
function startFollowMode() {
  const noradId = selectedNoradId();
  if (!noradId) return;

  const record = getSatelliteByNoradId(noradId);
  if (!record) return;

  // Warm up position if not yet cached
  if (!satellitePositions.has(noradId)) {
    const positions = propagateAll([record], new Date());
    if (positions[0]) {
      satellitePositions.set(noradId, positions[0].cartesian);
    }
  }

  followSatellite(noradId);

  track(
    () => satellitePositions.get(noradId) ?? null,
    {
      heading: 0,
      pitch: -Math.PI / 4,
      range: FOLLOW_RANGE_METERS,
    }
  );
}
```

- [ ] **Step 2: Verify selecting a satellite from the command bar (`:follow 25544`) jumps to it**

Run app, type `:follow 25544` (ISS NORAD ID), confirm camera jumps.

- [ ] **Step 3: Commit**

```bash
git add src/layers/satellites/SatelliteLayer.tsx
git commit -m "fix: warm up satellite position before starting follow mode"
```

---

### Task 4: Verify flight follow mode works

**Files:**
- Modify: `src/layers/flights/FlightLayer.tsx` (if needed)

- [ ] **Step 1: Double-click a flight, confirm camera flies to it and tracks**

`FlightLayer.startFollowingFlight()` passes `getCurrentPosition()` which reads from `interpolatedPositions`. This is populated in `addEntity()` and updated in `usePreRender`. Should work as-is once `useFollowMode` flyTo is fixed.

- [ ] **Step 2: If flights layer is empty (no flights rendering), skip this step and mark as blocked by `wt-planes` fix**

- [ ] **Step 3: Commit if changes were needed**

```bash
git add src/layers/flights/FlightLayer.tsx
git commit -m "fix: flight follow mode verified working"
```

---

### Task 5: Verify ship follow mode works

**Files:**
- Modify: `src/layers/ships/ShipLayer.tsx` (if needed)

- [ ] **Step 1: Double-click a ship, confirm camera flies to it and tracks**

`ShipLayer.startFollowMode()` passes `() => interpolatedPositions.get(mmsi) ?? null` with `useGroundLevel: true`. The position is populated in `addShip()`. Should work once flyTo fix is in.

- [ ] **Step 2: Confirm the camera doesn't oscillate or jitter during ship follow**

The `useGroundLevel: true` option targets ground level below the ship's position, which keeps the camera at a consistent altitude rather than tracking the ship billboard directly. Correct behavior.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add src/layers/ships/ShipLayer.tsx
git commit -m "fix: ship follow mode verified working"
```

---

## Final Verification

- [ ] All three entity types (satellite, flight, ship) can be followed
- [ ] Camera animates to target on follow initiation (flyTo jump)
- [ ] Camera continuously tracks the target as it moves
- [ ] Pressing Escape or clicking empty space stops follow mode
- [ ] No console errors during follow mode
