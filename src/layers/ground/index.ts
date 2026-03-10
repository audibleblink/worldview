/**
 * WorldView - Ground Layer Registration
 *
 * Registers the ground layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { GroundLayer } from "./GroundLayer";

registerLayer({
  id: "ground",
  name: "Ground",
  icon: "globe",
  component: GroundLayer,
  defaultEnabled: true,
});
