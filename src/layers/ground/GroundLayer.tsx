/**
 * WorldView - Ground Layer Orchestrator
 *
 * Renders ground-level features based on store toggles:
 * - Traffic particles (animated flow along roads)
 * - CCTV camera markers
 * - Seismic/earthquake visualization
 */

import { Show, onMount, onCleanup } from "solid-js";
import { groundState } from "./store.ts";
import { TrafficLayer } from "./TrafficLayer.tsx";
import { CCTVLayer } from "./CCTVLayer.tsx";
import { SeismicLayer } from "./SeismicLayer.tsx";

/**
 * GroundLayer - Orchestrates ground-level sub-layers
 *
 * Uses `<Show>` for conditional sub-layer rendering based on store state.
 * Each sub-layer manages its own lifecycle and cleanup.
 */
export function GroundLayer() {
  onMount(() => {
    console.log("[GroundLayer] Mounted");
  });

  onCleanup(() => {
    console.log("[GroundLayer] Unmounted");
  });

  return (
    <>
      {/* Traffic particle system - animated flow along roads */}
      <Show when={groundState.trafficEnabled}>
        <TrafficLayer />
      </Show>

      {/* CCTV camera markers - always rendered when ground layer is active */}
      <CCTVLayer />

      {/* Seismic/earthquake visualization - animated rings */}
      <Show when={groundState.seismicEnabled}>
        <SeismicLayer />
      </Show>
    </>
  );
}

export default GroundLayer;
