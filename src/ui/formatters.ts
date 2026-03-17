/**
 * WorldView - Shared UI Formatters
 * Coordinate, altitude, speed, and heading formatting used across panels.
 */

/** Format latitude with N/S indicator */
export function formatLatitude(lat: number): string {
  const dir = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(4)}° ${dir}`;
}

/** Format longitude with E/W indicator */
export function formatLongitude(lng: number): string {
  const dir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lng).toFixed(4)}° ${dir}`;
}

/** Format lat/lng as a compact coordinate string (e.g. "30.2672°N 97.7431°W") */
export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/** Format altitude with appropriate precision (m or km) */
export function formatAltitude(altitude: number): string {
  if (altitude >= 1_000_000) return `${(altitude / 1000).toFixed(0)}km`;
  if (altitude >= 1000) return `${Math.round(altitude)}m`;
  return `${altitude.toFixed(1)}m`;
}

/** Format altitude in feet (for aviation) */
export function formatAltitudeFeet(altitudeM: number): string {
  const feet = Math.round(altitudeM * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

/** Format distance with appropriate unit (cm, m, km) */
export function formatDistance(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  if (value >= 1) return `${value.toFixed(1)}m`;
  return `${(value * 100).toFixed(1)}cm`;
}

/** Format speed in knots (from m/s) */
export function formatSpeedKnots(velocityMS: number): string {
  const knots = Math.round(velocityMS * 1.94384);
  return `${knots} kts`;
}

/** Format speed in knots (from knots) */
export function formatSpeedKn(speed: number): string {
  return `${speed.toFixed(1)} kn`;
}

/** Format heading in degrees */
export function formatHeading(heading: number, naValue = 511): string {
  if (heading === naValue) return "N/A";
  return `${Math.round(heading)}°`;
}
