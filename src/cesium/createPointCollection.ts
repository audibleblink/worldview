/**
 * WorldView - createPointCollection
 *
 * Reactive PointPrimitiveCollection binding for traffic particles and other
 * high-count point visualizations.
 *
 * Features batched updates for performance.
 */

import { type Accessor } from "solid-js";
import { createCollectionFactory } from "./createCollectionBase";

declare const Cesium: typeof import("cesium");

export interface PointOptions {
  id: string;
  position: Cesium.Cartesian3;
  color?: Cesium.Color;
  pixelSize?: number;
  outlineColor?: Cesium.Color;
  outlineWidth?: number;
  show?: boolean;
  data?: unknown;
}

export interface CreatePointCollectionOptions {
  points?: Accessor<PointOptions[]>;
  defaultPixelSize?: number;
  defaultColor?: Cesium.Color;
  enableLOD?: boolean;
  lodDistance?: number;
}

export interface CreatePointCollectionReturn {
  collection: Cesium.PointPrimitiveCollection | null;
  add: (options: PointOptions) => Cesium.PointPrimitive | null;
  remove: (id: string) => boolean;
  update: (id: string, options: Partial<PointOptions>) => boolean;
  get: (id: string) => Cesium.PointPrimitive | null;
  clear: () => void;
  count: () => number;
  batchUpdate: (updates: Array<{ id: string; options: Partial<PointOptions> }>) => void;
}

/** Properties that can be directly assigned on a Cesium.PointPrimitive. */
const UPDATABLE_PROPS = ["position", "color", "pixelSize", "outlineColor", "outlineWidth", "show"] as const;

/**
 * Create a reactive PointPrimitiveCollection for efficient rendering of many points.
 * Single draw call for all points, with auto-cleanup on unmount.
 */
export function createPointCollection(
  options: CreatePointCollectionOptions = {},
): CreatePointCollectionReturn {
  const defaultPixelSize = options.defaultPixelSize ?? 4;
  const defaultColor = options.defaultColor ?? Cesium.Color.WHITE;

  const base = createCollectionFactory<
    Cesium.PointPrimitiveCollection,
    Cesium.PointPrimitive,
    PointOptions
  >(
    {
      createCollection: () => new Cesium.PointPrimitiveCollection(),

      addItem: (collection, opts) => {
        const point = collection.add({
          id: opts.id,
          position: opts.position,
          color: opts.color ?? defaultColor,
          pixelSize: opts.pixelSize ?? defaultPixelSize,
          outlineColor: opts.outlineColor ?? Cesium.Color.TRANSPARENT,
          outlineWidth: opts.outlineWidth ?? 0,
          show: opts.show ?? true,
        });
        if (opts.data !== undefined) (point as any).data = opts.data;
        return point;
      },

      removeItem: (collection, item) => collection.remove(item),
      removeAll: (collection) => collection.removeAll(),

      updateItem: (point, opts) => {
        for (const key of UPDATABLE_PROPS) {
          if (opts[key] !== undefined) (point as any)[key] = opts[key];
        }
        if (opts.data !== undefined) (point as any).data = opts.data;
      },
    },
    options.points,
  );

  return {
    get collection() { return base.getCollection() as Cesium.PointPrimitiveCollection | null; },
    add: base.add,
    remove: base.remove,
    update: base.update,
    get: base.get,
    clear: base.clear,
    count: base.count,
    batchUpdate: (updates) => {
      for (const { id, options: opts } of updates) base.update(id, opts);
    },
  };
}

export default createPointCollection;
