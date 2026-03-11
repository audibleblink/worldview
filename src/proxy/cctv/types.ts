/**
 * CCTV Source Registry — Shared Types
 */

/** Media format a camera can provide */
export type CameraMediaType = "image" | "hls" | "mp4ts";

/** A single media endpoint for a camera */
export interface CameraMedia {
  type: CameraMediaType;
  url: string;
}

/** Normalized camera record returned by all sources */
export interface CCTVCamera {
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

/** Interface that every camera source must implement */
export interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
}
