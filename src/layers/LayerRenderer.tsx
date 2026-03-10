/**
 * WorldView - Layer Renderer
 *
 * SolidJS component that renders enabled layers based on the layers store.
 * Uses reactive primitives to mount/unmount layer components cleanly.
 */

import { For, Show, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";
import { layers, type LayerId } from "../stores/layers";
import { getAllLayers, type LayerDefinition } from "./registry";

/**
 * LayerRenderer - Renders all enabled layers
 *
 * This component:
 * - Reads the layers store for visibility state
 * - Renders each layer's component when enabled
 * - Uses <Show> for conditional rendering (proper mount/unmount)
 * - Layer components handle their own cleanup via onCleanup
 */
export function LayerRenderer() {
  // Create a memo that returns all registered layers
  // This only re-runs when the registry changes (which it shouldn't after init)
  const registeredLayers = createMemo(() => getAllLayers());

  return (
    <For each={registeredLayers()}>
      {(layer: LayerDefinition) => (
        <Show when={layers[layer.id as LayerId]}>
          <Dynamic component={layer.component} />
        </Show>
      )}
    </For>
  );
}

export default LayerRenderer;
