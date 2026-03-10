# CCTV Feature Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix traffic cameras not showing on the ground layer, and restore the full CCTV feature (camera markers on the globe + video panel when a camera is selected).

**Architecture:** `CCTVLayer.tsx` fetches cameras in viewport, renders billboard markers. A `CCTVPanel` component (currently missing from the UI) shows a live feed when a camera billboard is clicked. The proxy server at `/api/cctv/cameras` provides camera data; `/api/cctv/stream/:id` provides HLS video streams.

**Tech Stack:** SolidJS, CesiumJS, HLS.js, TypeScript, Bun

---

## Chunk 1: Diagnose and fix camera markers

### Task 1: Verify the CCTV proxy endpoint

**Files:**
- Check: proxy server routes in `src/server/`

- [ ] **Step 1: Find the CCTV route handler**

```bash
grep -r "cctv" src/server/ --include="*.ts" -l
grep -r "/api/cctv" src/server/ --include="*.ts" -l
```

- [ ] **Step 2: Test the endpoint directly**

```bash
# First navigate to a location in the app (e.g., downtown Austin), then:
curl "http://localhost:3001/api/cctv/cameras?bbox=-97.8,30.2,-97.6,30.4"
```

Expected: JSON array of camera objects with `id`, `name`, `latitude`, `longitude`.

- [ ] **Step 3: If endpoint returns 404 — the route is missing**

Skip to Task 2 to implement the proxy route.

- [ ] **Step 4: If endpoint returns empty array `[]` — data source issue**

The proxy may not have a CCTV data source configured. Check `.env` for CCTV API keys or data source URLs.

- [ ] **Step 5: If endpoint returns camera data correctly**

Verify `CCTVLayer` is fetching and updating markers. Add logging:
```typescript
console.log(`[CCTVLayer] Fetched ${data.length} cameras for bbox: ${params}`);
```

---

### Task 2: Implement CCTV proxy route (if missing)

**Files:**
- Modify: appropriate file in `src/server/`

- [ ] **Step 1: Find where other proxy routes are defined**

```bash
grep -r "PROXY_ENDPOINTS" src/server/ --include="*.ts" -l
# Look for route handlers for /flights, /ships, etc.
ls src/server/
```

- [ ] **Step 2: Check the `dev` branch for the original CCTV proxy implementation**

```bash
git show dev:src/server.ts | grep -A 30 "cctv"
# Or look at the whole file:
git show dev:src/server.ts | head -200
```

Use the old implementation as reference.

- [ ] **Step 3: Implement the `/api/cctv/cameras` route**

Based on what you find in the dev branch, implement the route. It likely fetches from an open CCTV API (e.g., EarthCam, OpenCCTV, or a similar source).

If the old implementation used a specific API key that's in `.env`, verify the key is present.

- [ ] **Step 4: Implement thumbnail and stream routes if missing**

```
GET /api/cctv/thumbnail/:id → proxies thumbnail image
GET /api/cctv/stream/:id → proxies HLS stream URL or redirects
```

- [ ] **Step 5: Test endpoints**

```bash
curl "http://localhost:3001/api/cctv/cameras?bbox=-97.8,30.2,-97.6,30.4"
# Should return camera array
```

- [ ] **Step 6: Commit**

```bash
git add src/server/
git commit -m "fix: implement CCTV proxy endpoints"
```

---

### Task 3: Fix viewport bbox in `CCTVLayer`

**Files:**
- Modify: `src/layers/ground/CCTVLayer.tsx`

- [ ] **Step 1: Add logging to `getViewportBbox()`**

```typescript
function getViewportBbox(): BBox | null {
  const v = viewer();
  if (!v || v.isDestroyed()) return null;
  // ... existing logic ...
  if (validCorners < 2) {
    console.warn("[CCTVLayer] Cannot compute viewport bbox (camera may be looking at sky)");
    return null;
  }
  console.log(`[CCTVLayer] Viewport bbox: ${minLat},${minLon} to ${maxLat},${maxLon}`);
  return { south: minLat, north: maxLat, west: minLon, east: maxLon };
}
```

