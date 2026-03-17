/**
 * WorldView - Plane Layer Registration
 *
 * Registers the plane layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { PlaneLayer } from "./PlaneLayer";

export * from "./store";
export * from "./types";
export { PlaneLayer };

registerLayer({
  id: "planes",
  name: "Planes",
  icon: "plane",
  component: PlaneLayer,
  defaultEnabled: false,
});
