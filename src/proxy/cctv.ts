/**
 * CCTV Camera Proxy — Backward Compatibility Shim
 * Re-exports from the new modular cctv/ directory.
 */

export { CCTVProxyManager, cctvProxyManager } from "./cctv/index.ts";
export type { CCTVCamera, CameraMedia, CameraMediaType, CameraSource } from "./cctv/index.ts";
