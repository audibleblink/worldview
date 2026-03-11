/**
 * CCTV Types - Camera and billboard definitions
 */

import type { CameraMedia } from "../../proxy/cctv/types.ts";

declare const Cesium: typeof import("cesium");

/** Camera metadata from the catalog */
export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: "live" | "offline";
  media: CameraMedia[];
  /** Roadway name from NY511 (e.g., "I-278/Bruckner Expressway") */
  roadway?: string;
  /** Direction of travel from NY511 (e.g., "Northbound"), omitted if "Unknown" */
  direction?: string;
}

export type { CameraMedia, CameraMediaType } from "../../proxy/cctv/types.ts";

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
  /** Whether this billboard is in center-stage (focused) mode */
  isCenterStage: boolean;
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
  thumbnailRefreshMs: 30_000, // Service only updates every 30 seconds
  billboardRefreshMs: 30_000, // Match service update rate
  billboardWidth: 200,        // pixels (will scale with distance)
  billboardHeight: 150,       // pixels (4:3 aspect)
  billboardAltitude: 15,      // meters above ground
};
