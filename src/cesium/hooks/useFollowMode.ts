/**
 * WorldView - useFollowMode Hook
 *
 * Single shared implementation of camera follow mode.
 * Tracks a position with heading/pitch/range.
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

export function useFollowMode(): UseFollowModeReturn {
  const { viewer } = useCesium();
  const [isFollowing, setIsFollowing] = createSignal(false);

  let positionGetter: (() => Cesium.Cartesian3 | null) | null = null;
  let useGroundLevel = false;
  let targetRange = DEFAULT_RANGE;

  // Pre-render: just keep the camera pointed at the target
  // Let Cesium's default camera controller handle user orbit/zoom
  usePreRender(() => {
    if (!isFollowing()) return;
    if (!positionGetter) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const position = positionGetter();
    if (!position) return;

    let target: Cesium.Cartesian3;
    if (useGroundLevel) {
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      target = Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        0
      );
    } else {
      target = position;
    }

    // Get current camera state BEFORE lookAt (user's orbit/zoom choices)
    const camera = v.camera;
    const currentRange = Cesium.Cartesian3.distance(camera.positionWC, target);
    
    // Use the current heading/pitch (preserves user orbit)
    // Use current range if user has zoomed, otherwise use target range
    const range = Math.abs(currentRange - targetRange) > 1000 ? currentRange : targetRange;

    camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(camera.heading, camera.pitch, range)
    );
  });

  const track = (
    getPosition: () => Cesium.Cartesian3 | null,
    options: FollowOptions = {}
  ) => {
    // If already following, stop first to release lookAt constraint
    if (isFollowing()) {
      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
      setIsFollowing(false);
    }

    positionGetter = getPosition;
    targetRange = options.range ?? DEFAULT_RANGE;
    useGroundLevel = options.useGroundLevel ?? false;

    const position = getPosition();
    const v = viewer();

    if (position && v && !v.isDestroyed() && options.flyToFirst !== false) {
      let target = position;
      if (useGroundLevel) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        target = Cesium.Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          0
        );
      }

      const heading = options.heading ?? DEFAULT_HEADING;
      const pitch = options.pitch ?? DEFAULT_PITCH;

      v.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(target, 0),
        {
          offset: new Cesium.HeadingPitchRange(heading, pitch, targetRange),
          duration: 1.5,
          complete: () => {
            setIsFollowing(true);
            console.log("[useFollowMode] Follow mode started");
          },
        }
      );
    } else {
      setIsFollowing(true);
      console.log("[useFollowMode] Follow mode started (no flyTo)");
    }
  };

  const stop = () => {
    if (!isFollowing()) return;

    const v = viewer();
    if (v && !v.isDestroyed()) {
      v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    positionGetter = null;
    setIsFollowing(false);
    console.log("[useFollowMode] Follow mode stopped");
  };

  onCleanup(() => {
    if (isFollowing()) stop();
  });

  return { isFollowing, track, stop };
}

export default useFollowMode;
