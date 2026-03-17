/**
 * WorldView - Shared Navigation Utilities
 * POI types, city data, and camera navigation helpers.
 */

import poisData from "../data/pois.json";

declare const Cesium: typeof import("cesium");

// ============================================
// POI / City Types & Data
// ============================================

export interface POI {
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  pitch: number;
}

export interface City {
  name: string;
  pois: POI[];
}

/** All cities loaded from the POI data file */
export const cities = poisData as City[];

/** City abbreviations for tab display (matches cities array order) */
export const CITY_ABBREVS = ["ATX", "SFO", "NYC", "TYO", "LDN", "PAR", "DXB", "DCA"];

// ============================================
// Camera Navigation
// ============================================

/**
 * Fly the Cesium camera to a POI with oblique pitch compensation.
 * Offsets latitude south so the target appears centered at the given pitch angle.
 */
export function flyToPOI(
  viewer: ReturnType<typeof import("cesium").Viewer.prototype.constructor> | null | undefined,
  poi: POI,
): void {
  if (!viewer || viewer.isDestroyed()) return;

  const pitch = poi.pitch ?? -45;
  const pitchRad = Math.abs(pitch) * (Math.PI / 180);
  const latOffset = (poi.altitude / 111000) * Math.tan(pitchRad);

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      poi.lng,
      poi.lat - latOffset,
      poi.altitude,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(pitch),
      roll: 0,
    },
    duration: 2,
  });
}
