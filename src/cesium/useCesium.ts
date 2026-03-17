/**
 * WorldView - useCesium Hook
 *
 * Hook to access the Cesium Viewer instance from context.
 * Must be used within a CesiumProvider.
 */

import { useContext, createEffect, on, onCleanup } from "solid-js";
import { CesiumContext, type CesiumContextValue } from "./CesiumProvider";

declare const Cesium: typeof import("cesium");

/**
 * Access the Cesium viewer context.
 * Returns the context value with viewer and ready accessors.
 *
 * @throws Error if used outside of CesiumProvider
 */
export function useCesium(): CesiumContextValue {
  const context = useContext(CesiumContext);
  if (!context) {
    throw new Error("useCesium must be used within a CesiumProvider");
  }
  return context;
}

/**
 * Get the Cesium viewer instance, throwing if not available.
 * Use this when you need to guarantee the viewer exists.
 *
 * @throws Error if viewer is not ready
 */
export function useViewer(): Cesium.Viewer {
  const { viewer, ready } = useCesium();

  if (!ready()) {
    throw new Error("useViewer: Cesium viewer is not ready yet");
  }

  const v = viewer();
  if (!v) {
    throw new Error("useViewer: Cesium viewer is null");
  }

  return v;
}

/**
 * Return the live viewer if it's ready and not destroyed, or null.
 * Eliminates the repeated `const v = viewer(); if (!v || v.isDestroyed()) return;` guard.
 */
export function getActiveViewer(ctx: CesiumContextValue): Cesium.Viewer | null {
  const v = ctx.viewer();
  return v && !v.isDestroyed() ? v : null;
}

/**
 * Subscribe to a Cesium event that depends on the viewer being ready.
 * Handles the full lifecycle: wait for ready → subscribe → cleanup on
 * ready-change or component unmount.
 *
 * Eliminates the repeated pattern of:
 *   let removeListener; createEffect(on(ready, ...)); onCleanup(...)
 */
export function useViewerEvent(
  subscribe: (viewer: Cesium.Viewer) => (() => void) | void,
): void {
  const { viewer, ready } = useCesium();
  let cleanup: (() => void) | null = null;

  createEffect(
    on(ready, (isReady) => {
      cleanup?.();
      cleanup = null;

      if (!isReady) return;
      const v = viewer();
      if (!v || v.isDestroyed()) return;

      cleanup = subscribe(v) ?? null;
    }),
  );

  onCleanup(() => {
    cleanup?.();
    cleanup = null;
  });
}

export default useCesium;
