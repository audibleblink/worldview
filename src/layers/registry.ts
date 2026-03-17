/**
 * Layer Registry - Typed registration system for visualization layers
 */

import type { Component } from "solid-js";
import type { LayerId } from "../stores/layers";

export interface LayerDefinition {
  id: LayerId;
  name: string;
  icon: string;
  component: Component;
  defaultEnabled: boolean;
}

const registry = new Map<LayerId, LayerDefinition>();

export function registerLayer(def: LayerDefinition): void {
  if (registry.has(def.id)) {
    console.warn(`[LayerRegistry] Overwriting "${def.id}"`);
  }
  registry.set(def.id, def);
}

export function getAllLayers(): LayerDefinition[] {
  return Array.from(registry.values());
}
