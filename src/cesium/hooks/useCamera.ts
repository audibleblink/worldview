/**
 * WorldView - useCamera Hook
 *
 * Reactive camera state and control methods.
 * Provides position, heading, pitch, roll as signals.
 * Ports flyTo, lookAt, unlock from src/camera.ts.
 */

import { createSignal, onCleanup, createEffect, on, type Accessor } from "solid-js";
import { useCesium } from "../useCesium";

declare const Cesium: typeof import("cesium");

export interface CameraState {
  /** Camera position in Cartesian3 */
  position: Cesium.Cartesian3 | null;
  /** Camera heading in radians */
  heading: number;
  /** Camera pitch in radians */
  pitch: number;
  /** Camera roll in radians */
  roll: number;
  /** Camera altitude in meters */
  altitude: number;
  /** Camera center lat/lon */
  center: { lat: number; lon: number } | null;
}

export interface CameraViewOptions {
  /** Heading in radians (default: 0 = looking from south toward north) */
  heading?: number;
  /** Pitch in radians (default: -π/4 = -45° looking down) */
  pitch?: number;
  /** Distance from target in metres (default: 500) */
  range?: number;
  /** Animation duration in seconds (flyTo only, default: 2) */
  duration?: number;
}

export interface UseCameraReturn {
  /** Reactive camera state */
  state: Accessor<CameraState>;
  /** Animated fly to view a target position */
  flyTo: (target: Cesium.Cartesian3, options?: CameraViewOptions) => void;
  /** Instantly position camera to look at a target */
  lookAt: (target: Cesium.Cartesian3, options?: CameraViewOptions) => void;
  /** Release camera from lookAt transform lock */
  unlock: () => void;
  /** Get current viewport bounding box */
  getViewportBBox: () => BBox | null;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = -Math.PI / 4; // -45 degrees
const DEFAULT_RANGE = 500;
const DEFAULT_DURATION = 2;

/**
 * Reactive camera hook providing state and control methods.
 *
 * Usage:
 * ```tsx
 * const { state, flyTo, lookAt, unlock } = useCamera();
 *
 * createEffect(() => {
 *   console.log('Camera altitude:', state().altitude);
 * });
 *
 * // Fly to a location
 * flyTo(Cesium.Cartesian3.fromDegrees(-122.4, 37.8, 0), { range: 1000 });
 * ```
 */
export function useCamera(): UseCameraReturn {
  const { viewer, ready } = useCesium();

  const [state, setState] = createSignal<CameraState>({
    position: null,
    heading: 0,
    pitch: 0,
    roll: 0,
    altitude: 0,
    center: null,
  });

  let removeListener: (() => void) | null = null;

  createEffect(
    on(ready, (isReady) => {
      // Clean up any existing listener
      if (removeListener) {
        removeListener();
        removeListener = null;
      }

      if (!isReady) return;

      const v = viewer();
      if (!v || v.isDestroyed()) return;

      const camera = v.camera;

      // Update state from camera
      const updateState = () => {
        if (v.isDestroyed()) return;

        const cartographic = camera.positionCartographic;
        const position = camera.positionWC
          ? Cesium.Cartesian3.clone(camera.positionWC)
          : null;

        let center: { lat: number; lon: number } | null = null;
        if (cartographic) {
          center = {
            lat: Cesium.Math.toDegrees(cartographic.latitude),
            lon: Cesium.Math.toDegrees(cartographic.longitude),
          };
        }

        setState({
          position,
          heading: camera.heading,
          pitch: camera.pitch,
          roll: camera.roll,
          altitude: cartographic?.height ?? 0,
          center,
        });
      };

      // Initial state update
      updateState();

      // Subscribe to camera changes
      camera.changed.addEventListener(updateState);

      removeListener = () => {
        if (!v.isDestroyed()) {
          camera.changed.removeEventListener(updateState);
        }
      };
    })
  );

  onCleanup(() => {
    if (removeListener) {
      removeListener();
      removeListener = null;
    }
  });

  /**
   * Animated fly to view a target position.
   * Camera will be positioned at the specified range, looking AT the target.
   */
  const flyTo = (target: Cesium.Cartesian3, options: CameraViewOptions = {}) => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const {
      heading = DEFAULT_HEADING,
      pitch = DEFAULT_PITCH,
      range = DEFAULT_RANGE,
      duration = DEFAULT_DURATION,
    } = options;

    const boundingSphere = new Cesium.BoundingSphere(target, 0);

    v.camera.flyToBoundingSphere(boundingSphere, {
      offset: new Cesium.HeadingPitchRange(heading, pitch, range),
      duration,
    });
  };

  /**
   * Instantly position camera to look at a target.
   * Use this per-frame for follow/tracking modes.
   * Call unlock() when done to release the transform lock.
   */
  const lookAt = (target: Cesium.Cartesian3, options: CameraViewOptions = {}) => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const {
      heading = DEFAULT_HEADING,
      pitch = DEFAULT_PITCH,
      range = DEFAULT_RANGE,
    } = options;

    v.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
  };

  /**
   * Release camera from lookAt transform lock.
   * Call this when stopping follow/tracking mode to restore free camera control.
   */
  const unlock = () => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  };

  /**
   * Get the current viewport bounding box from camera.
   * Returns null if camera is looking at sky.
   */
  const getViewportBBox = (): BBox | null => {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const camera = v.camera;
    const canvas = v.scene.canvas;

    try {
      // Get corners of viewport in cartographic coordinates
      const corners = [
        camera.pickEllipsoid(new Cesium.Cartesian2(0, 0)),
        camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, 0)),
        camera.pickEllipsoid(new Cesium.Cartesian2(0, canvas.height)),
        camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, canvas.height)),
      ];

      // Filter out undefined values (when camera is looking at sky)
      const validCorners = corners.filter(
        (c): c is Cesium.Cartesian3 => c !== undefined
      );

      if (validCorners.length < 2) {
        return null;
      }

      // Convert to cartographic and find bounds
      let west = 180,
        south = 90,
        east = -180,
        north = -90;

      for (const corner of validCorners) {
        const carto = Cesium.Cartographic.fromCartesian(corner);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);

        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }

      // Apply 10% padding
      const padding = 0.1;
      const lonPadding = (east - west) * padding;
      const latPadding = (north - south) * padding;

      return {
        west: west - lonPadding,
        south: south - latPadding,
        east: east + lonPadding,
        north: north + latPadding,
      };
    } catch (error) {
      console.error("[useCamera] Error calculating viewport bbox:", error);
      return null;
    }
  };

  return {
    state,
    flyTo,
    lookAt,
    unlock,
    getViewportBBox,
  };
}

export default useCamera;
