import * as satellite from "satellite.js";
import * as Cesium from "cesium";

export interface SatelliteRecord {
  name: string;
  noradId: string;
  category: "active" | "stations" | "military";
  satrec: satellite.SatRec;
  color: Cesium.Color;
}

export async function fetchTLEs(category: "active" | "stations" | "military"): Promise<SatelliteRecord[]> {
  return [];
}

export async function loadAllTLEs(): Promise<SatelliteRecord[]> {
  return [];
}

export function propagateAll(
  records: SatelliteRecord[],
  date: Date
): { record: SatelliteRecord; cartesian: Cesium.Cartesian3 }[] {
  return [];
}

export function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  return [];
}
