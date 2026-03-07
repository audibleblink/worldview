/**
 * WorldView - Points of Interest Module
 * City and POI data with navigation functions
 */

import * as Cesium from "cesium";
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

// City and POI data for 8 cities with 4 POIs each
const cities: City[] = [
  {
    name: "Austin, TX",
    pois: [
      { name: "Texas State Capitol", lat: 30.2747, lng: -97.7404, altitude: 500, pitch: -45 },
      { name: "Congress Ave Bridge", lat: 30.2615, lng: -97.7453, altitude: 500, pitch: -45 },
      { name: "UT Tower", lat: 30.2861, lng: -97.7394, altitude: 500, pitch: -45 },
      { name: "Sixth Street", lat: 30.2672, lng: -97.7431, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "San Francisco, CA",
    pois: [
      { name: "Golden Gate Bridge", lat: 37.8199, lng: -122.4783, altitude: 500, pitch: -45 },
      { name: "Salesforce Tower", lat: 37.7898, lng: -122.3969, altitude: 500, pitch: -45 },
      { name: "Alcatraz", lat: 37.8267, lng: -122.4230, altitude: 500, pitch: -45 },
      { name: "Bay Bridge", lat: 37.7983, lng: -122.3778, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "New York, NY",
    pois: [
      { name: "Empire State Building", lat: 40.7484, lng: -73.9857, altitude: 500, pitch: -45 },
      { name: "Brooklyn Bridge", lat: 40.7061, lng: -73.9969, altitude: 500, pitch: -45 },
      { name: "Statue of Liberty", lat: 40.6892, lng: -74.0445, altitude: 500, pitch: -45 },
      { name: "One World Trade Center", lat: 40.7127, lng: -74.0134, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "Tokyo, Japan",
    pois: [
      { name: "Tokyo Tower", lat: 35.6586, lng: 139.7454, altitude: 500, pitch: -45 },
      { name: "Shibuya Crossing", lat: 35.6595, lng: 139.7004, altitude: 500, pitch: -45 },
      { name: "Senso-ji Temple", lat: 35.7148, lng: 139.7967, altitude: 500, pitch: -45 },
      { name: "Tokyo Skytree", lat: 35.7101, lng: 139.8107, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "London, UK",
    pois: [
      { name: "Tower Bridge", lat: 51.5055, lng: -0.0754, altitude: 500, pitch: -45 },
      { name: "Big Ben", lat: 51.5007, lng: -0.1246, altitude: 500, pitch: -45 },
      { name: "Buckingham Palace", lat: 51.5014, lng: -0.1419, altitude: 500, pitch: -45 },
      { name: "The Shard", lat: 51.5045, lng: -0.0865, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "Paris, France",
    pois: [
      { name: "Eiffel Tower", lat: 48.8584, lng: 2.2945, altitude: 500, pitch: -45 },
      { name: "Arc de Triomphe", lat: 48.8738, lng: 2.2950, altitude: 500, pitch: -45 },
      { name: "Notre-Dame", lat: 48.8530, lng: 2.3499, altitude: 500, pitch: -45 },
      { name: "Louvre", lat: 48.8606, lng: 2.3376, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "Dubai, UAE",
    pois: [
      { name: "Burj Khalifa", lat: 25.1972, lng: 55.2744, altitude: 500, pitch: -45 },
      { name: "Palm Jumeirah", lat: 25.1124, lng: 55.1390, altitude: 500, pitch: -45 },
      { name: "Dubai Frame", lat: 25.2350, lng: 55.3000, altitude: 500, pitch: -45 },
      { name: "Burj Al Arab", lat: 25.1412, lng: 55.1854, altitude: 500, pitch: -45 },
    ],
  },
  {
    name: "Washington, DC",
    pois: [
      { name: "US Capitol", lat: 38.8899, lng: -77.0091, altitude: 500, pitch: -45 },
      { name: "Washington Monument", lat: 38.8895, lng: -77.0353, altitude: 500, pitch: -45 },
      { name: "Pentagon", lat: 38.8719, lng: -77.0563, altitude: 500, pitch: -45 },
      { name: "Lincoln Memorial", lat: 38.8893, lng: -77.0502, altitude: 500, pitch: -45 },
    ],
  },
];

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

/**
 * Set the current city by index and fly to its first POI
 */
export function setCurrentCity(cityIndex: number): void {
  if (cityIndex >= 0 && cityIndex < cities.length) {
    currentCityIndex = cityIndex;
    currentPOIIndex = 0;
    const poi = getCurrentPOI();
    if (poi && viewerRef) {
      flyToPOI(viewerRef, poi);
    }
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
    const poi = getCurrentPOI();
    if (poi && viewerRef) {
      flyToPOI(viewerRef, poi);
    }
  }
}

/**
 * Navigate to the previous POI in the current city
 */
export function prevPOI(): void {
  if (currentPOIIndex > 0) {
    currentPOIIndex--;
    const poi = getCurrentPOI();
    if (poi && viewerRef) {
      flyToPOI(viewerRef, poi);
    }
  }
}

/**
 * Fly to a specific POI by index within current city
 */
export function flyToPOIByIndex(index: number): void {
  const city = getCurrentCity();
  if (city && index >= 0 && index < city.pois.length) {
    currentPOIIndex = index;
    const poi = city.pois[index];
    if (poi && viewerRef) {
      flyToPOI(viewerRef, poi);
    }
  }
}

/**
 * Fly the camera to a specific POI with 2s animation
 * Camera arrives at ~500m altitude with ~45 degree pitch looking down
 */
export function flyToPOI(viewer: Viewer, poi: POI): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(poi.lng, poi.lat, poi.altitude),
    orientation: {
      heading: Cesium.Math.toRadians(0), // North
      pitch: Cesium.Math.toRadians(poi.pitch), // Looking down (negative value)
      roll: 0,
    },
    duration: 2, // 2 seconds animation
  });
}
