/**
 * WorldView - Ground Layer Store
 * Manages ground-level feature state: traffic, CCTV, seismic
 */

import { createStore } from "solid-js/store";
import type { Camera, EarthquakeData, StyleMode, GroundSubLayer } from "./types.ts";

/**
 * Ground layer state
 */
export interface GroundState {
  /** Traffic particle sub-layer enabled */
  trafficEnabled: boolean;
  /** CCTV camera sub-layer enabled */
  cctvEnabled: boolean;
  /** Seismic/earthquake sub-layer enabled */
  seismicEnabled: boolean;
  /** Traffic visualization style mode */
  trafficStyle: StyleMode;
  /** Cached CCTV camera data */
  cctvCameras: Camera[];
  /** Cached earthquake data */
  earthquakes: EarthquakeData[];
  /** Currently center-staged camera ID (for video viewing) */
  centerStageCameraId: string | null;
  /** Whether traffic data is currently loading */
  trafficLoading: boolean;
  /** Last error message for traffic */
  trafficError: string | null;
}

const initialState: GroundState = {
  trafficEnabled: false,
  cctvEnabled: false,
  seismicEnabled: false,
  trafficStyle: "heatmap",
  cctvCameras: [],
  earthquakes: [],
  centerStageCameraId: null,
  trafficLoading: false,
  trafficError: null,
};

// Create the store
const [groundState, setGroundState] = createStore<GroundState>(initialState);

// Named mutation functions

/**
 * Toggle a sub-layer's visibility
 */
export function toggleSubLayer(name: GroundSubLayer): void {
  switch (name) {
    case "traffic":
      setGroundState("trafficEnabled", (prev) => !prev);
      break;
    case "cctv":
      setGroundState("cctvEnabled", (prev) => !prev);
      break;
    case "seismic":
      setGroundState("seismicEnabled", (prev) => !prev);
      break;
  }
}

/**
 * Set a sub-layer's visibility
 */
export function setSubLayerEnabled(name: GroundSubLayer, enabled: boolean): void {
  switch (name) {
    case "traffic":
      setGroundState("trafficEnabled", enabled);
      break;
    case "cctv":
      setGroundState("cctvEnabled", enabled);
      break;
    case "seismic":
      setGroundState("seismicEnabled", enabled);
      break;
  }
}

/**
 * Set traffic visualization style mode
 */
export function setTrafficStyle(mode: StyleMode): void {
  setGroundState("trafficStyle", mode);
}

/**
 * Update cached CCTV camera data
 */
export function setCameras(cameras: Camera[]): void {
  setGroundState("cctvCameras", cameras);
}

/**
 * Update cached earthquake data
 */
export function setEarthquakes(earthquakes: EarthquakeData[]): void {
  setGroundState("earthquakes", earthquakes);
}

/**
 * Set center-stage camera (for fullscreen video view)
 */
export function setCenterStageCamera(cameraId: string | null): void {
  setGroundState("centerStageCameraId", cameraId);
}

/**
 * Set traffic loading state
 */
export function setTrafficLoading(loading: boolean): void {
  setGroundState("trafficLoading", loading);
}

/**
 * Set traffic error
 */
export function setTrafficError(error: string | null): void {
  setGroundState("trafficError", error);
}

// Export readonly state
export { groundState };
