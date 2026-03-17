/**
 * Ship Store - Reactive state for ship visualization
 */

import { createStore } from "solid-js/store";

export type ShipTypeCategory = "cargo" | "tanker" | "passenger" | "fishing" | "other";

export interface ShipRecord {
  mmsi: string;
  name: string;
  latitude: number;
  longitude: number;
  cog: number;
  sog: number;
  trueHeading: number;
  shipType: number;
  shipTypeCategory: ShipTypeCategory;
  timestamp: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ShipState {
  ships: Map<string, ShipRecord>;
  selectedMmsi: string | null;
  followingMmsi: string | null;
  isRateLimited: boolean;
  lastBbox: BBox | null;
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

const [shipState, setShipState] = createStore<ShipState>({
  ships: new Map(),
  selectedMmsi: null,
  followingMmsi: null,
  isRateLimited: false,
  lastBbox: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
  isConnected: false,
});

export function setShips(records: ShipRecord[]): void {
  setShipState({
    ships: new Map(records.map((r) => [r.mmsi, r])),
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

export function updateShips(records: ShipRecord[], currentMmsis: Set<string>): void {
  setShipState("ships", (prev) => {
    const next = new Map<string, ShipRecord>();
    for (const [mmsi, record] of prev) {
      if (currentMmsis.has(mmsi)) next.set(mmsi, record);
    }
    for (const record of records) {
      next.set(record.mmsi, record);
    }
    return next;
  });
  setShipState("lastUpdated", Date.now());
}

export const setLoading = (v: boolean) => setShipState("isLoading", v);
export const setError = (v: string | null) => setShipState({ error: v, isLoading: false });
export const setConnected = (v: boolean) => setShipState("isConnected", v);
export const setRateLimited = (v: boolean) => setShipState("isRateLimited", v);
export const setLastBbox = (v: BBox | null) => setShipState("lastBbox", v);
export const selectShip = (v: string | null) => setShipState("selectedMmsi", v);
export const followShip = (v: string | null) => setShipState("followingMmsi", v);
export const unfollowShip = () => setShipState("followingMmsi", null);
export const getShipByMmsi = (mmsi: string) => shipState.ships.get(mmsi);

export function clearShips(): void {
  setShipState({
    ships: new Map(),
    selectedMmsi: null,
    followingMmsi: null,
    isRateLimited: false,
    lastBbox: null,
    lastUpdated: null,
    isLoading: false,
    error: null,
    isConnected: false,
  });
}

export { shipState };
