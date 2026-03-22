/**
 * WorldView - UI Store
 * Manages UI panel state and interactions with reactive SolidJS store
 */
import { createStore } from "solid-js/store";

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

export interface UIState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  commandMode: boolean;
  currentCity: City | null;
  currentCityIndex: number;
  currentPOIIndex: number;
  myLocationActive: boolean;
}

const [ui, setUI] = createStore<UIState>({
  leftPanelOpen: true,
  rightPanelOpen: true,
  commandMode: false,
  currentCity: null,
  currentCityIndex: 0,
  currentPOIIndex: 0,
  myLocationActive: false,
});

// --- Mutations (named for future event-sourcing) ---

export function toggleLeftPanel(): void {
  setUI("leftPanelOpen", (prev) => !prev);
}

export function toggleRightPanel(): void {
  setUI("rightPanelOpen", (prev) => !prev);
}

export function setLeftPanelOpen(open: boolean): void {
  setUI("leftPanelOpen", open);
}

export function setRightPanelOpen(open: boolean): void {
  setUI("rightPanelOpen", open);
}

export function setCommandMode(enabled: boolean): void {
  setUI("commandMode", enabled);
}

export function toggleCommandMode(): void {
  setUI("commandMode", (prev) => !prev);
}

export function setCurrentCity(city: City | null): void {
  setUI("currentCity", city);
}

export function setCurrentCityIndex(index: number): void {
  setUI("currentCityIndex", index);
}

export function setCurrentPOIIndex(index: number): void {
  setUI("currentPOIIndex", index);
}

export function setMyLocationActive(active: boolean): void {
  setUI("myLocationActive", active);
}

export { ui };
