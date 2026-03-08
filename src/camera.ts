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

/**
 * Camera change listener with optional debouncing.
 * Returns a cleanup function to remove the listener.
 */
export function onCameraChange(
  viewer: Viewer,
  callback: () => void,
  options: { debounceMs?: number } = {}
): () => void {
  const { debounceMs } = options;
  
  let handler: () => void;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  if (debounceMs && debounceMs > 0) {
    handler = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(callback, debounceMs);
    };
  } else {
    handler = callback;
  }
  
  viewer.camera.changed.addEventListener(handler);
  
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    viewer.camera.changed.removeEventListener(handler);
  };
}

/**
 * Get current camera altitude in meters.
 */
export function getCameraAltitude(viewer: Viewer): number {
  const cartographic = viewer.camera.positionCartographic;
  return cartographic?.height ?? Infinity;
}

/**
 * Get current camera center position (lat/lon).
 */
export function getCameraCenter(viewer: Viewer): { lat: number; lon: number } | null {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const cartographic = ellipsoid.cartesianToCartographic(viewer.camera.position);
  
  if (!cartographic) return null;
  
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
  };
}

/** Bounding box in degrees */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ViewportBBoxOptions {
  /** Padding as a fraction of bounds (default: 0.1 = 10%) */
  padding?: number;
  /** Fallback bbox when camera is looking at sky */
  fallback?: BBox;
}

/**
 * Get the current viewport bounding box from camera.
 * Returns null if camera is looking at sky (unless fallback provided).
 */
export function getViewportBBox(
  viewer: Viewer,
  options: ViewportBBoxOptions = {}
): BBox | null {
  const { padding = 0.1, fallback } = options;
  
  const camera = viewer.camera;
  const canvas = viewer.scene.canvas;
  
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
      (c): c is InstanceType<typeof Cesium.Cartesian3> => c !== undefined
    );
    
    if (validCorners.length < 2) {
      return fallback ?? null;
    }

    // Convert to cartographic and find bounds
    let west = 180, south = 90, east = -180, north = -90;
    
    for (const corner of validCorners) {
      const carto = Cesium.Cartographic.fromCartesian(corner);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }

    // Apply padding
    const lonPadding = (east - west) * padding;
    const latPadding = (north - south) * padding;
    
    return {
      west: west - lonPadding,
      south: south - latPadding,
      east: east + lonPadding,
      north: north + latPadding,
    };
  } catch (error) {
    console.error("[Camera] Error calculating viewport bbox:", error);
    return fallback ?? null;
  }
}
