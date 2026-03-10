/**
 * WorldView - createEntity
 *
 * Reactive entity binding for Cesium.
 * Creates entity on viewer, updates reactively via createEffect.
 * Position updates use property.setValue() to avoid allocation (Blocklist #1).
 *
 * NOTE: Only use for small numbers of entities (<50).
 * For larger collections, use createBillboardCollection or createPointCollection.
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium } from "./useCesium";

declare const Cesium: typeof import("cesium");

export interface EntityOptions {
  /** Unique entity ID */
  id?: string;
  /** Entity name */
  name?: string;
  /** Entity description */
  description?: string;
  /** Position in Cartesian3 */
  position?: Cesium.Cartesian3;
  /** Billboard options */
  billboard?: Cesium.BillboardGraphics.ConstructorOptions;
  /** Point options */
  point?: Cesium.PointGraphics.ConstructorOptions;
  /** Label options */
  label?: Cesium.LabelGraphics.ConstructorOptions;
  /** Model options (for 3D models) */
  model?: Cesium.ModelGraphics.ConstructorOptions;
  /** Polyline options */
  polyline?: Cesium.PolylineGraphics.ConstructorOptions;
  /** Path options (for showing entity trail) */
  path?: Cesium.PathGraphics.ConstructorOptions;
  /** Orientation (for 3D models) */
  orientation?: Cesium.Quaternion;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

export interface CreateEntityReturn {
  /** The Cesium Entity instance (null until created) */
  entity: Cesium.Entity | null;
}

/**
 * Create a reactive Cesium entity.
 *
 * The entity is created when the viewer is ready and updated
 * reactively when the options accessor changes.
 *
 * IMPORTANT: Position updates mutate existing property via setValue()
 * to avoid allocating new ConstantPositionProperty objects per frame.
 *
 * @param getOptions - Accessor returning entity options
 * @returns Object with entity reference
 *
 * Usage:
 * ```tsx
 * const [position, setPosition] = createSignal(Cesium.Cartesian3.fromDegrees(0, 0, 0));
 *
 * const { entity } = createEntity(() => ({
 *   id: 'my-entity',
 *   position: position(),
 *   billboard: { image: '/icon.png', scale: 1.0 },
 * }));
 *
 * // Update position reactively (uses setValue internally)
 * setPosition(Cesium.Cartesian3.fromDegrees(1, 1, 0));
 * ```
 */
export function createEntity(getOptions: Accessor<EntityOptions | null>): CreateEntityReturn {
  const { viewer, ready } = useCesium();

  let entity: Cesium.Entity | null = null;

  // Track the position property for efficient updates
  let positionProperty: Cesium.ConstantPositionProperty | null = null;
  // Track the orientation property for efficient updates
  let orientationProperty: Cesium.ConstantProperty | null = null;

  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const options = getOptions();

    // If options are null, remove entity if it exists
    if (!options) {
      if (entity) {
        v.entities.remove(entity);
        entity = null;
        positionProperty = null;
        orientationProperty = null;
      }
      return;
    }

    // Create entity if it doesn't exist
    if (!entity) {
      // Create position property if position provided
      if (options.position) {
        positionProperty = new Cesium.ConstantPositionProperty(options.position);
      }

      // Create orientation property if orientation provided
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

    // Update existing entity - use setValue() to avoid allocation (Blocklist #1)

    // Position update
    if (options.position) {
      if (positionProperty) {
        // Mutate existing property - no allocation!
        positionProperty.setValue(options.position);
      } else {
        // First time setting position
        positionProperty = new Cesium.ConstantPositionProperty(options.position);
        entity.position = positionProperty;
      }
    }

    // Orientation update
    if (options.orientation) {
      if (orientationProperty) {
        // Mutate existing property - no allocation!
        orientationProperty.setValue(options.orientation);
      } else {
        // First time setting orientation
        orientationProperty = new Cesium.ConstantProperty(options.orientation);
        entity.orientation = orientationProperty;
      }
    }

    // Update other properties that are less performance-critical
    if (options.name !== undefined) {
      entity.name = options.name;
    }

    if (options.description !== undefined) {
      entity.description = new Cesium.ConstantProperty(options.description);
    }

    // Update graphics options if provided
    // These create new graphics objects but are typically not updated per-frame
    if (options.billboard && entity.billboard) {
      updateBillboard(entity.billboard, options.billboard);
    }

    if (options.label && entity.label) {
      updateLabel(entity.label, options.label);
    }

    if (options.model && entity.model) {
      updateModel(entity.model, options.model);
    }
  });

  onCleanup(() => {
    if (entity) {
      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.entities.remove(entity);
      }
      entity = null;
      positionProperty = null;
      orientationProperty = null;
    }
  });

  return {
    get entity() {
      return entity;
    },
  };
}

// Helper functions to update graphics properties without full recreation

function updateBillboard(
  billboard: Cesium.BillboardGraphics,
  options: Cesium.BillboardGraphics.ConstructorOptions
) {
  if (options.image !== undefined) {
    billboard.image = new Cesium.ConstantProperty(options.image);
  }
  if (options.scale !== undefined) {
    billboard.scale = new Cesium.ConstantProperty(options.scale);
  }
  if (options.color !== undefined) {
    billboard.color = new Cesium.ConstantProperty(options.color);
  }
  if (options.rotation !== undefined) {
    billboard.rotation = new Cesium.ConstantProperty(options.rotation);
  }
  if (options.show !== undefined) {
    billboard.show = new Cesium.ConstantProperty(options.show);
  }
}

function updateLabel(
  label: Cesium.LabelGraphics,
  options: Cesium.LabelGraphics.ConstructorOptions
) {
  if (options.text !== undefined) {
    label.text = new Cesium.ConstantProperty(options.text);
  }
  if (options.font !== undefined) {
    label.font = new Cesium.ConstantProperty(options.font);
  }
  if (options.fillColor !== undefined) {
    label.fillColor = new Cesium.ConstantProperty(options.fillColor);
  }
  if (options.show !== undefined) {
    label.show = new Cesium.ConstantProperty(options.show);
  }
}

function updateModel(
  model: Cesium.ModelGraphics,
  options: Cesium.ModelGraphics.ConstructorOptions
) {
  if (options.scale !== undefined) {
    model.scale = new Cesium.ConstantProperty(options.scale);
  }
  if (options.minimumPixelSize !== undefined) {
    model.minimumPixelSize = new Cesium.ConstantProperty(options.minimumPixelSize);
  }
  if (options.show !== undefined) {
    model.show = new Cesium.ConstantProperty(options.show);
  }
}

export default createEntity;
