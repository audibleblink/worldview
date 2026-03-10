/**
 * WorldView - Layer Registry
 *
 * Typed layer registration system for managing all visualization layers.
 * Layers register themselves via registerLayer(), and the registry provides
 * query methods for the LayerRenderer component.
 */

import type { Component } from "solid-js";
import { layers, type LayerId } from "../stores/layers";

/**
 * Layer definition containing all metadata and the component to render
 */
export interface LayerDefinition {
  /** Unique identifier matching the layers store key */
  id: LayerId;
  /** Human-readable display name */
  name: string;
  /** Icon name for UI display */
  icon: string;
  /** SolidJS component to render when layer is enabled */
  component: Component;
  /** Optional layer-specific store (for future use) */
  store?: unknown;
  /** Whether layer is enabled by default */
  defaultEnabled: boolean;
}

/** Internal registry map */
const layerRegistry = new Map<LayerId, LayerDefinition>();

/**
 * Register a layer definition
 * Called by each layer's index.ts during module initialization
 */
export function registerLayer(def: LayerDefinition): void {
  if (layerRegistry.has(def.id)) {
    console.warn(`[LayerRegistry] Layer "${def.id}" already registered, overwriting`);
  }
  layerRegistry.set(def.id, def);
  console.log(`[LayerRegistry] Registered layer: ${def.id}`);
}

/**
 * Get a single layer definition by ID
 */
export function getLayer(id: LayerId): LayerDefinition | undefined {
  return layerRegistry.get(id);
}

/**
 * Get all registered layer definitions
 */
export function getAllLayers(): LayerDefinition[] {
  return Array.from(layerRegistry.values());
}

/**
 * Get all currently enabled layers based on the layers store state
 */
export function getEnabledLayers(): LayerDefinition[] {
  return Array.from(layerRegistry.values()).filter((def) => layers[def.id]);
}

/**
 * Check if a layer is registered
 */
export function hasLayer(id: LayerId): boolean {
  return layerRegistry.has(id);
}

/**
 * Get count of registered layers
 */
export function getLayerCount(): number {
  return layerRegistry.size;
}
