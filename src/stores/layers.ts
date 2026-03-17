/**
 * WorldView - Layers Store
 * Manages layer visibility state with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

export interface LayerState {
  satellites: boolean;
  flights: boolean;
  ships: boolean;
  ground: boolean;
}

export type LayerId = keyof LayerState;

const [layers, setLayers] = createStore<LayerState>({
  satellites: false,
  flights: false,
  ships: false,
  ground: false,
});

// --- Mutations (named for future event-sourcing) ---

export function toggleLayer(id: LayerId): void {
  setLayers(id, (prev) => !prev);
}

export function setLayerEnabled(id: LayerId, enabled: boolean): void {
  setLayers(id, enabled);
}

export { layers };
