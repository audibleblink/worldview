/**
 * WorldView - Points of Interest Module
 * City and POI data with navigation functions
 */

import type { Viewer } from "cesium";

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

// City and POI data - will be populated in Phase 4
const cities: City[] = [];

// Current navigation state
let currentCityIndex = 0;
let currentPOIIndex = 0;

/**
 * Get all available cities
 */
export function getCities(): City[] {
  return cities;
}

/**
 * Get the current city
 */
export function getCurrentCity(): City | undefined {
  return cities[currentCityIndex];
}

/**
 * Set the current city by index
 */
export function setCurrentCity(index: number): void {
  if (index >= 0 && index < cities.length) {
    currentCityIndex = index;
    currentPOIIndex = 0;
  }
}

/**
 * Get the current POI
 */
export function getCurrentPOI(): POI | undefined {
  const city = getCurrentCity();
  return city?.pois[currentPOIIndex];
}

/**
 * Navigate to the next POI in the current city
 */
export function nextPOI(): void {
  const city = getCurrentCity();
  if (city && currentPOIIndex < city.pois.length - 1) {
    currentPOIIndex++;
  }
}

/**
 * Navigate to the previous POI in the current city
 */
export function prevPOI(): void {
  if (currentPOIIndex > 0) {
    currentPOIIndex--;
  }
}

/**
 * Fly the camera to a specific POI
 */
export function flyToPOI(_viewer: Viewer, _poi: POI): void {
  // Stub implementation - will be completed in Phase 4
  console.log("flyToPOI stub");
}
