/**
 * Layer Renderer - Mounts/unmounts layer components based on enabled state
 */

import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { layers, type LayerId } from "../stores/layers";
import { recording } from "../stores/recording";
import { getAllLayers } from "./registry";

export function LayerRenderer() {
  const registeredLayers = getAllLayers();

  return (
    <For each={registeredLayers}>
      {(layer) => (
        // During playback, keep layers mounted so handles stay registered.
        // Pass hidden=true when toggled off so billboard setVisible hides them.
        <Show when={layers[layer.id as LayerId] || recording.mode === "playback"}>
          <Dynamic
            component={layer.component as any}
            hidden={!layers[layer.id as LayerId]}
          />
        </Show>
      )}
    </For>
  );
}
