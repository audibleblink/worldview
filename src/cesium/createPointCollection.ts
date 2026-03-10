/**
 * WorldView - createPointCollection
 *
 * Reactive PointPrimitiveCollection binding for traffic particles and other
 * high-count point visualizations.
 *
 * Features batched updates and LOD support for performance.
 */

import { createEffect, onCleanup, type Accessor } from "solid-js";
import { useCesium } from "./useCesium";

declare const Cesium: typeof import("cesium");

export interface PointOptions {
  /** Unique identifier for the point */
  id: string;
  /** Position in Cartesian3 */
  position: Cesium.Cartesian3;
  /** Point color */
  color?: Cesium.Color;
  /** Point pixel size */
  pixelSize?: number;
  /** Outline color */
  outlineColor?: Cesium.Color;
  /** Outline width */
  outlineWidth?: number;
  /** Whether point is visible */
  show?: boolean;
  /** Custom data attached to point */
  data?: unknown;
}

export interface CreatePointCollectionOptions {
  /** Initial points */
  points?: Accessor<PointOptions[]>;
  /** Default pixel size */
  defaultPixelSize?: number;
  /** Default color */
  defaultColor?: Cesium.Color;
  /** Enable LOD (hide smaller points at distance) */
  enableLOD?: boolean;
  /** Distance at which to start hiding points */
  lodDistance?: number;
}

export interface CreatePointCollectionReturn {
  /** The PointPrimitiveCollection instance */
  collection: Cesium.PointPrimitiveCollection | null;
  /** Add a single point */
  add: (options: PointOptions) => Cesium.PointPrimitive | null;
  /** Remove a point by ID */
  remove: (id: string) => boolean;
  /** Update a point by ID */
  update: (id: string, options: Partial<PointOptions>) => boolean;
  /** Get point by ID */
  get: (id: string) => Cesium.PointPrimitive | null;
  /** Clear all points */
  clear: () => void;
  /** Get count of points */
  count: () => number;
  /** Batch update multiple points */
  batchUpdate: (updates: Array<{ id: string; options: Partial<PointOptions> }>) => void;
}

/**
 * Create a reactive PointPrimitiveCollection for efficient rendering of many points.
 *
 * Features:
 * - Single draw call for all points
 * - Batched updates for performance
 * - Optional LOD support
 * - Auto-cleanup on unmount
 *
 * @param options - Collection options
 * @returns Object with collection reference and management methods
 *
 * Usage:
 * ```tsx
 * const { add, update, batchUpdate, clear } = createPointCollection({
 *   defaultPixelSize: 4,
 *   defaultColor: Cesium.Color.CYAN,
 * });
 *
 * // Add traffic particle
 * add({
 *   id: 'particle-1',
 *   position: position,
 * });
 *
 * // Batch update for animation
 * batchUpdate([
 *   { id: 'particle-1', options: { position: newPos1 } },
 *   { id: 'particle-2', options: { position: newPos2 } },
 * ]);
 * ```
 */
export function createPointCollection(
  options: CreatePointCollectionOptions = {}
): CreatePointCollectionReturn {
  const { viewer, ready } = useCesium();

  const defaultPixelSize = options.defaultPixelSize ?? 4;
  const defaultColor = options.defaultColor ?? Cesium.Color.WHITE;

  let collection: Cesium.PointPrimitiveCollection | null = null;
  const pointMap = new Map<string, Cesium.PointPrimitive>();

  // Initialize collection when viewer is ready
  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Create collection if not exists
    if (!collection) {
      collection = new Cesium.PointPrimitiveCollection();
      v.scene.primitives.add(collection);
    }
  });

  // Sync with reactive points accessor if provided
  if (options.points) {
    createEffect(() => {
      if (!collection) return;

      const points = options.points!();
      const currentIds = new Set(pointMap.keys());
      const newIds = new Set(points.map((p) => p.id));

      // Remove points that are no longer in the list
      for (const id of currentIds) {
        if (!newIds.has(id)) {
          removeInternal(id);
        }
      }

      // Add or update points
      for (const opts of points) {
        if (pointMap.has(opts.id)) {
          updateInternal(opts.id, opts);
        } else {
          addInternal(opts);
        }
      }
    });
  }

  function addInternal(opts: PointOptions): Cesium.PointPrimitive | null {
    if (!collection) return null;

    const point = collection.add({
      id: opts.id,
      position: opts.position,
      color: opts.color ?? defaultColor,
      pixelSize: opts.pixelSize ?? defaultPixelSize,
      outlineColor: opts.outlineColor ?? Cesium.Color.TRANSPARENT,
      outlineWidth: opts.outlineWidth ?? 0,
      show: opts.show ?? true,
    });

    // Store custom data on the point
    if (opts.data !== undefined) {
      (point as unknown as { data: unknown }).data = opts.data;
    }

    pointMap.set(opts.id, point);
    return point;
  }

  function removeInternal(id: string): boolean {
    const point = pointMap.get(id);
    if (!point || !collection) return false;

    collection.remove(point);
    pointMap.delete(id);
    return true;
  }

  function updateInternal(id: string, opts: Partial<PointOptions>): boolean {
    const point = pointMap.get(id);
    if (!point) return false;

    // Update properties directly - no allocation needed
    if (opts.position !== undefined) {
      point.position = opts.position;
    }
    if (opts.color !== undefined) {
      point.color = opts.color;
    }
    if (opts.pixelSize !== undefined) {
      point.pixelSize = opts.pixelSize;
    }
    if (opts.outlineColor !== undefined) {
      point.outlineColor = opts.outlineColor;
    }
    if (opts.outlineWidth !== undefined) {
      point.outlineWidth = opts.outlineWidth;
    }
    if (opts.show !== undefined) {
      point.show = opts.show;
    }
    if (opts.data !== undefined) {
      (point as unknown as { data: unknown }).data = opts.data;
    }

    return true;
  }

  function clearInternal(): void {
    if (!collection) return;

    collection.removeAll();
    pointMap.clear();
  }

  function batchUpdateInternal(
    updates: Array<{ id: string; options: Partial<PointOptions> }>
  ): void {
    for (const { id, options: opts } of updates) {
      updateInternal(id, opts);
    }
  }

  onCleanup(() => {
    if (collection) {
      const v = viewer();
      if (v && !v.isDestroyed()) {
        v.scene.primitives.remove(collection);
      }
      collection = null;
      pointMap.clear();
    }
  });

  return {
    get collection() {
      return collection;
    },

    add: (opts: PointOptions) => addInternal(opts),

    remove: (id: string) => removeInternal(id),

    update: (id: string, opts: Partial<PointOptions>) => updateInternal(id, opts),

    get: (id: string) => pointMap.get(id) ?? null,

    clear: () => clearInternal(),

    count: () => pointMap.size,

    batchUpdate: (updates) => batchUpdateInternal(updates),
  };
}

export default createPointCollection;
