/**
 * WorldView - Camera Store
 * Manages camera mode and follow target state with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

export type CameraMode = "free" | "follow" | "orbit";
export type FollowTargetType = "satellite" | "flight" | "ship";

export interface FollowTarget {
  type: FollowTargetType;
  id: string;
}

export interface CameraPosition {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface CameraState {
  mode: CameraMode;
  target: FollowTarget | null;
  position: CameraPosition | null;
}

const [camera, setCamera] = createStore<CameraState>({
  mode: "free",
  target: null,
  position: null,
});

// --- Mutations (named for future event-sourcing) ---

/** Set camera to track a target in the given mode */
function setTargetWithMode(mode: "follow" | "orbit", type: FollowTargetType, id: string): void {
  setCamera({ mode, target: { type, id } });
}

export function setFollowTarget(type: FollowTargetType, id: string): void {
  setTargetWithMode("follow", type, id);
}

export function setOrbitTarget(type: FollowTargetType, id: string): void {
  setTargetWithMode("orbit", type, id);
}

/** Return to free camera mode (clears follow target) */
export function setFreeCamera(): void {
  setCamera({ mode: "free", target: null });
}

/** Update stored camera position (called by Cesium camera sync effect) */
export function updateCameraPosition(position: CameraPosition): void {
  setCamera("position", position);
}

/** Set camera mode directly; clears target when switching to free */
export function setCameraMode(mode: CameraMode): void {
  if (mode === "free") {
    setFreeCamera();
  } else {
    setCamera("mode", mode);
  }
}

export { camera };
