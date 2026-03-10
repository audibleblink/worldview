/**
 * WorldView - UI Store
 * Manages UI panel state and interactions with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

/**
 * City data structure (from pois.json)
 */
export interface POI {
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  pitch: number;
}

export interface City {
  name: string;
  pois: POI[];
}

/**
 * UI state structure
 */
export interface UIState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  commandMode: boolean;
  currentCity: City | null;
  currentCityIndex: number;
  currentPOIIndex: number;
}

// Initial state
const initialState: UIState = {
  leftPanelOpen: true,
  rightPanelOpen: true,
  commandMode: false,
  currentCity: null,
  currentCityIndex: 0,
  currentPOIIndex: 0,
};

// Create the store
const [ui, setUI] = createStore<UIState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Toggle the left panel visibility
 */
export function toggleLeftPanel(): void {
  setUI("leftPanelOpen", (prev) => !prev);
}

/**
 * Toggle the right panel visibility
 */
export function toggleRightPanel(): void {
  setUI("rightPanelOpen", (prev) => !prev);
}

/**
 * Set the left panel visibility
 */
export function setLeftPanelOpen(open: boolean): void {
  setUI("leftPanelOpen", open);
}

/**
 * Set the right panel visibility
 */
export function setRightPanelOpen(open: boolean): void {
  setUI("rightPanelOpen", open);
}

/**
 * Enable or disable command mode (vim-style command bar)
 */
export function setCommandMode(enabled: boolean): void {
  setUI("commandMode", enabled);
}

/**
 * Toggle command mode
 */
export function toggleCommandMode(): void {
  setUI("commandMode", (prev) => !prev);
}

/**
 * Set the current city (for POI navigation)
 */
export function setCurrentCity(city: City | null): void {
  setUI("currentCity", city);
}

/**
 * Set the current city index (shared between BottomBar and LeftPanel)
 */
export function setCurrentCityIndex(index: number): void {
  setUI("currentCityIndex", index);
}

/**
 * Set the current POI index (shared between BottomBar and LeftPanel)
 */
export function setCurrentPOIIndex(index: number): void {
  setUI("currentPOIIndex", index);
}

// Export readonly state
export { ui };
