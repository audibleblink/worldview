/**
 * Plane Store - Reactive state for plane visualization
 */

import { createStore } from "solid-js/store";
import type { PlaneRecord, BBox } from "./types";

declare const Cesium: typeof import("cesium");

export interface PlaneState {
  planes: Map<string, PlaneRecord>;
  trails: Map<string, Cesium.Cartesian3[]>;
  selectedIcao24: string | null;
  followingIcao24: string | null;
  searchQuery: string;
  searchResults: PlaneRecord[];
  isSearching: boolean;
  lastBbox: BBox | null;
  lastUpdated: number | null;
  isLoading: boolean;
  isRateLimited: boolean;
  error: string | null;
}

const [planeState, setPlaneState] = createStore<PlaneState>({
  planes: new Map(),
  trails: new Map(),
  selectedIcao24: null,
  followingIcao24: null,
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  lastBbox: null,
  lastUpdated: null,
  isLoading: false,
  isRateLimited: false,
  error: null,
});

// --- Mutations ---

export function setPlanes(records: PlaneRecord[]): void {
  setPlaneState({
    planes: new Map(records.map((r) => [r.icao24, r])),
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

export function updatePlanes(records: PlaneRecord[], currentIcao24s: Set<string>): void {
  setPlaneState("planes", (prev) => {
    const next = new Map<string, PlaneRecord>();
    for (const [icao24, record] of prev) {
      if (currentIcao24s.has(icao24)) next.set(icao24, record);
    }
    for (const record of records) {
      next.set(record.icao24, record);
    }
    return next;
  });
  setPlaneState("lastUpdated", Date.now());
}

export function updateTrail(icao24: string, position: Cesium.Cartesian3, maxPoints: number): void {
  setPlaneState("trails", (prev) => {
    const next = new Map(prev);
    const trail = next.get(icao24) ?? [];
    const updated = [...trail, position];
    if (updated.length > maxPoints) {
      updated.shift();
    }
    next.set(icao24, updated);
    return next;
  });
}

export function clearTrail(icao24: string): void {
  setPlaneState("trails", (prev) => {
    const next = new Map(prev);
    next.delete(icao24);
    return next;
  });
}

export function clearTrailsExcept(keepIcao24: string | null): void {
  setPlaneState("trails", (prev) => {
    if (!keepIcao24) return new Map();
    const kept = prev.get(keepIcao24);
    return kept ? new Map([[keepIcao24, kept]]) : new Map();
  });
}

export const setLoading = (v: boolean) => setPlaneState("isLoading", v);
export const setError = (v: string | null) => setPlaneState({ error: v, isLoading: false });
export const setRateLimited = (v: boolean) => setPlaneState("isRateLimited", v);
export const setLastBbox = (v: BBox | null) => setPlaneState("lastBbox", v);

export const selectPlane = (v: string | null) => setPlaneState("selectedIcao24", v);
export const followPlane = (v: string | null) => setPlaneState("followingIcao24", v);
export const unfollowPlane = () => setPlaneState("followingIcao24", null);

export const setSearchQuery = (v: string) => setPlaneState("searchQuery", v);
export const setSearchResults = (v: PlaneRecord[]) => setPlaneState({ searchResults: v, isSearching: false });
export const setSearching = (v: boolean) => setPlaneState("isSearching", v);
export const clearSearch = () => setPlaneState({ searchQuery: "", searchResults: [], isSearching: false });

export const getPlaneByIcao24 = (icao24: string) => planeState.planes.get(icao24);

export function clearPlanes(): void {
  setPlaneState({
    planes: new Map(),
    trails: new Map(),
    selectedIcao24: null,
    followingIcao24: null,
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    lastBbox: null,
    lastUpdated: null,
    isLoading: false,
    isRateLimited: false,
    error: null,
  });
}

export { planeState };
