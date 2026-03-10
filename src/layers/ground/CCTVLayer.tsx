/**
 * WorldView - CCTV Layer
 * Camera markers rendered via BillboardCollection (NOT Entity API)
 * CRITICAL: Uses canvas directly for texture updates - NO toDataURL() (Blocklist #2)
 */

import { createEffect, onCleanup, createSignal, on } from "solid-js";
import { createBillboardCollection, type BillboardOptions } from "../../cesium/createBillboardCollection.ts";
import { useCesium } from "../../cesium/useCesium.ts";
import { groundState, setCameras, setCenterStageCamera } from "./store.ts";
import { PROXY_ENDPOINTS } from "../../config.ts";
import type { Camera, BBox } from "./types.ts";

declare const Cesium: typeof import("cesium");

/** Configuration */
const CONFIG = {
  markerSize: 24,
  viewportDebounceMs: 1000,
  maxProjectedBillboards: 4,
  billboardWidth: 200,
  billboardHeight: 150,
  billboardAltitude: 15,
  billboardRefreshMs: 30_000,
};

/** Camera icon texture cache */
let cameraIconCanvas: HTMLCanvasElement | null = null;

/**
 * Create camera marker icon texture
 */
function createCameraIconTexture(): HTMLCanvasElement {
  if (cameraIconCanvas) return cameraIconCanvas;

  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const centerX = size / 2;
  const centerY = size / 2;

  // Black circle background
  ctx.beginPath();
  ctx.arc(centerX, centerY, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();

  // Green border
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Camera body (rounded rectangle)
  ctx.fillStyle = "#00ff88";
  const bodyX = centerX - 10;
  const bodyY = centerY - 6;
  const bodyW = 20;
  const bodyH = 12;
  const radius = 2;

  ctx.beginPath();
  ctx.moveTo(bodyX + radius, bodyY);
  ctx.lineTo(bodyX + bodyW - radius, bodyY);
  ctx.quadraticCurveTo(bodyX + bodyW, bodyY, bodyX + bodyW, bodyY + radius);
  ctx.lineTo(bodyX + bodyW, bodyY + bodyH - radius);
  ctx.quadraticCurveTo(bodyX + bodyW, bodyY + bodyH, bodyX + bodyW - radius, bodyY + bodyH);
  ctx.lineTo(bodyX + radius, bodyY + bodyH);
  ctx.quadraticCurveTo(bodyX, bodyY + bodyH, bodyX, bodyY + bodyH - radius);
  ctx.lineTo(bodyX, bodyY + radius);
  ctx.quadraticCurveTo(bodyX, bodyY, bodyX + radius, bodyY);
  ctx.closePath();
  ctx.fill();

  // Lens (circle)
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#00ff88";
  ctx.fill();

  // Lens highlight
  ctx.beginPath();
  ctx.arc(centerX - 1, centerY - 1, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  cameraIconCanvas = canvas;
  return canvas;
}

/**
 * CCTVLayer - Renders CCTV camera markers on the map
 */
export function CCTVLayer() {
  const { viewer, ready } = useCesium();

  const [cameras, setCamerasLocal] = createSignal<Camera[]>([]);
  let viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Create billboard collection for camera markers
  const markerCollection = createBillboardCollection();

  /**
   * Get viewport bounding box
   */
  function getViewportBbox(): BBox | null {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const camera = v.camera;
    const canvas = v.scene.canvas;
    const ellipsoid = v.scene.globe.ellipsoid;

    const corners = [
      new Cesium.Cartesian2(0, 0),
      new Cesium.Cartesian2(canvas.clientWidth, 0),
      new Cesium.Cartesian2(0, canvas.clientHeight),
      new Cesium.Cartesian2(canvas.clientWidth, canvas.clientHeight),
    ];

    let minLat = Infinity,
      maxLat = -Infinity,
      minLon = Infinity,
      maxLon = -Infinity;
    let validCorners = 0;

    for (const corner of corners) {
      const ray = camera.getPickRay(corner);
      if (!ray) continue;

      const position = v.scene.globe.pick(ray, v.scene);
      if (!position) continue;

      const cartographic = ellipsoid.cartesianToCartographic(position);
      if (!cartographic) continue;

      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      validCorners++;
    }

    if (validCorners < 2) return null;

    return {
      south: minLat,
      north: maxLat,
      west: minLon,
      east: maxLon,
    };
  }

  /**
   * Fetch cameras in viewport from proxy
   */
  async function fetchCamerasInViewport(): Promise<void> {
    const bbox = getViewportBbox();
    if (!bbox) return;

    try {
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
      });

      const response = await fetch(`${PROXY_ENDPOINTS.cctvCameras}?${params}`);

      if (!response.ok) {
        console.error(`[CCTVLayer] Failed to fetch cameras: ${response.status}`);
        return;
      }

      const data: Camera[] = await response.json();
      setCamerasLocal(data);
      setCameras(data);

      console.log(`[CCTVLayer] Fetched ${data.length} cameras`);
    } catch (error) {
      console.error("[CCTVLayer] Error fetching cameras:", error);
    }
  }

  /**
   * Update billboard markers based on camera data
   */
  function updateMarkers(): void {
    const cameraData = cameras();
    const iconCanvas = createCameraIconTexture();

    // Get current billboard IDs
    const currentIds = new Set<string>();
    const count = markerCollection.count();

    // Collect current marker IDs
    for (let i = 0; i < count; i++) {
      const billboard = markerCollection.collection?.get(i);
      if (billboard?.id) {
        currentIds.add(billboard.id as string);
      }
    }

    const newIds = new Set(cameraData.map((c) => `cctv-marker:${c.id}`));

    // Remove markers for cameras no longer in view
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        markerCollection.remove(id);
      }
    }

    // Add markers for new cameras
    for (const camera of cameraData) {
      const markerId = `cctv-marker:${camera.id}`;

      if (!currentIds.has(markerId)) {
        markerCollection.add({
          id: markerId,
          position: Cesium.Cartesian3.fromDegrees(
            camera.longitude,
            camera.latitude,
            10
          ),
          // CRITICAL: Pass canvas directly - NO toDataURL()
          image: iconCanvas,
          scale: CONFIG.markerSize / 40, // Scale to desired size
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          data: { cameraId: camera.id, name: camera.name },
        });
      }
    }
  }

  /**
   * Handle camera movement with debounce
   */
  function handleCameraChange(): void {
    if (viewportDebounceTimer) {
      clearTimeout(viewportDebounceTimer);
    }

    viewportDebounceTimer = setTimeout(() => {
      fetchCamerasInViewport();
    }, CONFIG.viewportDebounceMs);
  }

  // Update markers when camera data changes
  createEffect(
    on(cameras, () => {
      updateMarkers();
    })
  );

  // Markers are always visible when the ground layer is active
  // (cctvEnabled sub-toggle no longer hides billboard markers)

  // Set up camera listener and initial fetch
  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    v.camera.moveEnd.addEventListener(handleCameraChange);

    // Initial fetch
    fetchCamerasInViewport();

    onCleanup(() => {
      if (!v.isDestroyed()) {
        v.camera.moveEnd.removeEventListener(handleCameraChange);
      }
    });
  });

  // Set up click handler for camera selection
  createEffect(() => {
    if (!ready()) return;
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);

      if (Cesium.defined(pickedObject)) {
        const billboard = pickedObject.id;
        if (billboard && typeof billboard.id === "string" && billboard.id.startsWith("cctv-marker:")) {
          const cameraId = billboard.id.replace("cctv-marker:", "");
          console.log("[CCTVLayer] Selected camera:", cameraId);
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

  // Cleanup
  onCleanup(() => {
    if (viewportDebounceTimer) {
      clearTimeout(viewportDebounceTimer);
    }
    markerCollection.clear();
    console.log("[CCTVLayer] Unmounted");
  });

  return null;
}

export default CCTVLayer;
