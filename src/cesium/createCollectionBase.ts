/**
 * WorldView - Shared Collection Factory Base
 *
 * Common logic for BillboardCollection and PointPrimitiveCollection.
 * Reduces duplication between createBillboardCollection and createPointCollection.
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium, getActiveViewer } from "./useCesium";

declare const Cesium: typeof import("cesium");

export interface BaseItemOptions {
  id: string;
  position: Cesium.Cartesian3;
  show?: boolean;
  data?: unknown;
}

export interface CollectionFactoryConfig<
  TCollection,
  TItem,
  TOptions extends BaseItemOptions,
> {
  /** Create a new collection instance */
  createCollection: (scene: Cesium.Scene) => TCollection;
  /** Add an item to the collection */
  addItem: (collection: TCollection, options: TOptions) => TItem;
  /** Remove an item from the collection */
  removeItem: (collection: TCollection, item: TItem) => void;
  /** Remove all items from the collection */
  removeAll: (collection: TCollection) => void;
  /** Update an existing item with new options */
  updateItem: (item: TItem, options: Partial<TOptions>) => void;
}

export interface CollectionBaseReturn<TItem, TOptions extends BaseItemOptions> {
  add: (options: TOptions) => TItem | null;
  remove: (id: string) => boolean;
  update: (id: string, options: Partial<TOptions>) => boolean;
  get: (id: string) => TItem | null;
  clear: () => void;
  count: () => number;
  ids: () => Set<string>;
  getCollection: () => unknown | null;
}

/**
 * Creates a reactive primitive collection with standard add/remove/update operations.
 * Handles viewer lifecycle, reactive sync, and cleanup automatically.
 */
export function createCollectionFactory<
  TCollection,
  TItem,
  TOptions extends BaseItemOptions,
>(
  config: CollectionFactoryConfig<TCollection, TItem, TOptions>,
  itemsAccessor?: Accessor<TOptions[]>,
): CollectionBaseReturn<TItem, TOptions> {
  const ctx = useCesium();

  let collection: TCollection | null = null;
  const itemMap = new Map<string, TItem>();

  // Initialize collection when viewer is ready
  createEffect(() => {
    if (!ctx.ready()) return;
    const v = getActiveViewer(ctx);
    if (!v || collection) return;

    collection = config.createCollection(v.scene);
    v.scene.primitives.add(collection);
  });

  const add = (opts: TOptions): TItem | null => {
    if (!collection) return null;
    const item = config.addItem(collection, opts);
    itemMap.set(opts.id, item);
    return item;
  };

  const remove = (id: string): boolean => {
    const item = itemMap.get(id);
    if (!item || !collection) return false;
    config.removeItem(collection, item);
    itemMap.delete(id);
    return true;
  };

  const update = (id: string, opts: Partial<TOptions>): boolean => {
    const item = itemMap.get(id);
    if (!item) return false;
    config.updateItem(item, opts);
    return true;
  };

  const clear = (): void => {
    if (!collection) return;
    config.removeAll(collection);
    itemMap.clear();
  };

  // Sync with reactive items accessor if provided
  if (itemsAccessor) {
    createEffect(() => {
      if (!collection) return;

      const items = itemsAccessor();
      const newIds = new Set(items.map((item) => item.id));

      // Remove stale items
      for (const id of itemMap.keys()) {
        if (!newIds.has(id)) remove(id);
      }

      // Add or update
      for (const opts of items) {
        itemMap.has(opts.id) ? update(opts.id, opts) : add(opts);
      }
    });
  }

  onCleanup(() => {
    if (!collection) return;
    const v = getActiveViewer(ctx);
    if (v) v.scene.primitives.remove(collection);
    collection = null;
    itemMap.clear();
  });

  return {
    add,
    remove,
    update,
    get: (id) => itemMap.get(id) ?? null,
    clear,
    count: () => itemMap.size,
    ids: () => new Set(itemMap.keys()),
    getCollection: () => collection,
  };
}
