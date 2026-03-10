/**
 * WorldView - Ship Layer Registration
 *
 * Registers the ship layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { ShipLayer } from "./ShipLayer";

registerLayer({
  id: "ships",
  name: "Ships",
  icon: "ship",
  component: ShipLayer,
  defaultEnabled: true,
});
