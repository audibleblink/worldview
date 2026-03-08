import airports from "./data/airports.json";

export interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  type: "country" | "region" | "city" | "address" | "poi" | "coords" | "airport";
}

// Regex patterns for coordinate parsing
// Decimal degrees: "30.2672, -97.7431" or "30.2672,-97.7431"
const DECIMAL_WITH_COMMA = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;

// Decimal with direction: "30.2672N, 97.7431W"
const DECIMAL_WITH_DIRECTION = /^(\d+\.?\d*)\s*([NS])\s*,?\s*(\d+\.?\d*)\s*([EW])$/i;

// Signed decimal no comma: "30.2672 -97.7431"
const SIGNED_DECIMAL_NO_COMMA = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;

/**
 * Parse coordinate strings - supports 3 formats:
 * 1. Decimal degrees: "30.2672, -97.7431" or "30.2672,-97.7431"
 * 2. Decimal with direction: "30.2672N, 97.7431W"
 * 3. Signed decimal no comma: "30.2672 -97.7431"
 */
export function parseCoordinates(
  input: string
): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  // Try decimal with comma first: "30.2672, -97.7431"
  let match = trimmed.match(DECIMAL_WITH_COMMA);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat, lng };
    }
  }

  // Try decimal with direction: "30.2672N, 97.7431W"
  match = trimmed.match(DECIMAL_WITH_DIRECTION);
  if (match) {
    let lat = parseFloat(match[1]);
    let lng = parseFloat(match[3]);

    // Apply direction signs
    if (match[2].toUpperCase() === "S") {
      lat = -lat;
    }
    if (match[4].toUpperCase() === "W") {
      lng = -lng;
    }

    if (isValidLatLng(lat, lng)) {
      return { lat, lng };
    }
  }

  // Try signed decimal no comma: "30.2672 -97.7431"
  match = trimmed.match(SIGNED_DECIMAL_NO_COMMA);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Validate latitude and longitude values
 */
function isValidLatLng(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Lookup airport by 3-letter IATA code (case insensitive)
 */
export function lookupAirport(
  code: string
): { lat: number; lng: number; name: string } | null {
  const upperCode = code.trim().toUpperCase();

  // Check if the code exists in the airports database
  const airport = (airports as Record<string, { name: string; lat: number; lng: number }>)[upperCode];

  if (airport) {
    return {
      lat: airport.lat,
      lng: airport.lng,
      name: airport.name,
    };
  }

  return null;
}
