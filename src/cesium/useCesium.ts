/**
 * WorldView - useCesium Hook
 *
 * Hook to access the Cesium Viewer instance from context.
 * Must be used within a CesiumProvider.
 */

import { useContext } from "solid-js";
import { CesiumContext, type CesiumContextValue } from "./CesiumProvider";

declare const Cesium: typeof import("cesium");

/**
 * Access the Cesium viewer context.
 * Returns the context value with viewer and ready accessors.
 *
 * @throws Error if used outside of CesiumProvider
 *
 * Usage:
 * ```tsx
 * const { viewer, ready } = useCesium();
 *
 * createEffect(() => {
 *   if (ready()) {
 *     const v = viewer();
 *     // Use viewer...
 *   }
 * });
 * ```
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
 *
 * Usage:
 * ```tsx
 * onMount(() => {
 *   const viewer = useViewer();
 *   // Viewer is guaranteed to exist here
 * });
 * ```
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

export default useCesium;
