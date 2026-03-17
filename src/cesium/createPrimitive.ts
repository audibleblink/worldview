/**
 * WorldView - createPrimitive
 *
 * Reactive primitive binding for Cesium.
 * Add/remove primitives from scene.primitives reactively.
 *
 * Use for Cesium3DTileset, GroundPrimitive, custom geometry primitives.
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium, getActiveViewer } from "./useCesium";

declare const Cesium: typeof import("cesium");

type CesiumPrimitive = unknown;

export interface CreatePrimitiveOptions<T extends CesiumPrimitive> {
  create: () => T | Promise<T>;
  onAdd?: (primitive: T) => void;
  onRemove?: (primitive: T) => void;
}

export interface CreatePrimitiveReturn<T extends CesiumPrimitive> {
  primitive: T | null;
}

/** Try to call .destroy() on an object if it has one. */
function tryDestroy(obj: unknown): void {
  if (obj && typeof (obj as any).destroy === "function") {
    (obj as any).destroy();
  }
}

/**
 * Create a reactive Cesium primitive.
 * Created when viewer is ready, automatically removed on cleanup.
 */
export function createPrimitive<T extends CesiumPrimitive>(
  options: CreatePrimitiveOptions<T>,
): CreatePrimitiveReturn<T> {
  const ctx = useCesium();

  let primitive: T | null = null;
  let disposed = false;

  createEffect(async () => {
    if (!ctx.ready()) return;
    const v = getActiveViewer(ctx);
    if (!v || primitive || disposed) return;

    try {
      const created = await options.create();

      if (disposed) {
        tryDestroy(created);
        return;
      }

      primitive = created;
      v.scene.primitives.add(created);
      options.onAdd?.(created);
    } catch (error) {
      console.error("[createPrimitive] Failed to create primitive:", error);
    }
  });

  onCleanup(() => {
    disposed = true;
    if (!primitive) return;

    options.onRemove?.(primitive);
    const v = getActiveViewer(ctx);
    if (v) v.scene.primitives.remove(primitive);
    primitive = null;
  });

  return {
    get primitive() { return primitive; },
  };
}

/**
 * Create a reactive primitive from an accessor.
 * The primitive is swapped when the accessor value changes.
 */
export function createReactivePrimitive<T extends CesiumPrimitive>(
  getPrimitive: Accessor<T | null>,
): CreatePrimitiveReturn<T> {
  const ctx = useCesium();
  let currentPrimitive: T | null = null;

  createEffect(() => {
    if (!ctx.ready()) return;
    const v = getActiveViewer(ctx);
    if (!v) return;

    const newPrimitive = getPrimitive();

    if (currentPrimitive && currentPrimitive !== newPrimitive) {
      v.scene.primitives.remove(currentPrimitive);
      currentPrimitive = null;
    }

    if (newPrimitive && newPrimitive !== currentPrimitive) {
      v.scene.primitives.add(newPrimitive);
      currentPrimitive = newPrimitive;
    }
  });

  onCleanup(() => {
    if (!currentPrimitive) return;
    const v = getActiveViewer(ctx);
    if (v) v.scene.primitives.remove(currentPrimitive);
    currentPrimitive = null;
  });

  return {
    get primitive() { return currentPrimitive; },
  };
}

export default createPrimitive;
