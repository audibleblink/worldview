/**
 * Aircraft Type Lookup
 * 
 * Maps ICAO24 hex codes to aircraft type descriptions.
 * This is a minimal implementation - full database is very large.
 * 
 * In practice, you would:
 * 1. Download OpenSky aircraft database CSV
 * 2. Process into a compact binary format or indexed DB
 * 3. Load on demand with caching
 */

// Common ICAO24 prefixes by country (first 3 hex digits)
// This allows basic identification without full database
const COUNTRY_PREFIXES: Record<string, string> = {
  "A": "United States",
  "4": "United States", // 4xx
  "C": "Canada",
  "E": "Spain/France",
  "F": "France",
  "G": "United Kingdom",
  "3": "Mexico",
  "7": "Russia",
  "8": "Japan",
};

// Airline codes from callsign prefixes (3 letters)
const AIRLINE_CODES: Record<string, string> = {
  "UAL": "United Airlines",
  "AAL": "American Airlines",
  "DAL": "Delta Air Lines",
  "SWA": "Southwest Airlines",
  "JBU": "JetBlue Airways",
  "ASA": "Alaska Airlines",
  "FFT": "Frontier Airlines",
  "NKS": "Spirit Airlines",
  "BAW": "British Airways",
  "DLH": "Lufthansa",
  "AFR": "Air France",
  "KLM": "KLM",
  "UAE": "Emirates",
  "QTR": "Qatar Airways",
  "SIA": "Singapore Airlines",
  "CPA": "Cathay Pacific",
  "ANA": "All Nippon Airways",
  "JAL": "Japan Airlines",
  "QFA": "Qantas",
  "ANZ": "Air New Zealand",
  "ACA": "Air Canada",
  "RYR": "Ryanair",
  "EZY": "easyJet",
  "VIR": "Virgin Atlantic",
  "FDX": "FedEx",
  "UPS": "UPS",
};

/**
 * Get aircraft type from ICAO24 hex code.
 * Returns "Unknown" if not in database.
 */
export function getAircraftType(_icao24: string): string {
  // Full implementation would look up in database
  // For MVP, return Unknown
  return "Unknown";
}

/**
 * Get airline name from callsign.
 * Callsigns typically start with 3-letter ICAO airline code.
 */
export function getAirlineFromCallsign(callsign: string): string | null {
  if (!callsign || callsign.length < 3) return null;
  
  const prefix = callsign.substring(0, 3).toUpperCase();
  return AIRLINE_CODES[prefix] ?? null;
}

/**
 * Get country from ICAO24 prefix.
 */
export function getCountryFromIcao24(icao24: string): string | null {
  if (!icao24) return null;
  
  const firstChar = icao24.charAt(0).toUpperCase();
  return COUNTRY_PREFIXES[firstChar] ?? null;
}

/**
 * Format altitude for display.
 * Above 18,000ft, use flight level notation.
 */
export function formatAltitude(metersAltitude: number): string {
  const feet = Math.round(metersAltitude * 3.28084);
  
  if (feet >= 18000) {
    // Flight level is hundreds of feet
    const fl = Math.round(feet / 100);
    return `FL${fl}`;
  }
  
  return `${feet.toLocaleString()} ft`;
}

/**
 * Format velocity for display (m/s to knots).
 */
export function formatSpeed(metersPerSecond: number): string {
  const knots = Math.round(metersPerSecond * 1.94384);
  return `${knots} kts`;
}

/**
 * Format vertical rate for display (m/s to ft/min).
 */
export function formatVerticalRate(metersPerSecond: number): string {
  const fpm = Math.round(metersPerSecond * 196.85);
  if (fpm > 0) return `+${fpm.toLocaleString()} ft/min`;
  if (fpm < 0) return `${fpm.toLocaleString()} ft/min`;
  return "Level";
}

/**
 * Format heading with cardinal direction.
 */
export function formatHeading(degrees: number): string {
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % 8;
  return `${Math.round(degrees)}° ${cardinals[index]}`;
}
