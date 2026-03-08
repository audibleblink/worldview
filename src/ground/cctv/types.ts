/**
 * CCTV Types - Camera and billboard definitions
 */

declare const Cesium: typeof import("cesium");

/** Camera metadata from the catalog */
export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  streamUrl: string;
  status: "live" | "offline";
}

/** Bounding box for viewport filtering */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Active billboard projection in the 3D scene */
export interface CCTVBillboard {
  cameraId: string;
  entity: InstanceType<typeof Cesium.Entity>;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  updateInterval: number | null;
  isActive: boolean;
}

/** CCTV Manager configuration */
export interface CCTVManagerConfig {
  maxBillboards: number;
  thumbnailRefreshMs: number;
  billboardRefreshMs: number;
  billboardWidth: number;
  billboardHeight: number;
  billboardAltitude: number;
}

/** Default configuration */
export const DEFAULT_CCTV_CONFIG: CCTVManagerConfig = {
  maxBillboards: 4,
  thumbnailRefreshMs: 1000,   // 1fps for thumbnails
  billboardRefreshMs: 66,     // ~15fps for billboards
  billboardWidth: 200,        // pixels (will scale with distance)
  billboardHeight: 150,       // pixels (4:3 aspect)
  billboardAltitude: 15,      // meters above ground
};
