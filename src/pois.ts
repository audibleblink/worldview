/**
 * WorldView - Points of Interest Module
 * City and POI data with navigation functions
 */

import { flyToTarget } from "./camera.ts";

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");
type Viewer = import("cesium").Viewer;

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

// City data loaded from JSON
let cities: City[] = [];
let citiesLoaded = false;

/** Load cities from JSON file */
async function loadCities(): Promise<void> {
  if (citiesLoaded) return;
  try {
    const response = await fetch("/src/data/pois.json");
    if (response.ok) {
      cities = await response.json();
      citiesLoaded = true;
    }
  } catch (error) {
    console.error("Failed to load POI data:", error);
  }
}

// Initialize on module load
loadCities();

// Current navigation state
let currentCityIndex = 0;
let currentPOIIndex = 0;

// Viewer reference for internal navigation functions
let viewerRef: Viewer | null = null;

/**
 * Set the viewer reference for navigation functions
 */
export function setViewer(viewer: Viewer): void {
  viewerRef = viewer;
}

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

/** Navigate to the current POI if viewer is available */
function navigateToCurrent(): void {
  const poi = getCurrentPOI();
  if (poi && viewerRef) flyToPOI(viewerRef, poi);
}

/**
 * Set the current city by index and fly to its first POI
 */
export function setCurrentCity(cityIndex: number): void {
  if (cityIndex < 0 || cityIndex >= cities.length) return;
  currentCityIndex = cityIndex;
  currentPOIIndex = 0;
  navigateToCurrent();
}

/**
 * Get the current POI
 */
export function getCurrentPOI(): POI | undefined {
  return cities[currentCityIndex]?.pois[currentPOIIndex];
}

/**
 * Get the current POI index
 */
export function getCurrentPOIIndex(): number {
  return currentPOIIndex;
}

/**
 * Navigate to the next POI in the current city
 */
export function nextPOI(): void {
  const city = getCurrentCity();
  if (city && currentPOIIndex < city.pois.length - 1) {
    currentPOIIndex++;
    navigateToCurrent();
  }
}

/**
 * Navigate to the previous POI in the current city
 */
export function prevPOI(): void {
  if (currentPOIIndex > 0) {
    currentPOIIndex--;
    navigateToCurrent();
  }
}

/**
 * Fly to a specific POI by index within current city
 */
export function flyToPOIByIndex(index: number): void {
  const city = getCurrentCity();
  if (city && index >= 0 && index < city.pois.length) {
    currentPOIIndex = index;
    navigateToCurrent();
  }
}

/**
 * Fly the camera to view a specific POI with 2s animation.
 * Camera is positioned at the specified range, looking AT the POI.
 */
export function flyToPOI(viewer: Viewer, poi: POI): void {
  const target = Cesium.Cartesian3.fromDegrees(poi.lng, poi.lat, 0);

  flyToTarget(viewer, target, {
    pitch: Cesium.Math.toRadians(poi.pitch),
    range: poi.altitude,
    duration: 2,
  });
}
