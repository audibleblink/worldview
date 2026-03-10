/**
 * WorldView - Satellite Layer Registration
 *
 * Registers the satellite layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { SatelliteLayer } from "./SatelliteLayer";
import * as satelliteStore from "./store";

registerLayer({
  id: "satellites",
  name: "Satellites",
  icon: "satellite",
  component: SatelliteLayer,
  store: satelliteStore,
  defaultEnabled: true,
});

// Re-export store for external access
export { satelliteStore };
export * from "./types";
export * from "./store";
