/**
 * Recording - Pure snapshot functions
 * Transform live store records into serializable snapshot types.
 */

import type { PlaneRecord } from "../layers/planes/types";
import type { ShipRecord } from "../layers/ships/store";
import type { EarthquakeData } from "../ground/seismic/USGSFetcher";
import type { PlaneSnapshot, ShipSnapshot, SeismicSnapshot } from "./types";

export function snapshotPlanes(records: PlaneRecord[]): PlaneSnapshot[] {
  return records.map((r) => ({
    icao24: r.icao24,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    heading: r.heading,
    velocity: r.velocity,
    callsign: r.callsign,
  }));
}

export function snapshotShips(records: ShipRecord[]): ShipSnapshot[] {
  return records.map((r) => ({
    mmsi: r.mmsi,
    latitude: r.latitude,
    longitude: r.longitude,
    trueHeading: r.trueHeading,
    sog: r.sog,
    shipType: r.shipType,
    shipName: r.name, // ShipRecord.name → ShipSnapshot.shipName
  }));
}

export function snapshotSeismic(quakes: EarthquakeData[]): SeismicSnapshot[] {
  return quakes.map((q) => ({
    id: q.id,
    latitude: q.latitude,
    longitude: q.longitude,
    magnitude: q.magnitude,
    depth: q.depth,
    time: q.time.getTime(), // Date → number (ms since epoch)
  }));
}
