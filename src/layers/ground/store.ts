/**
 * Ground Layer Store - State for traffic, CCTV, and seismic sub-layers
 */

import { createStore } from "solid-js/store";
import type { Camera, EarthquakeData, StyleMode, GroundSubLayer } from "./types.ts";

export interface GroundState {
  trafficEnabled: boolean;
  cctvEnabled: boolean;
  seismicEnabled: boolean;
  trafficStyle: StyleMode;
  cctvCameras: Camera[];
  earthquakes: EarthquakeData[];
  centerStageCameraId: string | null;
  trafficLoading: boolean;
  trafficError: string | null;
  cctvLoading: boolean;
  cctvTooHigh: boolean;
}

const [groundState, setGroundState] = createStore<GroundState>({
  trafficEnabled: false,
  cctvEnabled: true,
  seismicEnabled: false,
  trafficStyle: "heatmap",
  cctvCameras: [],
  earthquakes: [],
  centerStageCameraId: null,
  trafficLoading: false,
  trafficError: null,
  cctvLoading: true,
  cctvTooHigh: false,
});

const SUB_LAYER_KEY: Record<GroundSubLayer, keyof GroundState> = {
  traffic: "trafficEnabled",
  cctv: "cctvEnabled",
  seismic: "seismicEnabled",
};

export const toggleSubLayer = (name: GroundSubLayer) => setGroundState(SUB_LAYER_KEY[name] as any, (p: boolean) => !p);
export const setSubLayerEnabled = (name: GroundSubLayer, enabled: boolean) => setGroundState(SUB_LAYER_KEY[name] as any, enabled);
export const setTrafficStyle = (mode: StyleMode) => setGroundState("trafficStyle", mode);
export const setCameras = (cameras: Camera[]) => setGroundState("cctvCameras", cameras);
export const setEarthquakes = (earthquakes: EarthquakeData[]) => setGroundState("earthquakes", earthquakes);
export const setCenterStageCamera = (id: string | null) => setGroundState("centerStageCameraId", id);
export const setTrafficLoading = (v: boolean) => setGroundState("trafficLoading", v);
export const setTrafficError = (v: string | null) => setGroundState("trafficError", v);
export const setCctvLoading = (v: boolean) => setGroundState("cctvLoading", v);
export const setCctvTooHigh = (v: boolean) => setGroundState("cctvTooHigh", v);

export { groundState };
