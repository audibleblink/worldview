/**
 * WorldView - Ground Layer Types
 * Type definitions for ground features: traffic, CCTV, seismic
 */

declare const Cesium: typeof import("cesium");

// Re-export types from the existing ground modules
export type { EarthquakeData } from "../../ground/seismic/USGSFetcher.ts";
export type { RoadSegment } from "../../ground/traffic/RoadNetwork.ts";
export type { RawOSMWay, BoundingBox } from "../../ground/traffic/OSMFetcher.ts";
export type { StyleMode } from "../../ground/traffic/particleStyles.ts";

/** Bounding box for viewport queries */
export interface BBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** CCTV Camera data from API */
export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  url?: string;
  source?: string;
}

/** CCTV Billboard configuration */
export interface CCTVBillboard {
  id: string;
  cameraId: string;
  name: string;
  position: unknown; // Cesium.Cartesian3
}

/** CCTV Manager configuration */
export interface CCTVManagerConfig {
  maxBillboards: number;
  refreshInterval: number;
}

/** Traffic particle state for animation */
export interface TrafficParticle {
  id: string;
  segmentIndex: number;
  progress: number;
  speed: number;
  direction: 1 | -1;
  visible: boolean;
}

/** Ground sub-layer identifiers */
export type GroundSubLayer = "traffic" | "cctv" | "seismic";

/** CCTV camera marker state */
export interface CCTVMarker {
  id: string;
  cameraId: string;
  /** Position as Cesium.Cartesian3 */
  position: unknown;
  name: string;
}
