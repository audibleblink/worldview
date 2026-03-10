/**
 * WorldView - Satellite Layer Registration
 *
 * Registers the satellite layer with the layer registry.
 * Import this module to ensure the layer is registered.
 */

import { registerLayer } from "../registry";
import { SatelliteLayer } from "./SatelliteLayer";

registerLayer({
  id: "satellites",
  name: "Satellites",
  icon: "satellite",
  component: SatelliteLayer,
  defaultEnabled: true,
});
