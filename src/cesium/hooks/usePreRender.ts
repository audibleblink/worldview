/**
 * WorldView - usePreRender Hook
 *
 * Subscribes to Cesium scene.preRender event for per-frame updates.
 * Auto-unsubscribes via onCleanup.
 */

import { useViewerEvent } from "../useCesium";

declare const Cesium: typeof import("cesium");

export type PreRenderCallback = (scene: Cesium.Scene, time: Cesium.JulianDate) => void;

/**
 * Subscribe to the Cesium scene preRender event.
 * Callback fires every frame before rendering.
 * Automatically cleans up when component unmounts.
 *
 * @param callback - Function called every frame with scene and time
 */
export function usePreRender(callback: PreRenderCallback): void {
  useViewerEvent((viewer) => {
    const { scene } = viewer;
    scene.preRender.addEventListener(callback);
    return () => {
      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(callback);
      }
    };
  });
}

export default usePreRender;
