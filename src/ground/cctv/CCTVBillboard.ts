/**
 * CCTVBillboard - 3D billboard projection utilities
 * Helper functions for billboard creation and texture management
 */

declare const Cesium: typeof import("cesium");

import type { Camera, CCTVBillboard } from "./types.ts";
import { DEFAULT_CCTV_CONFIG } from "./types.ts";

const PROXY_BASE = "http://localhost:3001";

/** Create a canvas for billboard texture rendering */
export function createBillboardCanvas(width = 320, height = 240): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create canvas 2D context");
  }

  return { canvas, ctx };
}

/** Draw border on canvas */
export function drawBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color = "#000000"
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}

/** Draw loading/connecting placeholder */
export function drawLoadingState(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cameraName: string
): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // Scanlines effect
  ctx.fillStyle = "rgba(0, 255, 136, 0.03)";
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }

  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 14px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("CONNECTING...", width / 2, height / 2 - 10);

  ctx.font = "10px Courier New";
  ctx.fillStyle = "#4a9e8a";
  ctx.fillText(cameraName.toUpperCase(), width / 2, height / 2 + 10);

  drawBorder(ctx, width, height, "#00ff88");
}

/** Draw offline state */
export function drawOfflineState(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cameraName: string
): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // Static noise effect
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.random() * 30;
    imageData.data[i] = noise;     // R
    imageData.data[i + 1] = noise; // G
    imageData.data[i + 2] = noise; // B
    imageData.data[i + 3] = 255;   // A
  }
  ctx.putImageData(imageData, 0, 0);

  // Semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ff3333";
  ctx.font = "bold 16px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("SIGNAL LOST", width / 2, height / 2 - 10);

  ctx.font = "10px Courier New";
  ctx.fillStyle = "#4a9e8a";
  ctx.fillText(cameraName.toUpperCase(), width / 2, height / 2 + 15);

  drawBorder(ctx, width, height, "#ff3333");
}

/** Draw a video frame with terminal styling */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | ImageBitmap,
  width: number,
  height: number
): void {
  // Draw the video frame
  ctx.drawImage(image, 0, 0, width, height);

  // Add slight scanline effect
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  // Add terminal border
  drawBorder(ctx, width, height, "#00ff88");

  // Add timestamp overlay
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(width - 70, height - 20, 65, 16);
  
  ctx.fillStyle = "#00ff88";
  ctx.font = "10px Courier New";
  ctx.textAlign = "right";
  ctx.fillText(timestamp, width - 8, height - 7);
}

/** Fetch a thumbnail frame from the proxy */
export async function fetchThumbnailFrame(cameraId: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(`${PROXY_BASE}/api/cctv/thumbnail/${cameraId}`);
    
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch (error) {
    console.error(`[CCTVBillboard] Error fetching thumbnail for ${cameraId}:`, error);
    return null;
  }
}

/** Create a Cesium billboard entity for a camera */
export function createCameraBillboard(
  viewer: InstanceType<typeof Cesium.Viewer>,
  camera: Camera,
  canvas: HTMLCanvasElement,
  config = DEFAULT_CCTV_CONFIG
): InstanceType<typeof Cesium.Entity> {
  return viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(
      camera.longitude,
      camera.latitude,
      config.billboardAltitude
    ),
    billboard: {
      image: canvas,
      width: config.billboardWidth,
      height: config.billboardHeight,
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(100, 1.0, 5000, 0.3),
    },
    label: {
      text: camera.name.toUpperCase(),
      font: "12px Courier New",
      fillColor: Cesium.Color.fromCssColorString("#00ff88"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 10),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(100, 1.0, 5000, 0.5),
    },
  });
}

/** Start the frame update loop for a billboard */
export function startBillboardUpdateLoop(
  billboard: CCTVBillboard,
  camera: Camera,
  refreshMs = DEFAULT_CCTV_CONFIG.billboardRefreshMs
): void {
  if (billboard.updateInterval !== null) {
    clearInterval(billboard.updateInterval);
  }

  billboard.updateInterval = window.setInterval(async () => {
    if (!billboard.isActive) {
      if (billboard.updateInterval !== null) {
        clearInterval(billboard.updateInterval);
        billboard.updateInterval = null;
      }
      return;
    }

    const frame = await fetchThumbnailFrame(camera.id);
    
    if (frame) {
      drawVideoFrame(billboard.ctx, frame, billboard.canvas.width, billboard.canvas.height);
    } else {
      drawOfflineState(billboard.ctx, billboard.canvas.width, billboard.canvas.height, camera.name);
    }

    // Force texture update in Cesium
    const billboardGraphics = billboard.entity.billboard;
    if (billboardGraphics) {
      billboardGraphics.image = new Cesium.ConstantProperty(billboard.canvas);
    }
  }, refreshMs);
}

/** Stop the frame update loop */
export function stopBillboardUpdateLoop(billboard: CCTVBillboard): void {
  if (billboard.updateInterval !== null) {
    clearInterval(billboard.updateInterval);
    billboard.updateInterval = null;
  }
  billboard.isActive = false;
}
