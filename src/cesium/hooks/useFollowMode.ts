/**
 * WorldView - useFollowMode Hook
 *
 * Single shared implementation of camera follow mode.
 * Replaces the 3 copy-pasted implementations from satellites, flights, and ships.
 *
 * Features:
 * - Tracks a position with heading/pitch/range
 * - Detects user orbit input and preserves it
 * - Proper cleanup on stop or unmount
 * - Single preRender listener
 */

import { createSignal, onCleanup, type Accessor } from "solid-js";
import { useCesium } from "../useCesium";
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
}

export interface UseFollowModeReturn {
  /** Whether follow mode is active */
  isFollowing: Accessor<boolean>;
  /** Start following a position */
  track: (getPosition: () => Cesium.Cartesian3 | null, options?: FollowOptions) => void;
  /** Stop following and return to free camera */
  stop: () => void;
}

const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = -Math.PI / 4; // -45 degrees
const DEFAULT_RANGE = 500;

/**
 * Shared follow mode hook for tracking entities.
 *
 * Usage:
 * ```tsx
 * const { isFollowing, track, stop } = useFollowMode();
 *
 * // Start following a satellite
 * track(() => getSatellitePosition(noradId), {
 *   heading: 0,
 *   pitch: Cesium.Math.toRadians(-45),
 *   range: 1000,
 * });
 *
 * // Stop following
 * stop();
 * ```
 */
export function useFollowMode(): UseFollowModeReturn {
  const { viewer } = useCesium();

  const [isFollowing, setIsFollowing] = createSignal(false);

  // Internal state for follow tracking
  let positionGetter: (() => Cesium.Cartesian3 | null) | null = null;
  let currentHeading = DEFAULT_HEADING;
  let currentPitch = DEFAULT_PITCH;
  let currentRange = DEFAULT_RANGE;
  let useGroundLevel = false;
  let lastCamPos: Cesium.Cartesian3 | null = null;

  // Single preRender listener handles all follow logic
  usePreRender(() => {
    if (!isFollowing()) return;
    if (!positionGetter) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const position = positionGetter();
    if (!position) return;

    // Determine target position
    let target: Cesium.Cartesian3;

    if (useGroundLevel) {
      // Use ground/sea level below the actual position
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      target = Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        0 // Ground/sea level
      );
    } else {
      target = position;
    }

    const camera = v.camera;

    // Check if user moved the camera since last frame (orbiting)
    if (lastCamPos !== null) {
      const actualPos = camera.positionWC;
      const userMoved = !Cesium.Cartesian3.equalsEpsilon(
        actualPos,
        lastCamPos,
        0,
        1.0 // 1 meter tolerance
      );

      if (userMoved) {
        // User orbited - preserve their heading/pitch/range
        currentHeading = camera.heading;
        currentPitch = camera.pitch;
        currentRange = Cesium.Cartesian3.distance(actualPos, target);
      }
    }

    // Apply lookAt - this creates the reference frame that enables orbit controls
    camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(currentHeading, currentPitch, currentRange)
    );

    // Store where camera is now for next frame comparison
    lastCamPos = Cesium.Cartesian3.clone(camera.positionWC);
  });

  /**
   * Start following a position.
   *
   * @param getPosition - Accessor function that returns current position
   * @param options - Follow options (heading, pitch, range)
   */
  const track = (
    getPosition: () => Cesium.Cartesian3 | null,
    options: FollowOptions = {}
  ) => {
    // Reset state
    positionGetter = getPosition;
    currentHeading = options.heading ?? DEFAULT_HEADING;
    currentPitch = options.pitch ?? DEFAULT_PITCH;
    currentRange = options.range ?? DEFAULT_RANGE;
    useGroundLevel = options.useGroundLevel ?? false;
    lastCamPos = null;

    setIsFollowing(true);
    console.log("[useFollowMode] Follow mode started");
  };

  /**
   * Stop following and return to free camera.
   */
  const stop = () => {
    if (!isFollowing()) return;

    const v = viewer();
    if (v && !v.isDestroyed()) {
      // Release camera from lookAt transform lock
      v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    // Reset state
    positionGetter = null;
    lastCamPos = null;
    setIsFollowing(false);

    console.log("[useFollowMode] Follow mode stopped");
  };

  // Cleanup on unmount
  onCleanup(() => {
    if (isFollowing()) {
      stop();
    }
  });

  return {
    isFollowing,
    track,
    stop,
  };
}

export default useFollowMode;
