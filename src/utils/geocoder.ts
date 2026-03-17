/**
 * Geocoding utilities for coordinate parsing and airport lookup
 */

import airports from "../data/airports.json";
import { PROXY_ENDPOINTS } from "../config";

// Coordinate parsing patterns
const DECIMAL_WITH_COMMA = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
const DECIMAL_WITH_DIRECTION = /^(\d+\.?\d*)\s*([NS])\s*,?\s*(\d+\.?\d*)\s*([EW])$/i;
const SIGNED_DECIMAL_NO_COMMA = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;

/** Return {lat, lng} if both values are valid WGS84 coordinates, else null */
function validCoords(lat: number, lng: number): { lat: number; lng: number } | null {
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Parse coordinate string in various formats
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  let match = trimmed.match(DECIMAL_WITH_COMMA);
  if (match?.[1] && match[2]) {
    return validCoords(parseFloat(match[1]), parseFloat(match[2]));
  }

  match = trimmed.match(DECIMAL_WITH_DIRECTION);
  if (match?.[1] && match[2] && match[3] && match[4]) {
    const lat = parseFloat(match[1]) * (match[2].toUpperCase() === "S" ? -1 : 1);
    const lng = parseFloat(match[3]) * (match[4].toUpperCase() === "W" ? -1 : 1);
    return validCoords(lat, lng);
  }

  match = trimmed.match(SIGNED_DECIMAL_NO_COMMA);
  if (match?.[1] && match[2]) {
    return validCoords(parseFloat(match[1]), parseFloat(match[2]));
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

/** Geocode result type */
export interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  type: "country" | "region" | "city" | "address" | "poi" | "coords" | "airport" | "unknown";
}

/** Google geocode type → simplified type mapping */
const GOOGLE_TYPE_MAP: Record<string, GeoResult["type"]> = {
  country: "country",
  administrative_area_level_1: "region",
  locality: "city",
  postal_code: "city",
  sublocality: "city",
  street_address: "address",
  route: "address",
  premise: "address",
  point_of_interest: "poi",
  establishment: "poi",
};

/** Map Google geocode types to our simplified types */
function mapGoogleTypeToGeoType(types: string[]): GeoResult["type"] {
  for (const type of types) {
    const mapped = GOOGLE_TYPE_MAP[type];
    if (mapped) return mapped;
  }
  return "unknown";
}

/** Camera altitude (meters) by geo result type */
const ALTITUDE_BY_TYPE: Record<GeoResult["type"], number> = {
  country: 2_000_000,
  region: 500_000,
  city: 50_000,
  coords: 10_000,
  airport: 5_000,
  address: 1_000,
  poi: 500,
  unknown: 10_000,
};

/** Get appropriate camera altitude (meters) for a geo result type */
export function getAltitudeForType(type: GeoResult["type"]): number {
  return ALTITUDE_BY_TYPE[type];
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
