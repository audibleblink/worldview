/**
 * Satellite Store - Reactive state for satellite visualization
 */

import { createStore } from "solid-js/store";
import type { SatelliteCategory, SatelliteRecord } from "./types";

export interface SatelliteState {
  records: SatelliteRecord[];
  hiddenCategories: Set<SatelliteCategory>;
  followingNoradId: string | null;
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
}

const [satelliteState, setSatelliteState] = createStore<SatelliteState>({
  records: [],
  hiddenCategories: new Set<SatelliteCategory>(["starlink"]),
  followingNoradId: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
});

export function setSatellites(records: SatelliteRecord[]): void {
  setSatelliteState({
    records,
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

export function setLoading(isLoading: boolean): void {
  setSatelliteState("isLoading", isLoading);
}

export function setError(error: string | null): void {
  setSatelliteState({ error, isLoading: false });
}

export function toggleCategory(category: SatelliteCategory): void {
  setSatelliteState("hiddenCategories", (prev) => {
    const next = new Set(prev);
    next.has(category) ? next.delete(category) : next.add(category);
    return next;
  });
}

export function setCategoryVisible(category: SatelliteCategory, visible: boolean): void {
  setSatelliteState("hiddenCategories", (prev) => {
    const next = new Set(prev);
    visible ? next.delete(category) : next.add(category);
    return next;
  });
}

export function isCategoryVisible(category: SatelliteCategory): boolean {
  return !satelliteState.hiddenCategories.has(category);
}

export function followSatellite(noradId: string): void {
  setSatelliteState("followingNoradId", noradId);
}

export function unfollowSatellite(): void {
  setSatelliteState("followingNoradId", null);
}

export function getSatelliteByNoradId(noradId: string): SatelliteRecord | undefined {
  return satelliteState.records.find((r) => r.noradId === noradId);
}

export { satelliteState };