- [ ] **Step 2: Test with camera looking at ground vs sky**

When zoomed in at street level → bbox should compute correctly.  
When zoomed all the way out (whole Earth view) → may return null (expected — too large).

- [ ] **Step 3: Add a zoom-level check to avoid fetching at global scale**

If the bbox is too large (e.g., > 1 degree of span), don't fetch — CCTV cameras are only meaningful at street/city level:

```typescript
async function fetchCamerasInViewport(): Promise<void> {
  const bbox = getViewportBbox();
  if (!bbox) return;

  // Only fetch when zoomed to city-level or closer
  const lonSpan = bbox.east - bbox.west;
  const latSpan = bbox.north - bbox.south;
  if (lonSpan > 0.5 || latSpan > 0.5) {
    console.log("[CCTVLayer] Too zoomed out to show CCTV cameras");
    return;
  }
  // ... rest of fetch
}
```

- [ ] **Step 4: Commit once cameras appear on the map**

```bash
git add src/layers/ground/CCTVLayer.tsx
git commit -m "fix: CCTV camera markers fetch and display in viewport"
```

---

## Chunk 2: Restore CCTV video panel

### Task 4: Add click handler for camera selection

**Files:**
- Modify: `src/layers/ground/CCTVLayer.tsx`

- [ ] **Step 1: Add `ScreenSpaceEventHandler` for left-click on camera markers**

In `CCTVLayer`, add after the camera move listener setup:

```typescript
// Setup click handler for camera selection
createEffect(() => {
  if (!ready()) return;
  const v = viewer();
  if (!v || v.isDestroyed()) return;

  const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const pickedObject = v.scene.pick(click.position);

    if (Cesium.defined(pickedObject)) {
      // Check if it's one of our CCTV markers
      const billboard = pickedObject.id;
      if (billboard && typeof billboard.id === "string" && billboard.id.startsWith("cctv-marker:")) {
        const cameraId = billboard.id.replace("cctv-marker:", "");
        setCenterStageCamera(cameraId);
        return;
      }
    }

    // Clicked empty space - close panel if open
    if (groundState.centerStageCameraId) {
      setCenterStageCamera(null);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  onCleanup(() => {
    if (!handler.isDestroyed()) {
      handler.destroy();
    }
  });
});
```

Note: `setCenterStageCamera` is already imported from `./store.ts`.

- [ ] **Step 2: Verify clicking a camera marker updates the store**

Add temporary log: `console.log("[CCTVLayer] Selected camera:", cameraId)`.

- [ ] **Step 3: Commit**

```bash
git add src/layers/ground/CCTVLayer.tsx
git commit -m "feat: add click handler for CCTV camera selection"
```

---

### Task 5: Create CCTV video panel component

**Files:**
- Create: `src/ui/panels/CCTVPanel.tsx`

- [ ] **Step 1: Check dev branch for the original CCTV panel**

```bash
git show dev:src/ui/ 2>/dev/null
# Or look for any CCTV panel:
git show dev -- --name-only | grep -i cctv
```

- [ ] **Step 2: Create `src/ui/panels/CCTVPanel.tsx`**

