// Airport database - loaded dynamically
let airports: Record<string, { name: string; lat: number; lng: number }> = {};
let airportsLoaded = false;

// Load airports database
async function loadAirports(): Promise<void> {
  if (airportsLoaded) return;
  try {
    const response = await fetch('/src/data/airports.json');
    airports = await response.json();
    airportsLoaded = true;
  } catch (e) {
    console.error('Failed to load airports database:', e);
  }
}

// Initialize airports on module load
loadAirports();

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
  const airport = airports[upperCode];

  if (airport) {
    return {
      lat: airport.lat,
      lng: airport.lng,
      name: airport.name,
    };
  }

  return null;
}

/**
 * Map Google Geocoding API types to our GeoResult types
 */
function mapGoogleTypeToGeoType(types: string[]): GeoResult["type"] {
  for (const type of types) {
    switch (type) {
      case "country":
        return "country";
      case "administrative_area_level_1":
        return "region";
      case "locality":
      case "postal_code":
      case "sublocality":
        return "city";
      case "street_address":
      case "route":
      case "premise":
        return "address";
      case "point_of_interest":
      case "establishment":
        return "poi";
    }
  }
  // Default fallback
  return "city";
}

/**
 * Return camera altitude in meters based on location type
 */
export function getAltitudeForType(type: GeoResult["type"]): number {
  switch (type) {
    case "country":
    case "region":
      return 500_000; // 500 km
    case "city":
      return 50_000; // 50 km
    case "address":
    case "poi":
      return 1_000; // 1 km
    case "coords":
      return 10_000; // 10 km
    case "airport":
      return 5_000; // 5 km
    default:
      return 50_000; // Default to city altitude
  }
}

/**
 * Full geocoding flow:
 * 1. Try parseCoordinates() first (instant, no API call)
 * 2. Try lookupAirport() for 3-letter codes (instant, no API call)
 * 3. Fall back to Google Geocoding API via proxy
 */
export async function geocode(query: string): Promise<GeoResult | null> {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  // 1. Try parseCoordinates first (instant, no API call)
  const coords = parseCoordinates(trimmed);
  if (coords) {
    return {
      lat: coords.lat,
      lng: coords.lng,
      name: trimmed,
      type: "coords",
    };
  }

  // 2. Check if query is 3 letters (airport code)
  if (/^[a-zA-Z]{3}$/.test(trimmed)) {
    const airport = lookupAirport(trimmed);
    if (airport) {
      return {
        lat: airport.lat,
        lng: airport.lng,
        name: airport.name,
        type: "airport",
      };
    }
  }

  // 3. Fall back to Google Geocoding API via proxy
  try {
    const encodedQuery = encodeURIComponent(trimmed);
    const response = await fetch(
      `http://localhost:3001/geocode?address=${encodedQuery}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Check for valid response with results
    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    const location = result.geometry?.location;

    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return null;
    }

    const geoType = mapGoogleTypeToGeoType(result.types || []);

    return {
      lat: location.lat,
      lng: location.lng,
      name: result.formatted_address || trimmed,
      type: geoType,
    };
  } catch {
    // Network error or other failure - return null
    return null;
  }
}
