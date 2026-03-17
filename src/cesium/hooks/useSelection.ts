/**
 * WorldView - useSelection Hook
 *
 * Subscribes to Cesium viewer.selectedEntityChanged event.
 * Provides reactive access to selected entity.
 * Auto-unsubscribes via onCleanup.
 */

import { createSignal, type Accessor } from "solid-js";
import { useCesium, useViewerEvent, getActiveViewer } from "../useCesium";

declare const Cesium: typeof import("cesium");

export interface UseSelectionReturn {
  /** Currently selected entity (null if none) */
  selectedEntity: Accessor<Cesium.Entity | null>;
  /** Select an entity programmatically */
  select: (entity: Cesium.Entity | null) => void;
  /** Clear the current selection */
  clear: () => void;
}

/**
 * Reactive selection hook for Cesium entities.
 */
export function useSelection(): UseSelectionReturn {
  const ctx = useCesium();
  const [selectedEntity, setSelectedEntity] = createSignal<Cesium.Entity | null>(null);

  useViewerEvent((viewer) => {
    // Sync initial state
    setSelectedEntity(viewer.selectedEntity ?? null);

    const listener = (entity: Cesium.Entity | undefined) => {
      setSelectedEntity(entity ?? null);
    };

    viewer.selectedEntityChanged.addEventListener(listener);
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.selectedEntityChanged.removeEventListener(listener);
      }
    };
  });

  const select = (entity: Cesium.Entity | null) => {
    const v = getActiveViewer(ctx);
    if (!v) return;
    v.selectedEntity = entity ?? undefined;
  };

  return {
    selectedEntity,
    select,
    clear: () => select(null),
  };
}

export default useSelection;
