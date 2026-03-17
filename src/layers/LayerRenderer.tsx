/**
 * Layer Renderer - Mounts/unmounts layer components based on enabled state
 */

import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { layers, type LayerId } from "../stores/layers";
import { getAllLayers } from "./registry";

export function LayerRenderer() {
  const registeredLayers = getAllLayers();

  return (
    <For each={registeredLayers}>
      {(layer) => (
        <Show when={layers[layer.id as LayerId]}>
          <Dynamic component={layer.component} />
        </Show>
      )}
    </For>
  );
}
