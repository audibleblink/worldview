/**
 * WorldView - Ground Layer (Stub)
 *
 * Phase 3 stub component that logs mount/unmount for testing.
 * Full implementation will be added in Phase 7.
 */

import { onMount, onCleanup } from "solid-js";

/**
 * GroundLayer - Renders ground features on the globe
 *
 * Currently a stub that logs lifecycle events.
 * Phase 7 will add sub-layers:
 * - Traffic particle system
 * - CCTV cameras
 * - Seismic/earthquake data
 */
export function GroundLayer() {
  onMount(() => {
    console.log("[GroundLayer] mounted");
  });

  onCleanup(() => {
    console.log("[GroundLayer] unmounted");
  });

  // Layers don't render DOM - they add primitives to Cesium
  return null;
}

export default GroundLayer;
