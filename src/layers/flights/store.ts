/**
 * WorldView - Flight Layer Store
 *
 * Flight-specific reactive store for managing flight data,
 * selection, and follow mode state.
 */

import { createStore } from "solid-js/store";

/**
 * Flight record from OpenSky Network
 */
export interface FlightRecord {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  lastUpdate: number;
}

/**
 * Aircraft metadata from database
 */
export interface FlightMetadata {
  typecode: string;
  model: string;
  registration: string;
}

/**
 * Flight store state
 */
export interface FlightState {
  /** Map of icao24 -> FlightRecord */
  flights: Map<string, FlightRecord>;
  /** Currently selected flight icao24 */
  selectedIcao24: string | null;
  /** Currently followed flight icao24 */
  followingIcao24: string | null;
  /** Timestamp of last successful data update */
  lastUpdated: number | null;
  /** Total count of flights from last fetch (before filtering) */
  totalCount: number;
}

// Initial state
const initialState: FlightState = {
  flights: new Map(),
  selectedIcao24: null,
  followingIcao24: null,
  lastUpdated: null,
  totalCount: 0,
};

// Create the store
const [flightState, setFlightState] = createStore<FlightState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Set all flight records from API response
 * @param records - Array of flight records to set
 * @param totalCount - Total count before filtering
 */
export function setFlights(records: FlightRecord[], totalCount: number): void {
  const newMap = new Map<string, FlightRecord>();
  for (const record of records) {
    newMap.set(record.icao24, record);
  }
  setFlightState({
    flights: newMap,
    lastUpdated: Date.now(),
    totalCount,
  });
}

/**
 * Update a single flight record (for interpolation updates)
 */
export function updateFlight(icao24: string, updates: Partial<FlightRecord>): void {
  const existing = flightState.flights.get(icao24);
  if (existing) {
    const newFlights = new Map(flightState.flights);
    newFlights.set(icao24, { ...existing, ...updates });
    setFlightState("flights", newFlights);
  }
}

/**
 * Select a flight by icao24
 */
export function selectFlight(icao24: string | null): void {
  setFlightState("selectedIcao24", icao24);
}

/**
 * Start following a flight
 */
export function followFlight(icao24: string): void {
  setFlightState("followingIcao24", icao24);
}

/**
 * Stop following current flight
 */
export function unfollowFlight(): void {
  setFlightState("followingIcao24", null);
}

/**
 * Clear all flight data (for layer unmount)
 */
export function clearFlights(): void {
  setFlightState({
    flights: new Map(),
    selectedIcao24: null,
    followingIcao24: null,
    lastUpdated: null,
    totalCount: 0,
  });
}

/**
 * Get a flight record by icao24
 */
export function getFlight(icao24: string): FlightRecord | undefined {
  return flightState.flights.get(icao24);
}

/**
 * Check if a flight exists
 */
export function hasFlight(icao24: string): boolean {
  return flightState.flights.has(icao24);
}

/**
 * Get all flight records as array
 */
export function getAllFlights(): FlightRecord[] {
  return Array.from(flightState.flights.values());
}

// Export readonly state
export { flightState };
