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
    // Wrap callback: after it runs, request the next frame so continuous animations
    // keep ticking under requestRenderMode: true without burning 60fps when idle.
    const wrapped: PreRenderCallback = (s, t) => {
      callback(s, t);
      scene.requestRender();
    };
    scene.preRender.addEventListener(wrapped);
    return () => {
      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(wrapped);
      }
    };
  });
}

export default usePreRender;
