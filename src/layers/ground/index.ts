/**
 * WorldView - Ground Layer Registration
 *
 * Registers the ground layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { GroundLayer } from "./GroundLayer";

// Register the ground layer
registerLayer({
  id: "ground",
  name: "Ground",
  icon: "globe",
  component: GroundLayer,
  defaultEnabled: true,
});

// Export store and types for external use
export { groundState, toggleSubLayer, setSubLayerEnabled, setTrafficStyle, setCameras, setEarthquakes, setCenterStageCamera } from "./store.ts";
export type { GroundState } from "./store.ts";
export type { Camera, EarthquakeData, StyleMode, GroundSubLayer, TrafficParticle } from "./types.ts";
