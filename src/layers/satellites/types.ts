/**
 * Satellite Layer Types
 */

import type * as satellite from "satellite.js";

declare const Cesium: typeof import("cesium");

export type SatelliteCategory = "stations" | "military" | "starlink" | "gnss" | "research";

export interface SatelliteRecord {
  name: string;
  noradId: string;
  line1: string;
  line2: string;
  category: SatelliteCategory;
  satrec: satellite.SatRec;
  color: Cesium.Color;
}

export interface SatellitePosition {
  record: SatelliteRecord;
  cartesian: Cesium.Cartesian3;
  velocityKmS?: number;
}

/** Maps UI categories to CelesTrak group names */
export const CATEGORY_TO_GROUPS: Record<SatelliteCategory, string[]> = {
  stations: ["stations"],
  military: ["military"],
  starlink: ["starlink"],
  gnss: ["gnss"],
  research: ["science"],
};

export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  stations: "#00cfff",
  military: "#ff4444",
  starlink: "#ffffff",
  gnss: "#ffaa00",
  research: "#aa44ff",
};

// Visual constants
export const BILLBOARD_SIZE_NORMAL = 16;
export const BILLBOARD_SIZE_SELECTED = 28;
export const POSITION_UPDATE_INTERVAL_MS = 2500;
export const FOLLOW_RANGE_METERS = 2_500_000;
