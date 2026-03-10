/**
 * WorldView - Ship Store
 *
 * Ship-specific reactive store for managing ship state.
 * Structured for future event-sourcing (mutations go through named functions).
 */

import { createStore } from "solid-js/store";

/** Ship type categories for icon selection */
export type ShipTypeCategory = "cargo" | "tanker" | "passenger" | "fishing" | "other";

/**
 * Ship record from AIS data
 */
export interface ShipRecord {
  mmsi: string;
  name: string;
  latitude: number;
  longitude: number;
  cog: number;        // Course over ground
  sog: number;        // Speed over ground (knots)
  trueHeading: number;
  shipType: number;
  shipTypeCategory: ShipTypeCategory;
  timestamp: number;
}

/**
 * Bounding box for viewport queries
 */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Ship store state
 */
export interface ShipState {
  /** All loaded ship records keyed by MMSI */
  ships: Map<string, ShipRecord>;
  /** MMSI of selected ship (null if none) */
  selectedMmsi: string | null;
  /** MMSI of ship being followed (null if not following) */
  followingMmsi: string | null;
  /** Whether we're currently rate limited */
  isRateLimited: boolean;
  /** Last queried bounding box */
  lastBbox: BBox | null;
  /** Timestamp of last update */
  lastUpdated: number | null;
  /** Whether ships are currently loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the AIS connection is established */
  isConnected: boolean;
}

// Initial state
const initialState: ShipState = {
  ships: new Map(),
  selectedMmsi: null,
  followingMmsi: null,
  isRateLimited: false,
  lastBbox: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
  isConnected: false,
};

// Create the store
const [shipState, setShipState] = createStore<ShipState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Set all ship records (replaces existing)
 */
export function setShips(records: ShipRecord[]): void {
  const shipMap = new Map<string, ShipRecord>();
  for (const record of records) {
    shipMap.set(record.mmsi, record);
  }
  setShipState({
    ships: shipMap,
    lastUpdated: Date.now(),
    isLoading: false,
    error: null,
  });
}

/**
 * Update ships - merges with existing, removes stale
 */
export function updateShips(records: ShipRecord[], currentMmsis: Set<string>): void {
  setShipState("ships", (prev) => {
    const next = new Map(prev);
    
    // Remove ships no longer in view
    for (const mmsi of prev.keys()) {
      if (!currentMmsis.has(mmsi)) {
        next.delete(mmsi);
      }
    }
    
    // Add/update ships
    for (const record of records) {
      next.set(record.mmsi, record);
    }
    
    return next;
  });
  setShipState("lastUpdated", Date.now());
}

/**
 * Set loading state
 */
export function setLoading(isLoading: boolean): void {
  setShipState("isLoading", isLoading);
}

/**
 * Set error state
 */
export function setError(error: string | null): void {
  setShipState({
    error,
    isLoading: false,
  });
}

/**
 * Set connection status
 */
export function setConnected(connected: boolean): void {
  setShipState("isConnected", connected);
}

/**
 * Set rate limited state
 */
export function setRateLimited(isRateLimited: boolean): void {
  setShipState("isRateLimited", isRateLimited);
}

/**
 * Set last queried bounding box
 */
export function setLastBbox(bbox: BBox | null): void {
  setShipState("lastBbox", bbox);
}

/**
 * Select a ship by MMSI
 */
export function selectShip(mmsi: string | null): void {
  setShipState("selectedMmsi", mmsi);
}

/**
 * Start following a ship
 */
export function followShip(mmsi: string | null): void {
  setShipState("followingMmsi", mmsi);
}

/**
 * Stop following ship
 */
export function unfollowShip(): void {
  setShipState("followingMmsi", null);
}

/**
 * Get a ship record by MMSI
 */
export function getShipByMmsi(mmsi: string): ShipRecord | undefined {
  return shipState.ships.get(mmsi);
}

/**
 * Get all ship records as array
 */
export function getShipsArray(): ShipRecord[] {
  return Array.from(shipState.ships.values());
}

/**
 * Get ship count
 */
export function getShipCount(): number {
  return shipState.ships.size;
}

/**
 * Clear all ship data
 */
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

// Export readonly state
export { shipState };
