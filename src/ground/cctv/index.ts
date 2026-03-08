/**
 * CCTV Module - Live traffic camera feeds projected into 3D scene
 * Exports all CCTV-related components
 */

export type { Camera, BBox, CCTVBillboard, CCTVManagerConfig } from "./types.ts";
export { DEFAULT_CCTV_CONFIG } from "./types.ts";

export { CCTVManager } from "./CCTVManager.ts";
export { CCTVPanel, initCCTVPanel, updateCamerasForViewport, getCameraCount, destroyCCTVPanel } from "./CCTVPanel.ts";

export {
  createBillboardCanvas,
  drawBorder,
  drawLoadingState,
  drawOfflineState,
  drawVideoFrame,
  fetchThumbnailFrame,
  createCameraBillboard,
  startBillboardUpdateLoop,
  stopBillboardUpdateLoop,
} from "./CCTVBillboard.ts";
