/**
 * WorldView - Flight Layer Registration
 *
 * Registers the flight layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { FlightLayer } from "./FlightLayer";
import { flightState } from "./store";

// Re-export store and types for external access
export * from "./store";
export { FlightLayer } from "./FlightLayer";

registerLayer({
  id: "flights",
  name: "Flights",
  icon: "airplane",
  component: FlightLayer,
  store: flightState,
  defaultEnabled: true,
});
