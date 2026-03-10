/**
 * WorldView - createBillboardCollection
 *
 * Reactive BillboardCollection binding for high-count layers (100+ items).
 * Uses primitive-level rendering for single draw call regardless of count.
 *
 * REQUIRED for satellites and ships (Blocklist #3: Never use Entity API for >50 items).
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium } from "./useCesium";

declare const Cesium: typeof import("cesium");

export interface BillboardOptions {
  /** Unique identifier for the billboard */
  id: string;
  /** Position in Cartesian3 */
  position: Cesium.Cartesian3;
  /** Image URL, canvas, or data URL */
  image: string | HTMLCanvasElement;
  /** Scale factor (default: 1.0) */
  scale?: number;
  /** Billboard color tint */
  color?: Cesium.Color;
  /** Rotation in radians */
  rotation?: number;
  /** Whether billboard is visible */
  show?: boolean;
  /** Pixel offset from position */
  pixelOffset?: Cesium.Cartesian2;
  /** Vertical origin (default: CENTER) */
  verticalOrigin?: Cesium.VerticalOrigin;
  /** Horizontal origin (default: CENTER) */
  horizontalOrigin?: Cesium.HorizontalOrigin;
  /** Custom data attached to billboard */
  data?: unknown;
}

export interface CreateBillboardCollectionOptions {
  /** Initial billboards */
  billboards?: Accessor<BillboardOptions[]>;
  /** Whether to allow picking billboards */
  allowPicking?: boolean;
  /** Scene to add collection to (defaults to primitives) */
  scene?: Cesium.Scene;
}

export interface CreateBillboardCollectionReturn {
  /** The BillboardCollection instance */
  collection: Cesium.BillboardCollection | null;
  /** Add a single billboard */
  add: (options: BillboardOptions) => Cesium.Billboard | null;
  /** Remove a billboard by ID */
  remove: (id: string) => boolean;
  /** Update a billboard by ID */
  update: (id: string, options: Partial<BillboardOptions>) => boolean;
  /** Get billboard by ID */
  get: (id: string) => Cesium.Billboard | null;
  /** Clear all billboards */
  clear: () => void;
  /** Get count of billboards */
  count: () => number;
}

/**
 * Create a reactive BillboardCollection for efficient rendering of many billboards.
 *
 * Features:
 * - Single draw call for all billboards
 * - Efficient add/remove/update operations
 * - Auto-cleanup on unmount
 * - Reactive updates via accessor
 *
 * @param options - Collection options
 * @returns Object with collection reference and management methods
 *
 * Usage:
 * ```tsx
 * const [satellites, setSatellites] = createSignal<BillboardOptions[]>([]);
 *
 * const { add, remove, update, clear } = createBillboardCollection({
 *   billboards: satellites,
 * });
 *
 * // Or manage manually:
 * add({
 *   id: '25544',
 *   position: issPosition,
 *   image: satelliteIcon,
 *   scale: 0.5,
 * });
 *
 * // Update position efficiently
 * update('25544', { position: newPosition });
 * ```
 */
export function createBillboardCollection(
  options: CreateBillboardCollectionOptions = {}
): CreateBillboardCollectionReturn {
  const { viewer, ready } = useCesium();

  let collection: Cesium.BillboardCollection | null = null;
  const billboardMap = new Map<string, Cesium.Billboard>();

  // Initialize collection when viewer is ready
  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Create collection if not exists
    if (!collection) {
      collection = new Cesium.BillboardCollection({
        scene: v.scene,
      });
      v.scene.primitives.add(collection);
    }
  });

  // Sync with reactive billboards accessor if provided
  if (options.billboards) {
    createEffect(() => {
      if (!collection) return;

      const billboards = options.billboards!();
      const currentIds = new Set(billboardMap.keys());
      const newIds = new Set(billboards.map((b) => b.id));

      // Remove billboards that are no longer in the list
      for (const id of currentIds) {
        if (!newIds.has(id)) {
          removeInternal(id);
        }
      }

      // Add or update billboards
      for (const opts of billboards) {
        if (billboardMap.has(opts.id)) {
          updateInternal(opts.id, opts);
        } else {
          addInternal(opts);
        }
      }
    });
  }

  function addInternal(opts: BillboardOptions): Cesium.Billboard | null {
    if (!collection) return null;

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
    });

    // Store custom data on the billboard
    if (opts.data !== undefined) {
      (billboard as unknown as { data: unknown }).data = opts.data;
    }

    billboardMap.set(opts.id, billboard);
    return billboard;
  }

  function removeInternal(id: string): boolean {
    const billboard = billboardMap.get(id);
    if (!billboard || !collection) return false;

    collection.remove(billboard);
    billboardMap.delete(id);
    return true;
  }

  function updateInternal(id: string, opts: Partial<BillboardOptions>): boolean {
    const billboard = billboardMap.get(id);
    if (!billboard) return false;

    // Update properties directly - no allocation needed
    if (opts.position !== undefined) {
      billboard.position = opts.position;
    }
    if (opts.image !== undefined) {
      // Cesium accepts both string and HTMLCanvasElement
      billboard.image = opts.image as string;
    }
    if (opts.scale !== undefined) {
      billboard.scale = opts.scale;
    }
    if (opts.color !== undefined) {
      billboard.color = opts.color;
    }
    if (opts.rotation !== undefined) {
      billboard.rotation = opts.rotation;
    }
    if (opts.show !== undefined) {
      billboard.show = opts.show;
    }
    if (opts.pixelOffset !== undefined) {
      billboard.pixelOffset = opts.pixelOffset;
    }
    if (opts.data !== undefined) {
      (billboard as unknown as { data: unknown }).data = opts.data;
    }

    return true;
  }

  function clearInternal(): void {
    if (!collection) return;

    collection.removeAll();
    billboardMap.clear();
  }

  onCleanup(() => {
    if (collection) {
      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.scene.primitives.remove(collection);
      }
      collection = null;
      billboardMap.clear();
    }
  });

  return {
    get collection() {
      return collection;
    },

    add: (opts: BillboardOptions) => addInternal(opts),

    remove: (id: string) => removeInternal(id),

    update: (id: string, opts: Partial<BillboardOptions>) => updateInternal(id, opts),

    get: (id: string) => billboardMap.get(id) ?? null,

    clear: () => clearInternal(),

    count: () => billboardMap.size,
  };
}

export default createBillboardCollection;
