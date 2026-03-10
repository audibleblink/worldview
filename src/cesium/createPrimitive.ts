/**
 * WorldView - createPrimitive
 *
 * Reactive primitive binding for Cesium.
 * Add/remove primitives from scene.primitives reactively.
 *
 * Use for:
 * - Cesium3DTileset
 * - GroundPrimitive
 * - Custom geometry primitives
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium } from "./useCesium";

declare const Cesium: typeof import("cesium");

type CesiumPrimitive =
  | Cesium.Primitive
  | Cesium.GroundPrimitive
  | Cesium.Cesium3DTileset
  | Cesium.PointPrimitiveCollection
  | Cesium.BillboardCollection
  | Cesium.LabelCollection
  | Cesium.PolylineCollection;

export interface CreatePrimitiveOptions<T extends CesiumPrimitive> {
  /** Factory function to create the primitive */
  create: () => T | Promise<T>;
  /** Optional: Called when primitive is added to scene */
  onAdd?: (primitive: T) => void;
  /** Optional: Called before primitive is removed */
  onRemove?: (primitive: T) => void;
}

export interface CreatePrimitiveReturn<T extends CesiumPrimitive> {
  /** The primitive instance (null until created) */
  primitive: T | null;
}

/**
 * Create a reactive Cesium primitive.
 *
 * The primitive is created when the viewer is ready and automatically
 * removed on cleanup.
 *
 * @param options - Primitive options with factory function
 * @returns Object with primitive reference
 *
 * Usage:
 * ```tsx
 * // Add a 3D tileset
 * const { primitive } = createPrimitive({
 *   create: async () => {
 *     return await Cesium.Cesium3DTileset.fromUrl('/tileset/tileset.json');
 *   },
 *   onAdd: (tileset) => {
 *     console.log('Tileset loaded');
 *   },
 * });
 *
 * // Add a ground primitive
 * const { primitive } = createPrimitive({
 *   create: () => new Cesium.GroundPrimitive({
 *     geometryInstances: instance,
 *   }),
 * });
 * ```
 */
export function createPrimitive<T extends CesiumPrimitive>(
  options: CreatePrimitiveOptions<T>
): CreatePrimitiveReturn<T> {
  const { viewer, ready } = useCesium();

  let primitive: T | null = null;
  let isDestroyed = false;

  createEffect(async () => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Don't create if already exists or destroyed
    if (primitive || isDestroyed) return;

    try {
      // Create the primitive (may be async for tilesets)
      const created = await options.create();

      // Check if we were destroyed while creating
      if (isDestroyed) {
        // Clean up the newly created primitive
        if (created && typeof (created as { destroy?: () => void }).destroy === "function") {
          (created as { destroy: () => void }).destroy();
        }
        return;
      }

      primitive = created;

      // Add to scene
      v.scene.primitives.add(created);

      // Call onAdd callback
      if (options.onAdd) {
        options.onAdd(created);
      }
    } catch (error) {
      console.error("[createPrimitive] Failed to create primitive:", error);
    }
  });

  onCleanup(() => {
    isDestroyed = true;

    if (primitive) {
      // Call onRemove callback
      if (options.onRemove) {
        options.onRemove(primitive);
      }

      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.scene.primitives.remove(primitive);
      }

      primitive = null;
    }
  });

  return {
    get primitive() {
      return primitive;
    },
  };
}

/**
 * Create a reactive primitive from an accessor.
 *
 * The primitive is recreated when the accessor value changes.
 *
 * @param getPrimitive - Accessor returning primitive or null
 * @returns Object with primitive reference
 *
 * Usage:
 * ```tsx
 * const [showTileset, setShowTileset] = createSignal(true);
 *
 * createReactivePrimitive(() =>
 *   showTileset() ? new Cesium.Primitive({...}) : null
 * );
 * ```
 */
export function createReactivePrimitive<T extends CesiumPrimitive>(
  getPrimitive: Accessor<T | null>
): CreatePrimitiveReturn<T> {
  const { viewer, ready } = useCesium();

  let currentPrimitive: T | null = null;

  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const newPrimitive = getPrimitive();

    // Remove old primitive if it changed
    if (currentPrimitive && currentPrimitive !== newPrimitive) {
      v.scene.primitives.remove(currentPrimitive);
      currentPrimitive = null;
    }

    // Add new primitive
    if (newPrimitive && newPrimitive !== currentPrimitive) {
      v.scene.primitives.add(newPrimitive);
      currentPrimitive = newPrimitive;
    }
  });

  onCleanup(() => {
    if (currentPrimitive) {
      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.scene.primitives.remove(currentPrimitive);
      }
      currentPrimitive = null;
    }
  });

  return {
    get primitive() {
      return currentPrimitive;
    },
  };
}

export default createPrimitive;
