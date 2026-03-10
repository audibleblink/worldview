/**
 * WorldView - usePreRender Hook
 *
 * Subscribes to Cesium scene.preRender event for per-frame updates.
 * Auto-unsubscribes via onCleanup.
 */

import { onCleanup, createEffect, on } from "solid-js";
import { useCesium } from "../useCesium";

declare const Cesium: typeof import("cesium");

export type PreRenderCallback = (scene: Cesium.Scene, time: Cesium.JulianDate) => void;

/**
 * Subscribe to the Cesium scene preRender event.
 * Callback fires every frame before rendering.
 * Automatically cleans up when component unmounts.
 *
 * @param callback - Function called every frame with scene and time
 *
 * Usage:
 * ```tsx
 * usePreRender((scene, time) => {
 *   // Update positions, animations, etc.
 * });
 * ```
 */
export function usePreRender(callback: PreRenderCallback): void {
  const { viewer, ready } = useCesium();

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

      const scene = v.scene;

      // Subscribe to preRender
      const listener = (scene: Cesium.Scene, time: Cesium.JulianDate) => {
        callback(scene, time);
      };

      scene.preRender.addEventListener(listener);

      removeListener = () => {
        if (!v.isDestroyed()) {
          scene.preRender.removeEventListener(listener);
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
}

export default usePreRender;
