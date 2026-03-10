/**
 * WorldView - useSelection Hook
 *
 * Subscribes to Cesium viewer.selectedEntityChanged event.
 * Provides reactive access to selected entity.
 * Auto-unsubscribes via onCleanup.
 */

import { createSignal, onCleanup, createEffect, on, type Accessor } from "solid-js";
import { useCesium } from "../useCesium";

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
 *
 * Usage:
 * ```tsx
 * const { selectedEntity, select, clear } = useSelection();
 *
 * createEffect(() => {
 *   const entity = selectedEntity();
 *   if (entity) {
 *     console.log('Selected:', entity.id);
 *   }
 * });
 *
 * // Clear selection
 * clear();
 * ```
 */
export function useSelection(): UseSelectionReturn {
  const { viewer, ready } = useCesium();

  const [selectedEntity, setSelectedEntity] = createSignal<Cesium.Entity | null>(null);

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

      // Sync initial state
      setSelectedEntity(v.selectedEntity ?? null);

      // Subscribe to selection changes
      const listener = (entity: Cesium.Entity | undefined) => {
        setSelectedEntity(entity ?? null);
      };

      v.selectedEntityChanged.addEventListener(listener);

      removeListener = () => {
        if (!v.isDestroyed()) {
          v.selectedEntityChanged.removeEventListener(listener);
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
   * Select an entity programmatically
   */
  const select = (entity: Cesium.Entity | null) => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    v.selectedEntity = entity ?? undefined;
  };

  /**
   * Clear the current selection
   */
  const clear = () => {
    select(null);
  };

  return {
    selectedEntity,
    select,
    clear,
  };
}

export default useSelection;
