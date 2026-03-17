/**
 * Ground Layer Types
 */

export type { EarthquakeData } from "../../ground/seismic/USGSFetcher.ts";
export type { RoadSegment } from "../../ground/traffic/RoadNetwork.ts";
export type { RawOSMWay, BoundingBox } from "../../ground/traffic/OSMFetcher.ts";
export type { StyleMode } from "../../ground/traffic/particleStyles.ts";

export interface BBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export type CameraMediaType = "image" | "hls" | "mp4ts";

export interface CameraMedia {
  type: CameraMediaType;
  url: string;
}

export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: "live" | "offline";
  media: CameraMedia[];
  roadway?: string;
  direction?: string;
}

export interface TrafficParticle {
  id: string;
  segmentIndex: number;
  progress: number;
  speed: number;
  direction: 1 | -1;
  visible: boolean;
}

export type GroundSubLayer = "traffic" | "cctv" | "seismic";
