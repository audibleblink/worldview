/**
 * WorldView - createEntity
 *
 * Reactive entity binding for Cesium.
 * Creates entity on viewer, updates reactively via createEffect.
 * Position/orientation updates use property.setValue() to avoid allocation.
 *
 * NOTE: Only use for small numbers of entities (<50).
 * For larger collections, use createBillboardCollection or createPointCollection.
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium, getActiveViewer } from "./useCesium";

declare const Cesium: typeof import("cesium");

type GraphicsOptions = Record<string, unknown>;

export interface EntityOptions {
  id?: string;
  name?: string;
  description?: string;
  position?: Cesium.Cartesian3;
  billboard?: GraphicsOptions;
  point?: GraphicsOptions;
  label?: GraphicsOptions;
  model?: GraphicsOptions;
  polyline?: GraphicsOptions;
  path?: GraphicsOptions;
  orientation?: Cesium.Quaternion;
  properties?: Record<string, unknown>;
}

export interface CreateEntityReturn {
  entity: Cesium.Entity | null;
}

/**
 * Set a ConstantProperty value, creating the property if needed.
 * Avoids allocation on subsequent calls by reusing existing property.
 */
function setOrCreateProperty<T, P extends Cesium.ConstantProperty>(
  existing: P | null,
  value: T,
  PropertyClass: new (v: T) => P,
): P {
  if (existing) {
    existing.setValue(value);
    return existing;
  }
  return new PropertyClass(value);
}

/** Apply GraphicsOptions to a Cesium graphics object, wrapping each in ConstantProperty. */
function applyGraphicsUpdates(graphics: any, options: GraphicsOptions, keys: readonly string[]): void {
  for (const key of keys) {
    if (options[key] !== undefined) {
      graphics[key] = new Cesium.ConstantProperty(options[key]);
    }
  }
}

/**
 * Create a reactive Cesium entity.
 *
 * Position updates mutate existing property via setValue()
 * to avoid allocating new ConstantPositionProperty objects per frame.
 */
export function createEntity(getOptions: Accessor<EntityOptions | null>): CreateEntityReturn {
  const ctx = useCesium();

  let entity: Cesium.Entity | null = null;
  let positionProperty: Cesium.ConstantPositionProperty | null = null;
  let orientationProperty: Cesium.ConstantProperty | null = null;

  createEffect(() => {
    if (!ctx.ready()) return;
    const v = getActiveViewer(ctx);
    if (!v) return;

    const options = getOptions();

    // Null options → remove entity
    if (!options) {
      if (entity) {
        v.entities.remove(entity);
        entity = null;
        positionProperty = null;
        orientationProperty = null;
      }
      return;
    }

    // Create entity on first run
    if (!entity) {
      if (options.position) {
        positionProperty = new Cesium.ConstantPositionProperty(options.position);
      }
      if (options.orientation) {
        orientationProperty = new Cesium.ConstantProperty(options.orientation);
      }

      entity = v.entities.add({
        id: options.id,
        name: options.name,
        description: options.description,
        position: positionProperty ?? undefined,
        orientation: orientationProperty ?? undefined,
        billboard: options.billboard,
        point: options.point,
        label: options.label,
        model: options.model,
        polyline: options.polyline,
        path: options.path,
        properties: options.properties
          ? new Cesium.PropertyBag(options.properties)
          : undefined,
      });
      return;
    }

    // Update existing entity — use setValue() to avoid allocation
    if (options.position) {
      positionProperty = setOrCreateProperty(positionProperty, options.position, Cesium.ConstantPositionProperty);
      entity.position = positionProperty;
    }
    if (options.orientation) {
      orientationProperty = setOrCreateProperty(orientationProperty, options.orientation, Cesium.ConstantProperty);
      entity.orientation = orientationProperty as any;
    }
    if (options.name !== undefined) entity.name = options.name;
    if (options.description !== undefined) {
      entity.description = new Cesium.ConstantProperty(options.description);
    }

    // Update graphics (not per-frame critical, so ConstantProperty allocation is fine)
    if (options.billboard && entity.billboard) {
      applyGraphicsUpdates(entity.billboard, options.billboard, ["image", "scale", "color", "rotation", "show"]);
    }
    if (options.label && entity.label) {
      applyGraphicsUpdates(entity.label, options.label, ["text", "font", "fillColor", "show"]);
    }
    if (options.model && entity.model) {
      applyGraphicsUpdates(entity.model, options.model, ["scale", "minimumPixelSize", "show"]);
    }
  });

  onCleanup(() => {
    if (!entity) return;
    const v = getActiveViewer(ctx);
    if (v) v.entities.remove(entity);
    entity = null;
    positionProperty = null;
    orientationProperty = null;
  });

  return {
    get entity() { return entity; },
  };
}

export default createEntity;
