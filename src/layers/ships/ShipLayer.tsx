/**
 * WorldView - Ship Layer (Stub)
 *
 * Phase 3 stub component that logs mount/unmount for testing.
 * Full implementation will be added in Phase 6.
 */

import { onMount, onCleanup } from "solid-js";

/**
 * ShipLayer - Renders ships on the globe
 *
 * Currently a stub that logs lifecycle events.
 * Phase 6 will add:
 * - AISStream WebSocket data
 * - BillboardCollection rendering (not Entity API)
 * - Viewport-based loading
 * - Selection handling
 * - Follow mode
 */
export function ShipLayer() {
  onMount(() => {
    console.log("[ShipLayer] mounted");
  });

  onCleanup(() => {
    console.log("[ShipLayer] unmounted");
  });

  // Layers don't render DOM - they add billboards to Cesium
  return null;
}

export default ShipLayer;
