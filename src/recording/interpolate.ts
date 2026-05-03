/**
 * WorldView - Interpolation utilities for playback
 * Pure functions — no SolidJS or Cesium dependencies.
 */

import type { Frame } from "./types";

/** Linear interpolation between a and b by alpha in [0, 1]. */
export function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

/**
 * Interpolate between two angles (degrees), choosing the shortest arc.
 * Handles 360° wraparound correctly.
 */
export function lerpAngle(a: number, b: number, alpha: number): number {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  const result = a + diff * alpha;
  // Normalize output to [0, 360).
  return ((result % 360) + 360) % 360;
}

/**
 * Binary-search `frames` for the two frames bracketing time `t`.
 * Returns `[prevFrame, nextFrame, alpha]` where `alpha` ∈ [0, 1].
 * Returns `null` if `frames` is empty.
 */
export function findBracket(
  frames: Frame[],
  t: number,
): [Frame, Frame, number] | null {
  if (frames.length === 0) return null;
  if (t <= frames[0]!.t) return [frames[0]!, frames[0]!, 0];
  const last = frames[frames.length - 1]!;
  if (t >= last.t) return [last, last, 0];

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const prev = frames[lo]!;
  const next = frames[hi]!;
  const alpha = (t - prev.t) / (next.t - prev.t);
  return [prev, next, alpha];
}
