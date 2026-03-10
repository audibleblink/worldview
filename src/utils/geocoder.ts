/**
 * Geocoding utilities for coordinate parsing and airport lookup
 */

import airports from "../data/airports.json";
import { PROXY_ENDPOINTS } from "../config";

// Coordinate parsing patterns
const DECIMAL_WITH_COMMA = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
const DECIMAL_WITH_DIRECTION = /^(\d+\.?\d*)\s*([NS])\s*,?\s*(\d+\.?\d*)\s*([EW])$/i;
const SIGNED_DECIMAL_NO_COMMA = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;

/**
 * Parse coordinate string in various formats
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  let match = trimmed.match(DECIMAL_WITH_COMMA);
  if (match && match[1] && match[2]) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  match = trimmed.match(DECIMAL_WITH_DIRECTION);
  if (match && match[1] && match[2] && match[3] && match[4]) {
    let lat = parseFloat(match[1]);
    let lng = parseFloat(match[3]);
    if (match[2].toUpperCase() === "S") lat = -lat;
    if (match[4].toUpperCase() === "W") lng = -lng;
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  match = trimmed.match(SIGNED_DECIMAL_NO_COMMA);
  if (match && match[1] && match[2]) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Lookup airport by IATA/ICAO code
 */
export function lookupAirport(code: string): { lat: number; lng: number; name: string } | null {
  const upperCode = code.trim().toUpperCase();
  const airport = (airports as Record<string, { lat: number; lng: number; name: string }>)[upperCode];
  return airport ? { lat: airport.lat, lng: airport.lng, name: airport.name } : null;
}

/**
 * Geocode result type
 */
export interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  type: "country" | "region" | "city" | "address" | "poi" | "unknown";
}

/**
 * Map Google geocode types to our simplified types
 */
function mapGoogleTypeToGeoType(types: string[]): GeoResult["type"] {
  for (const type of types) {
    switch (type) {
      case "country": return "country";
      case "administrative_area_level_1": return "region";
      case "locality":
      case "postal_code":
      case "sublocality": return "city";
      case "street_address":
      case "route":
      case "premise": return "address";
      case "point_of_interest":
      case "establishment": return "poi";
    }
  }
  return "unknown";
}

/**
 * Get appropriate altitude for geo result type
 */
export function getAltitudeForType(type: GeoResult["type"]): number {
  switch (type) {
    case "country": return 2000000;
    case "region": return 500000;
    case "city": return 50000;
    case "address": return 1000;
    case "poi": return 500;
    default: return 10000;
  }
}

/**
 * Geocode an address using Google Geocoding API via proxy
 */
export async function geocode(address: string, signal?: AbortSignal): Promise<GeoResult | null> {
  try {
    const response = await fetch(PROXY_ENDPOINTS.geocode(address), { signal });
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results?.length) return null;
    
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    const name = result.formatted_address || address;
    const type = mapGoogleTypeToGeoType(result.types || []);
    
    return { lat, lng, name, type };
  } catch {
    return null;
  }
}
