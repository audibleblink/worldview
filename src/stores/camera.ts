/**
 * WorldView - Camera Store
 * Manages camera mode and follow target state with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

/**
 * Camera modes
 */
export type CameraMode = "free" | "follow" | "orbit";

/**
 * Entity types that can be followed
 */
export type FollowTargetType = "satellite" | "flight" | "ship";

/**
 * Target entity reference
 */
export interface FollowTarget {
  type: FollowTargetType;
  id: string;
}

/**
 * Camera position (Cesium camera state)
 */
export interface CameraPosition {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

/**
 * Camera state structure
 */
export interface CameraState {
  mode: CameraMode;
  target: FollowTarget | null;
  position: CameraPosition | null;
}

// Initial state with free camera
const initialState: CameraState = {
  mode: "free",
  target: null,
  position: null,
};

// Create the store
const [camera, setCamera] = createStore<CameraState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Set the camera to follow a target entity
 */
export function setFollowTarget(type: FollowTargetType, id: string): void {
  setCamera({
    mode: "follow",
    target: { type, id },
  });
}

/**
 * Set the camera to orbit a target entity
 */
export function setOrbitTarget(type: FollowTargetType, id: string): void {
  setCamera({
    mode: "orbit",
    target: { type, id },
  });
}

/**
 * Return to free camera mode (no follow target)
 */
export function setFreeCamera(): void {
  setCamera({
    mode: "free",
    target: null,
  });
}

/**
 * Update the stored camera position
 * Called by the Cesium camera sync effect
 */
export function updateCameraPosition(position: CameraPosition): void {
  setCamera("position", position);
}

/**
 * Set camera mode directly
 */
export function setCameraMode(mode: CameraMode): void {
  setCamera("mode", mode);
  if (mode === "free") {
    setCamera("target", null);
  }
}

// Export readonly state
export { camera };
