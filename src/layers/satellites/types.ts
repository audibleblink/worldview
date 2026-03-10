/**
 * WorldView - Satellite Layer Types
 *
 * Type definitions for the satellite layer.
 */

import type * as satellite from "satellite.js";

declare const Cesium: typeof import("cesium");

/**
 * Satellite category types
 */
export type SatelliteCategory = "stations" | "military" | "starlink" | "gnss" | "research";

/**
 * Satellite record from TLE parsing
 */
export interface SatelliteRecord {
  /** Satellite name from TLE */
  name: string;
  /** NORAD catalog number (1-5 digits) */
  noradId: string;
  /** TLE line 1 */
  line1: string;
  /** TLE line 2 */
  line2: string;
  /** Category for filtering and coloring */
  category: SatelliteCategory;
  /** SGP4 propagator state */
  satrec: satellite.SatRec;
  /** Display color based on category */
  color: Cesium.Color;
}

/**
 * Propagated satellite position
 */
export interface SatellitePosition {
  record: SatelliteRecord;
  cartesian: Cesium.Cartesian3;
  velocityKmS?: number;
}

/**
 * Maps UI categories to CelesTrak group names
 */
export const CATEGORY_TO_GROUPS: Record<SatelliteCategory, string[]> = {
  stations: ["stations"],
  military: ["military"],
  starlink: ["starlink"],
  gnss: ["gnss"],
  research: ["science"],
};

/**
 * Category display colors
 */
export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  stations: "#00cfff",
  military: "#ff4444",
  starlink: "#ffffff",
  gnss: "#ffaa00",
  research: "#aa44ff",
};

/**
 * Visual constants
 */
export const BILLBOARD_SIZE_NORMAL = 16;
export const BILLBOARD_SIZE_SELECTED = 28;
export const POSITION_UPDATE_INTERVAL_MS = 2500;
export const FOLLOW_RANGE_METERS = 2_500_000;
