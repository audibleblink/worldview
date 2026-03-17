/**
 * WorldView - Shared Entity Panel Logic
 * Provides follow/unfollow and close behavior for entity info panels.
 */

import { createMemo } from "solid-js";
import { selection, clearSelection, type EntityType } from "../../stores/selection";
import { setFollowTarget, camera, setFreeCamera } from "../../stores/camera";

/**
 * Hook for entity info panels (satellite, flight, ship).
 * Returns reactive `isFollowing` state and `handleFollow`/`handleClose` actions.
 */
export function useEntityPanel(entityType: EntityType) {
  const isFollowing = createMemo(() =>
    camera.mode === "follow" &&
    camera.target?.type === entityType &&
    camera.target?.id === selection.id,
  );

  function handleFollow(): void {
    if (isFollowing()) {
      setFreeCamera();
    } else if (selection.id) {
      setFollowTarget(entityType, selection.id);
    }
  }

  function handleClose(): void {
    if (isFollowing()) setFreeCamera();
    clearSelection();
  }

  return { isFollowing, handleFollow, handleClose };
}
