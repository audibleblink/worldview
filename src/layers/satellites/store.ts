/**
 * WorldView - Satellite Store
 *
 * Satellite-specific reactive store for managing satellite state.
 * Structured for future event-sourcing (mutations go through named functions).
 */

import { createStore } from "solid-js/store";
import type { SatelliteCategory, SatelliteRecord } from "./types";

/**
 * Satellite store state
 */
export interface SatelliteState {
  /** All loaded satellite records */
  records: SatelliteRecord[];
  /** Categories that are hidden from view */
  hiddenCategories: Set<SatelliteCategory>;
  /** NORAD ID of satellite currently being followed (null if not following) */
  followingNoradId: string | null;
  /** Timestamp of last TLE fetch */
  lastUpdated: number | null;
  /** Whether TLEs are currently loading */
  isLoading: boolean;
  /** Error message if TLE fetch failed */
  error: string | null;
}

// Initial state
const initialState: SatelliteState = {
  records: [],
  hiddenCategories: new Set<SatelliteCategory>(["starlink"]),
  followingNoradId: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
};

// Create the store
const [satelliteState, setSatelliteState] = createStore<SatelliteState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Set all satellite records (usually after TLE fetch)
 */
export function setSatellites(records: SatelliteRecord[]): void {
  setSatelliteState({
    records,
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

/**
 * Add satellites to existing records (for on-demand fetches)
 */
export function addSatellite(record: SatelliteRecord): void {
  setSatelliteState("records", (prev) => [...prev, record]);
}

/**
 * Set loading state
 */
export function setLoading(isLoading: boolean): void {
  setSatelliteState("isLoading", isLoading);
}

/**
 * Set error state
 */
export function setError(error: string | null): void {
  setSatelliteState({
    error,
    isLoading: false,
  });
}

/**
 * Toggle category visibility
 */
export function toggleCategory(category: SatelliteCategory): void {
  setSatelliteState("hiddenCategories", (prev) => {
    const next = new Set(prev);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    return next;
  });
}

/**
 * Set category visibility to a specific value
 */
export function setCategoryVisible(category: SatelliteCategory, visible: boolean): void {
  setSatelliteState("hiddenCategories", (prev) => {
    const next = new Set(prev);
    if (visible) {
      next.delete(category);
    } else {
      next.add(category);
    }
    return next;
  });
}

/**
 * Check if a category is visible
 */
export function isCategoryVisible(category: SatelliteCategory): boolean {
  return !satelliteState.hiddenCategories.has(category);
}

/**
 * Start following a satellite
 */
export function followSatellite(noradId: string): void {
  setSatelliteState("followingNoradId", noradId);
}

/**
 * Stop following satellite
 */
export function unfollowSatellite(): void {
  setSatelliteState("followingNoradId", null);
}

/**
 * Get a satellite record by NORAD ID
 */
export function getSatelliteByNoradId(noradId: string): SatelliteRecord | undefined {
  return satelliteState.records.find((r) => r.noradId === noradId);
}

/**
 * Get visible satellite count (filtering by hidden categories)
 */
export function getVisibleCount(): number {
  return satelliteState.records.filter(
    (r) => !satelliteState.hiddenCategories.has(r.category)
  ).length;
}

/**
 * Clear all satellite data
 */
export function clearSatellites(): void {
  setSatelliteState({
    records: [],
    hiddenCategories: new Set(),
    followingNoradId: null,
    lastUpdated: null,
    isLoading: false,
    error: null,
  });
}

// Export readonly state
export { satelliteState };
