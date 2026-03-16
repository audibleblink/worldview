/**
 * WorldView - CCTV Layer
 * Camera markers rendered via BillboardCollection (NOT Entity API)
 * CRITICAL: Uses canvas directly for texture updates - NO toDataURL() (Blocklist #2)
 */

import { createEffect, onCleanup, on } from "solid-js";
import { createBillboardCollection } from "../../cesium/createBillboardCollection.ts";
import { useCesium } from "../../cesium/useCesium.ts";
import { groundState, setCenterStageCamera } from "./store.ts";

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

  // Read cameras from the shared store (fetching done by CCTVCameraListPanel via useCCTVFetcher)
  const cameras = () => groundState.cctvCameras;

  // Create billboard collection for camera markers
  const markerCollection = createBillboardCollection();

  /**
   * Sample terrain height from 3D tiles at a given lon/lat.
   * Falls back to a safe default if tiles aren't loaded at that point yet.
   */
  function getTerrainHeight(lon: number, lat: number): number {
    const v = viewer();
    if (!v || v.isDestroyed()) return CONFIG.billboardAltitude;

    const carto = Cesium.Cartographic.fromDegrees(lon, lat);
    const height = v.scene.sampleHeight(carto);

    // sampleHeight returns undefined if no tiles are loaded at that position
    if (height === undefined || height === null || isNaN(height)) {
      return CONFIG.billboardAltitude;
    }

    // Place billboard slightly above the tile surface
    return height + 5;
  }

  /**
   * Update billboard markers based on camera data
   */
  function updateMarkers(): void {
    const cameraData = cameras();
    const iconCanvas = createCameraIconTexture();

    // Get current billboard IDs directly from the tracked map (not raw Cesium index)
    const currentIds = markerCollection.ids();
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
        const alt = getTerrainHeight(camera.longitude, camera.latitude);
        markerCollection.add({
          id: markerId,
          position: Cesium.Cartesian3.fromDegrees(
            camera.longitude,
            camera.latitude,
            alt
          ),
          // CRITICAL: Pass canvas directly - NO toDataURL()
          image: iconCanvas,
          scale: CONFIG.markerSize / 40, // Scale to desired size
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          data: { cameraId: camera.id, name: camera.name },
        });
      }
    }
  }

  // Update markers when camera data changes
  createEffect(
    on(cameras, () => {
      updateMarkers();
    })
  );

  // Set up click handler for camera selection
  createEffect(() => {
    if (!ready()) return;
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);

      if (Cesium.defined(pickedObject)) {
        // BillboardCollection pick: pickedObject.id is the string id set on the billboard
        const id = pickedObject.id;
        if (typeof id === "string" && id.startsWith("cctv-marker:")) {
          const cameraId = id.replace("cctv-marker:", "");
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
    markerCollection.clear();
    console.log("[CCTVLayer] Unmounted");
  });

  return null;
}

export default CCTVLayer;
