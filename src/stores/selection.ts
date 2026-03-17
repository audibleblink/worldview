/**
 * WorldView - Selection Store
 * Manages entity selection state with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

export type EntityType = "satellite" | "flight" | "ship";

/** Satellite data (from TLE/SGP4) */
export interface SatelliteData {
  noradId: string;
  name: string;
  category: string;
  position: { lat: number; lng: number; alt: number };
  velocity?: { x: number; y: number; z: number };
  tle?: { line1: string; line2: string };
}

/** Flight data (from OpenSky) */
export interface FlightData {
  icao24: string;
  callsign: string;
  originCountry: string;
  position: { lat: number; lng: number; alt: number };
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
}

/** Ship data (from AIS) */
export interface ShipData {
  mmsi: string;
  name: string;
  shipType: number;
  position: { lat: number; lng: number };
  heading: number;
  speed: number;
  destination?: string;
  eta?: string;
}

export type EntityData = SatelliteData | FlightData | ShipData;

export interface SelectionState {
  type: EntityType | null;
  id: string | null;
  data: EntityData | null;
}

const EMPTY: SelectionState = { type: null, id: null, data: null };

const [selection, setSelection] = createStore<SelectionState>({ ...EMPTY });

// --- Mutations (named for future event-sourcing) ---

/** Select an entity by type and id; data can be populated later or passed directly */
export function selectEntity(type: EntityType, id: string, data?: EntityData): void {
  setSelection({ type, id, data: data ?? null });
}

/** Update the data for the currently selected entity */
export function setSelectionData(data: EntityData): void {
  setSelection("data", data);
}

/** Clear the current selection */
export function clearSelection(): void {
  setSelection({ ...EMPTY });
}

export { selection };
