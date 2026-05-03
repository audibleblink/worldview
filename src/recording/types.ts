/**
 * WorldView - Recording & Playback Types
 * Shared types for the timeline recording/playback system.
 */

import type { SatelliteCategory } from "../layers/satellites/types";

export type AppMode = "live" | "recording" | "playback";

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TLERecord {
  name: string;
  noradId: string;
  line1: string;
  line2: string;
  category: SatelliteCategory;
}

export interface RecordingMeta {
  id: string;
  name: string;
  startTime: number;
  endTime: number | null;
  bbox: BBox;
  tles: TLERecord[];
  frameCount: number;
  complete: boolean;
}

/** Subset of PlaneRecord needed for rendering during playback. */
export interface PlaneSnapshot {
  icao24: string;
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  velocity: number;
  callsign: string;
}

/**
 * Subset of ShipRecord needed for rendering during playback.
 * Note: ShipRecord uses `name` for the ship name; snapshots use `shipName` on
 * the wire format. Map `name` → `shipName` when building snapshots.
 */
export interface ShipSnapshot {
  mmsi: string;
  latitude: number;
  longitude: number;
  trueHeading: number;
  sog: number;
  shipType: number;
  shipName: string;
}

export interface SeismicSnapshot {
  id: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: number;
}

/** One recorded snapshot — one NDJSON line in frames.ndjson. */
export interface Frame {
  t: number;
  planes: PlaneSnapshot[];
  ships: ShipSnapshot[];
  seismic: SeismicSnapshot[];
}

/**
 * Per-layer handle used by PlaybackEngine to drive billboard updates.
 * Satellites use `updateAtTime`; all other layers use `update`.
 */
export interface PlaybackHandle {
  update?: (prev: Frame, next: Frame, alpha: number) => void;
  updateAtTime?: (t: number) => void;
  clear(): void;
}