```typescript
/**
 * WorldView - CCTV Panel
 * Displays live video feed when a CCTV camera is selected.
 * Uses HLS.js for stream playback.
 */

import { createEffect, onCleanup, Show } from "solid-js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { PROXY_ENDPOINTS } from "../../config";

declare const Hls: typeof import("hls.js").default;

/**
 * CCTVPanel - Fullscreen video overlay for selected CCTV camera
 */
export function CCTVPanel() {
  let videoRef: HTMLVideoElement | undefined;
  let hlsInstance: InstanceType<typeof Hls> | null = null;

  function destroyHls(): void {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  createEffect(() => {
    const cameraId = groundState.centerStageCameraId;

    // Cleanup previous stream
    destroyHls();

    if (!cameraId || !videoRef) return;

    const streamUrl = PROXY_ENDPOINTS.cctvStream(cameraId);

    if (typeof Hls !== "undefined" && Hls.isSupported()) {
      hlsInstance = new Hls();
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(videoRef);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef?.play().catch(console.error);
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("[CCTVPanel] HLS fatal error:", data);
          // Fall back to thumbnail
        }
      });
    } else if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      videoRef.src = streamUrl;
      videoRef.play().catch(console.error);
    } else {
      console.warn("[CCTVPanel] HLS not supported, showing thumbnail");
    }
  });

  onCleanup(() => {
    destroyHls();
  });

  return (
    <Show when={groundState.centerStageCameraId}>
      {(cameraId) => (
        <div class="cctv-panel">
          <div class="cctv-panel-header">
            <span class="cctv-panel-title">
              CCTV: {groundState.cctvCameras.find((c) => c.id === cameraId())?.name ?? cameraId()}
            </span>
            <button
              class="cctv-panel-close"
              onClick={() => setCenterStageCamera(null)}
            >
              ✕
            </button>
          </div>
          <div class="cctv-panel-content">
            <video
              ref={videoRef}
              class="cctv-video"
              controls
              muted
              autoplay
              poster={PROXY_ENDPOINTS.cctvThumbnail(cameraId())}
            />
          </div>
        </div>
      )}
    </Show>
  );
}

export default CCTVPanel;
```

- [ ] **Step 3: Add CCTV panel styles to `public/styles.css`**

Check existing styles for panel patterns. Add:
```css
/* CCTV Panel */
.cctv-panel {
  position: fixed;
  bottom: 60px;
  right: 20px;
  width: 400px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(0, 255, 136, 0.5);
  z-index: 1000;
}

.cctv-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
  font-family: 'Courier New', monospace;
  color: #00ff88;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cctv-panel-close {
  background: none;
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #00ff88;
  cursor: pointer;
  padding: 2px 8px;
  font-family: inherit;
}

.cctv-panel-close:hover {
  background: rgba(0, 255, 136, 0.1);
}

.cctv-video {
  width: 100%;
  display: block;
  max-height: 280px;
  background: #000;
}
```

- [ ] **Step 4: Wire `CCTVPanel` into `ShellComponent.tsx`**

Read `src/ui/ShellComponent.tsx`:

```bash
# Check what's in ShellComponent
```

Add `CCTVPanel` import and render it inside the Shell:

```typescript
import { CCTVPanel } from "./panels/CCTVPanel";

// Inside Shell component return:
<CCTVPanel />
```

- [ ] **Step 5: Verify HLS.js is available**

HLS.js is imported in `index.html` via importmap as `"hls.js": "/hls.js/hls.mjs"`. The `Hls` global may or may not be present. Check how it's loaded. If imported as ESM, use:
```typescript
import Hls from "hls.js";
```

instead of the global pattern.

- [ ] **Step 6: Test the CCTV panel**

Enable GROUND → enable CCTV → zoom to a city → wait for camera markers → click a camera marker → panel should appear with video/thumbnail.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/CCTVPanel.tsx src/ui/ShellComponent.tsx public/styles.css
git commit -m "feat: restore CCTV video panel with HLS stream playback"
```

---

## Final Verification

- [ ] CCTV proxy endpoints return camera data
- [ ] Camera markers (green camera icons) appear on the globe when CCTV is enabled and zoomed to city level
- [ ] Clicking a camera marker opens the CCTV panel
- [ ] CCTV panel shows camera name and video/thumbnail
- [ ] Closing the panel (✕ button) dismisses it
- [ ] Clicking empty space also dismisses the panel
- [ ] No HLS errors for cameras with working streams
- [ ] Thumbnail fallback shows when stream is unavailable
