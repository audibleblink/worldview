/**
 * WorldView - Flight Layer (Stub)
 *
 * Phase 3 stub component that logs mount/unmount for testing.
 * Full implementation will be added in Phase 5.
 */

import { onMount, onCleanup } from "solid-js";

/**
 * FlightLayer - Renders live flights on the globe
 *
 * Currently a stub that logs lifecycle events.
 * Phase 5 will add:
 * - OpenSky data fetching
 * - 3D aircraft models via Entity API
 * - Dead-reckoning interpolation
 * - Selection handling
 * - Follow mode
 */
export function FlightLayer() {
  onMount(() => {
    console.log("[FlightLayer] mounted");
  });

  onCleanup(() => {
    console.log("[FlightLayer] unmounted");
  });

  // Layers don't render DOM - they add entities to Cesium
  return null;
}

export default FlightLayer;
