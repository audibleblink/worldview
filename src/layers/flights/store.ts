/**
 * Flight Store - Reactive state for flight visualization
 */

import { createStore } from "solid-js/store";

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

export interface FlightState {
  flights: Map<string, FlightRecord>;
  selectedIcao24: string | null;
  followingIcao24: string | null;
  lastUpdated: number | null;
  totalCount: number;
}

const [flightState, setFlightState] = createStore<FlightState>({
  flights: new Map(),
  selectedIcao24: null,
  followingIcao24: null,
  lastUpdated: null,
  totalCount: 0,
});

export function setFlights(records: FlightRecord[], totalCount: number): void {
  const flights = new Map(records.map((r) => [r.icao24, r]));
  setFlightState({ flights, lastUpdated: Date.now(), totalCount });
}

export function selectFlight(icao24: string | null): void {
  setFlightState("selectedIcao24", icao24);
}

export function followFlight(icao24: string): void {
  setFlightState("followingIcao24", icao24);
}

export function unfollowFlight(): void {
  setFlightState("followingIcao24", null);
}

export function clearFlights(): void {
  setFlightState({
    flights: new Map(),
    selectedIcao24: null,
    followingIcao24: null,
    lastUpdated: null,
    totalCount: 0,
  });
}

export { flightState };
