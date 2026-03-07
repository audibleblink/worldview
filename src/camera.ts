/**
 * WorldView - Camera Utilities
 * Centralized camera positioning for fly-to and follow operations.
 * All functions position the camera to look AT a target, not FROM a target.
 */

declare const Cesium: typeof import("cesium");
type Viewer = import("cesium").Viewer;
type Cartesian3 = import("cesium").Cartesian3;

export interface CameraViewOptions {
  /** Heading in radians (default: 0 = looking from south toward north) */
  heading?: number;
  /** Pitch in radians (default: -π/4 = -45° looking down) */
  pitch?: number;
  /** Distance from target in metres (default: 500) */
  range?: number;
  /** Animation duration in seconds (flyToTarget only, default: 2) */
  duration?: number;
}

const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = -Math.PI / 4; // -45 degrees
const DEFAULT_RANGE = 500;
const DEFAULT_DURATION = 2;

/**
 * Animated fly to view a target position.
 * Camera will be positioned at the specified range, looking AT the target.
 */
export function flyToTarget(
  viewer: Viewer,
  target: Cartesian3,
  options: CameraViewOptions = {}
): void {
  const {
    heading = DEFAULT_HEADING,
    pitch = DEFAULT_PITCH,
    range = DEFAULT_RANGE,
    duration = DEFAULT_DURATION,
  } = options;

  const boundingSphere = new Cesium.BoundingSphere(target, 0);

  viewer.camera.flyToBoundingSphere(boundingSphere, {
    offset: new Cesium.HeadingPitchRange(heading, pitch, range),
    duration,
  });
}

/**
 * Instantly position camera to look at a target.
 * Use this per-frame for follow/tracking modes.
 * Call unlockCamera() when done to release the transform lock.
 */
export function lookAtTarget(
  viewer: Viewer,
  target: Cartesian3,
  options: CameraViewOptions = {}
): void {
  const {
    heading = DEFAULT_HEADING,
    pitch = DEFAULT_PITCH,
    range = DEFAULT_RANGE,
  } = options;

  viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(heading, pitch, range)
  );
}

/**
 * Release camera from lookAt transform lock.
 * Call this when stopping follow/tracking mode to restore free camera control.
 */
export function unlockCamera(viewer: Viewer): void {
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}
