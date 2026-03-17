/**
 * WorldView - useFollowMode Hook
 *
 * Single shared implementation of camera follow mode.
 * Tracks a position with heading/pitch/range, detects user orbit input,
 * and provides proper cleanup on stop or unmount.
 */

import { createSignal, onCleanup, type Accessor } from "solid-js";
import { useCesium, getActiveViewer } from "../useCesium";
import { usePreRender } from "./usePreRender";

declare const Cesium: typeof import("cesium");

export interface FollowOptions {
  /** Initial heading in radians (default: 0 = north) */
  heading?: number;
  /** Initial pitch in radians (default: -π/4 = -45°) */
  pitch?: number;
  /** Initial range/distance in meters (default: 500) */
  range?: number;
  /** If true, target is at ground/sea level below the actual position */
  useGroundLevel?: boolean;
  /** If false, skip the initial flyTo animation and activate follow immediately (default: true) */
  flyToFirst?: boolean;
}

export interface UseFollowModeReturn {
  isFollowing: Accessor<boolean>;
  track: (getPosition: () => Cesium.Cartesian3 | null, options?: FollowOptions) => void;
  stop: () => void;
}

const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = -Math.PI / 4;
const DEFAULT_RANGE = 500;

/** Project a position down to ground/sea level (height = 0). */
function toGroundLevel(position: Cesium.Cartesian3): Cesium.Cartesian3 {
  const carto = Cesium.Cartographic.fromCartesian(position);
  return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
}

/**
 * Shared follow mode hook for tracking entities.
 */
export function useFollowMode(): UseFollowModeReturn {
  const ctx = useCesium();
  const [isFollowing, setIsFollowing] = createSignal(false);

  // Mutable follow state (not reactive — updated per-frame)
  let positionGetter: (() => Cesium.Cartesian3 | null) | null = null;
  let currentHeading = DEFAULT_HEADING;
  let currentPitch = DEFAULT_PITCH;
  let currentRange = DEFAULT_RANGE;
  let groundLevel = false;
  let lastCamPos: Cesium.Cartesian3 | null = null;

  usePreRender(() => {
    if (!isFollowing() || !positionGetter) return;

    const v = getActiveViewer(ctx);
    if (!v) return;

    const position = positionGetter();
    if (!position) return;

    const target = groundLevel ? toGroundLevel(position) : position;
    const { camera } = v;

    // Detect user orbit input by comparing camera position to last frame
    if (lastCamPos !== null) {
      const userMoved = !Cesium.Cartesian3.equalsEpsilon(
        camera.positionWC, lastCamPos, 0, 1.0,
      );
      if (userMoved) {
        currentHeading = camera.heading;
        currentPitch = camera.pitch;
        currentRange = Cesium.Cartesian3.distance(camera.positionWC, target);
      }
    }

    camera.lookAt(target, new Cesium.HeadingPitchRange(currentHeading, currentPitch, currentRange));
    lastCamPos = Cesium.Cartesian3.clone(camera.positionWC);
  });

  const track = (
    getPosition: () => Cesium.Cartesian3 | null,
    options: FollowOptions = {},
  ) => {
    positionGetter = getPosition;
    currentHeading = options.heading ?? DEFAULT_HEADING;
    currentPitch = options.pitch ?? DEFAULT_PITCH;
    currentRange = options.range ?? DEFAULT_RANGE;
    groundLevel = options.useGroundLevel ?? false;
    lastCamPos = null;

    const position = getPosition();
    const v = getActiveViewer(ctx);

    if (position && v && options.flyToFirst !== false) {
      const target = groundLevel ? toGroundLevel(position) : position;

      v.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(target, currentRange),
        {
          offset: new Cesium.HeadingPitchRange(currentHeading, currentPitch, currentRange),
          duration: 1.5,
          complete: () => {
            setIsFollowing(true);
            console.log("[useFollowMode] Follow mode started (after flyTo)");
          },
        },
      );
    } else {
      setIsFollowing(true);
      console.log("[useFollowMode] Follow mode started");
    }
  };

  const stop = () => {
    if (!isFollowing()) return;

    const v = getActiveViewer(ctx);
    if (v) v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    positionGetter = null;
    lastCamPos = null;
    setIsFollowing(false);
    console.log("[useFollowMode] Follow mode stopped");
  };

  onCleanup(() => {
    if (isFollowing()) stop();
  });

  return { isFollowing, track, stop };
}

export default useFollowMode;
