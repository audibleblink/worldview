/**
 * Plane Layer - Type Definitions
 */

export interface PlaneRecord {
  icao24: string;        // Unique aircraft identifier (hex)
  callsign: string;      // Flight number (e.g., "UAL123")
  longitude: number;     // Decimal degrees
  latitude: number;      // Decimal degrees
  altitude: number;      // Meters (barometric altitude)
  velocity: number;      // m/s ground speed
  heading: number;       // Degrees true north (0-360)
  verticalRate: number;  // m/s (+up, -down)
  onGround: boolean;     // True if aircraft is on ground
  lastContact: number;   // Unix timestamp of last message
  timestamp: number;     // When we received this update (client time)
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// OpenSky state vector array indices
export const OPENSKY_INDICES = {
  ICAO24: 0,
  CALLSIGN: 1,
  ORIGIN_COUNTRY: 2,
  TIME_POSITION: 3,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,  // heading
  VERTICAL_RATE: 11,
  SENSORS: 12,
  GEO_ALTITUDE: 13,
  SQUAWK: 14,
  SPI: 15,
  POSITION_SOURCE: 16,
} as const;

// Polling intervals
export const PLANE_UPDATE_INTERVAL = 10_000;        // 10 seconds between polls
export const PLANE_RATE_LIMITED_INTERVAL = 15_000;  // 15 seconds when rate limited
export const PLANE_RATE_LIMIT_RECOVERY_MS = 60_000; // 60 seconds before resuming

// Trail management
export const MAX_TRAIL_POINTS = 60;  // ~10 minutes at 10s intervals

// Rendering
export const MAX_VISIBLE_PLANES = 100;
export const PLANE_FOLLOW_RANGE = 5_000;   // meters
export const PLANE_FOLLOW_PITCH = -30;     // degrees
export const PLANE_LABEL_VISIBLE_DISTANCE = 200_000; // meters
export const BILLBOARD_SCALE = 0.4;
export const BILLBOARD_SCALE_SELECTED = 0.6;
export const CAMERA_MOVE_DEBOUNCE_MS = 1500;
export const VIEWPORT_FALLBACK_DEGREES = 10;
