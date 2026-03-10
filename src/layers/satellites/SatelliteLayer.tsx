/**
 * WorldView - Satellite Layer (Stub)
 *
 * Phase 3 stub component that logs mount/unmount for testing.
 * Full implementation will be added in Phase 4.
 */

import { onMount, onCleanup } from "solid-js";

/**
 * SatelliteLayer - Renders satellites on the globe
 *
 * Currently a stub that logs lifecycle events.
 * Phase 4 will add:
 * - TLE fetching via proxy
 * - SGP4 propagation
 * - BillboardCollection rendering
 * - Selection handling
 * - Follow mode
 */
export function SatelliteLayer() {
  onMount(() => {
    console.log("[SatelliteLayer] mounted");
  });

  onCleanup(() => {
    console.log("[SatelliteLayer] unmounted");
  });

  // Layers don't render DOM - they add primitives to Cesium
  return null;
}

export default SatelliteLayer;
