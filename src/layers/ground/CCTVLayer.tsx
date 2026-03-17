/**
 * CCTV Layer - Camera markers via BillboardCollection
 */

import { createEffect, onCleanup, on } from "solid-js";
import { createBillboardCollection } from "../../cesium/createBillboardCollection.ts";
import { useCesium } from "../../cesium/useCesium.ts";
import { groundState, setCenterStageCamera } from "./store.ts";

declare const Cesium: typeof import("cesium");

const MARKER_SIZE = 24;
const BILLBOARD_ALTITUDE = 15;

let cameraIconCanvas: HTMLCanvasElement | null = null;

/** Create camera marker icon texture (cached) */
function createCameraIconTexture(): HTMLCanvasElement {
  if (cameraIconCanvas) return cameraIconCanvas;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 40;
  const ctx = canvas.getContext("2d")!;
  const c = 20; // center

  // Black circle background with green border
  ctx.beginPath();
  ctx.arc(c, c, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Camera body (rounded rect)
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  ctx.roundRect(c - 10, c - 6, 20, 12, 2);
  ctx.fill();

  // Lens
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#00ff88";
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(c - 1, c - 1, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  cameraIconCanvas = canvas;
  return canvas;
}

export function CCTVLayer() {
  const { viewer, ready } = useCesium();
  const cameras = () => groundState.cctvCameras;
  const markerCollection = createBillboardCollection();

  function getTerrainHeight(lon: number, lat: number): number {
    const v = viewer();
    if (!v || v.isDestroyed()) return BILLBOARD_ALTITUDE;
    const height = v.scene.sampleHeight(Cesium.Cartographic.fromDegrees(lon, lat));
    return (height ?? BILLBOARD_ALTITUDE) + 5;
  }

  function updateMarkers(): void {
    const cameraData = cameras();
    const iconCanvas = createCameraIconTexture();
    const currentIds = markerCollection.ids();
    const newIds = new Set(cameraData.map((c) => `cctv-marker:${c.id}`));

    for (const id of currentIds) {
      if (!newIds.has(id)) markerCollection.remove(id);
    }

    for (const camera of cameraData) {
      const markerId = `cctv-marker:${camera.id}`;
      if (!currentIds.has(markerId)) {
        markerCollection.add({
          id: markerId,
          position: Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, getTerrainHeight(camera.longitude, camera.latitude)),
          image: iconCanvas,
          scale: MARKER_SIZE / 40,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          data: { cameraId: camera.id, name: camera.name },
        });
      }
    }
  }

  createEffect(on(cameras, updateMarkers));

  createEffect(() => {
    if (!ready()) return;
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = v.scene.pick(click.position);
      const id = picked?.id;
      if (typeof id === "string" && id.startsWith("cctv-marker:")) {
        setCenterStageCamera(id.replace("cctv-marker:", ""));
      } else if (groundState.centerStageCameraId) {
        setCenterStageCamera(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    onCleanup(() => { if (!handler.isDestroyed()) handler.destroy(); });
  });

  onCleanup(() => markerCollection.clear());

  return null;
}
