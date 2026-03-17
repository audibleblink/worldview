/**
 * WorldView - createBillboardCollection
 *
 * Reactive BillboardCollection binding for high-count layers (100+ items).
 * Uses primitive-level rendering for single draw call regardless of count.
 *
 * REQUIRED for satellites and ships (Blocklist #3: Never use Entity API for >50 items).
 */

import { type Accessor } from "solid-js";
import { createCollectionFactory } from "./createCollectionBase";

declare const Cesium: typeof import("cesium");

export interface BillboardOptions {
  id: string;
  position: Cesium.Cartesian3;
  image: string | HTMLCanvasElement;
  scale?: number;
  color?: Cesium.Color;
  rotation?: number;
  show?: boolean;
  pixelOffset?: Cesium.Cartesian2;
  verticalOrigin?: Cesium.VerticalOrigin;
  horizontalOrigin?: Cesium.HorizontalOrigin;
  data?: unknown;
  disableDepthTestDistance?: number;
  alignedAxis?: Cesium.Cartesian3;
}

export interface CreateBillboardCollectionOptions {
  billboards?: Accessor<BillboardOptions[]>;
  allowPicking?: boolean;
  scene?: Cesium.Scene;
}

export interface CreateBillboardCollectionReturn {
  collection: Cesium.BillboardCollection | null;
  add: (options: BillboardOptions) => Cesium.Billboard | null;
  remove: (id: string) => boolean;
  update: (id: string, options: Partial<BillboardOptions>) => boolean;
  get: (id: string) => Cesium.Billboard | null;
  clear: () => void;
  count: () => number;
  ids: () => Set<string>;
}

/** Properties that can be directly assigned on a Cesium.Billboard. */
const UPDATABLE_PROPS = ["position", "scale", "color", "rotation", "show", "pixelOffset", "alignedAxis"] as const;

/**
 * Create a reactive BillboardCollection for efficient rendering of many billboards.
 * Single draw call for all billboards, with auto-cleanup on unmount.
 */
export function createBillboardCollection(
  options: CreateBillboardCollectionOptions = {},
): CreateBillboardCollectionReturn {
  const base = createCollectionFactory<
    Cesium.BillboardCollection,
    Cesium.Billboard,
    BillboardOptions
  >(
    {
      createCollection: (scene) => new Cesium.BillboardCollection({ scene }),

      addItem: (collection, opts) => {
        const billboard = collection.add({
          id: opts.id,
          position: opts.position,
          image: opts.image,
          scale: opts.scale ?? 1.0,
          color: opts.color ?? Cesium.Color.WHITE,
          rotation: opts.rotation ?? 0,
          show: opts.show ?? true,
          pixelOffset: opts.pixelOffset ?? Cesium.Cartesian2.ZERO,
          verticalOrigin: opts.verticalOrigin ?? Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: opts.horizontalOrigin ?? Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: opts.disableDepthTestDistance,
          alignedAxis: opts.alignedAxis,
        });
        if (opts.data !== undefined) (billboard as any).data = opts.data;
        return billboard;
      },

      removeItem: (collection, item) => collection.remove(item),
      removeAll: (collection) => collection.removeAll(),

      updateItem: (billboard, opts) => {
        for (const key of UPDATABLE_PROPS) {
          if (opts[key] !== undefined) (billboard as any)[key] = opts[key];
        }
        if (opts.image !== undefined) billboard.image = opts.image as string;
        if (opts.data !== undefined) (billboard as any).data = opts.data;
      },
    },
    options.billboards,
  );

  return {
    get collection() { return base.getCollection() as Cesium.BillboardCollection | null; },
    add: base.add,
    remove: base.remove,
    update: base.update,
    get: base.get,
    clear: base.clear,
    count: base.count,
    ids: base.ids,
  };
}

export default createBillboardCollection;
