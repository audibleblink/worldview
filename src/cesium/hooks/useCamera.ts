/**
 * WorldView - useCamera Hook
 *
 * Reactive camera state and control methods.
 * Provides position, heading, pitch, roll as signals.
 */

import { createSignal, type Accessor } from "solid-js";
import { useCesium, useViewerEvent, getActiveViewer } from "../useCesium";

declare const Cesium: typeof import("cesium");

export interface CameraState {
  position: Cesium.Cartesian3 | null;
  heading: number;
  pitch: number;
  roll: number;
  altitude: number;
  center: { lat: number; lon: number } | null;
}

export interface CameraViewOptions {
  /** Heading in radians (default: 0 = north) */
  heading?: number;
  /** Pitch in radians (default: -π/4 = -45°) */
  pitch?: number;
  /** Distance from target in metres (default: 500) */
  range?: number;
  /** Animation duration in seconds (flyTo only, default: 2) */
  duration?: number;
}

export interface UseCameraReturn {
  state: Accessor<CameraState>;
  flyTo: (target: Cesium.Cartesian3, options?: CameraViewOptions) => void;
  lookAt: (target: Cesium.Cartesian3, options?: CameraViewOptions) => void;
  unlock: () => void;
  getViewportBBox: () => BBox | null;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = -Math.PI / 4;
const DEFAULT_RANGE = 500;
const DEFAULT_DURATION = 2;

/** Build a HeadingPitchRange from options with defaults. */
function hpr(opts: CameraViewOptions = {}): Cesium.HeadingPitchRange {
  return new Cesium.HeadingPitchRange(
    opts.heading ?? DEFAULT_HEADING,
    opts.pitch ?? DEFAULT_PITCH,
    opts.range ?? DEFAULT_RANGE,
  );
}

/**
 * Reactive camera hook providing state and control methods.
 */
export function useCamera(): UseCameraReturn {
  const ctx = useCesium();

  const [state, setState] = createSignal<CameraState>({
    position: null,
    heading: 0,
    pitch: 0,
    roll: 0,
    altitude: 0,
    center: null,
  });

  useViewerEvent((viewer) => {
    const { camera } = viewer;

    const updateState = () => {
      if (viewer.isDestroyed()) return;

      const carto = camera.positionCartographic;
      setState({
        position: camera.positionWC ? Cesium.Cartesian3.clone(camera.positionWC) : null,
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
        altitude: carto?.height ?? 0,
        center: carto
          ? { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude) }
          : null,
      });
    };

    updateState();
    camera.changed.addEventListener(updateState);

    return () => {
      if (!viewer.isDestroyed()) {
        camera.changed.removeEventListener(updateState);
      }
    };
  });

  const flyTo = (target: Cesium.Cartesian3, options: CameraViewOptions = {}) => {
    const v = getActiveViewer(ctx);
    if (!v) return;

    v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
      offset: hpr(options),
      duration: options.duration ?? DEFAULT_DURATION,
    });
  };

  const lookAt = (target: Cesium.Cartesian3, options: CameraViewOptions = {}) => {
    const v = getActiveViewer(ctx);
    if (!v) return;
    v.camera.lookAt(target, hpr(options));
  };

  const unlock = () => {
    const v = getActiveViewer(ctx);
    if (!v) return;
    v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  };

  const getViewportBBox = (): BBox | null => {
    const v = getActiveViewer(ctx);
    if (!v) return null;

    const { camera, scene } = v;
    const { width, height } = scene.canvas;

    // Pick the four corners of the viewport on the ellipsoid
    const screenCorners = [
      [0, 0], [width, 0], [0, height], [width, height],
    ] as const;

    const cartographics = screenCorners
      .map(([x, y]) => camera.pickEllipsoid(new Cesium.Cartesian2(x, y)))
      .filter((c): c is Cesium.Cartesian3 => c !== undefined)
      .map((c) => Cesium.Cartographic.fromCartesian(c));

    if (cartographics.length < 2) return null;

    // Compute bounding box from cartographic coordinates
    const lons = cartographics.map((c) => Cesium.Math.toDegrees(c.longitude));
    const lats = cartographics.map((c) => Cesium.Math.toDegrees(c.latitude));

    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    // Add 10% padding
    const lonPad = (east - west) * 0.1;
    const latPad = (north - south) * 0.1;

    return {
      west: west - lonPad,
      south: south - latPad,
      east: east + lonPad,
      north: north + latPad,
    };
  };

  return { state, flyTo, lookAt, unlock, getViewportBBox };
}

export default useCamera;
