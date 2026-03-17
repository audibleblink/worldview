/**
 * Ground Layer - Orchestrates traffic, CCTV, and seismic sub-layers
 */

import { Show } from "solid-js";
import { groundState } from "./store.ts";
import { TrafficLayer } from "./TrafficLayer.tsx";
import { CCTVLayer } from "./CCTVLayer.tsx";
import { SeismicLayer } from "./SeismicLayer.tsx";

export function GroundLayer() {
  return (
    <>
      <Show when={groundState.trafficEnabled}><TrafficLayer /></Show>
      <CCTVLayer />
      <Show when={groundState.seismicEnabled}><SeismicLayer /></Show>
    </>
  );
}
