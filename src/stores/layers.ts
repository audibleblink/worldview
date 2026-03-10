/**
 * WorldView - Layers Store
 * Manages layer visibility state with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

/**
 * Layer visibility state
 */
export interface LayerState {
  satellites: boolean;
  flights: boolean;
  ships: boolean;
  ground: boolean;
}

export type LayerId = keyof LayerState;

// Initial state with all layers disabled by default
const initialState: LayerState = {
  satellites: false,
  flights: false,
  ships: false,
  ground: false,
};

// Create the store
const [layers, setLayers] = createStore<LayerState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Toggle a layer's visibility
 */
export function toggleLayer(id: LayerId): void {
  setLayers(id, (prev) => !prev);
}

/**
 * Set a layer's visibility to a specific value
 */
export function setLayerEnabled(id: LayerId, enabled: boolean): void {
  setLayers(id, enabled);
}

// Export readonly state
export { layers };
