/**
 * Ground Layer - Orchestrates traffic, CCTV, and seismic sub-layers
 */

import { Show } from "solid-js";
import { groundState } from "./store.ts";
import { recording } from "../../stores/recording";
import { TrafficLayer } from "./TrafficLayer.tsx";
import { CCTVLayer } from "./CCTVLayer.tsx";
import { SeismicLayer } from "./SeismicLayer.tsx";

export function GroundLayer() {
  return (
    <>
      <Show when={groundState.trafficEnabled}><TrafficLayer /></Show>
      <CCTVLayer />
      {/* Keep SeismicLayer mounted during playback so its handle stays registered. */}
      <Show when={groundState.seismicEnabled || recording.mode === "playback"}>
        <SeismicLayer hidden={!groundState.seismicEnabled} />
      </Show>
    </>
  );
}
