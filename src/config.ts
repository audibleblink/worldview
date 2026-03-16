/**
 * WorldView - Shared Configuration
 * 
 * All proxy URLs and shared constants are defined here.
 * NEVER hardcode proxy URLs elsewhere in the codebase.
 */

/**
 * Base URL for the proxy server.
 * Reads from PROXY_BASE_URL environment variable, defaults to localhost:3001.
 */
export const PROXY_BASE_URL = 
  typeof process !== "undefined" && process.env?.PROXY_BASE_URL
    ? process.env.PROXY_BASE_URL
    : "http://localhost:3001";

/**
 * Development server port
 */
export const DEV_SERVER_PORT = 3000;

/**
 * Proxy server port
 */
export const PROXY_SERVER_PORT = 3001;

/**
 * Proxy endpoint URLs - use these instead of hardcoding paths
 */
export const PROXY_ENDPOINTS = {
  /** Health check endpoint */
  health: `${PROXY_BASE_URL}/health`,
  
  /** TLE satellite data endpoint */
  tle: (group: string) => `${PROXY_BASE_URL}/tle?group=${encodeURIComponent(group)}`,
  
  /** OpenSky flight states endpoint */
  flights: `${PROXY_BASE_URL}/flights`,
  
  /** FlightAware route lookup */
  flightRoute: (callsign: string) => `${PROXY_BASE_URL}/flight-route/${encodeURIComponent(callsign)}`,
  
  /** Aircraft metadata by ICAO24 hex */
  aircraftMeta: (icao24: string) => `${PROXY_BASE_URL}/aircraft-meta/${encodeURIComponent(icao24)}`,
  
  /** Ship tracking endpoint with bounding box */
  ships: (bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }) =>
    `${PROXY_BASE_URL}/ships?minLat=${bbox.minLat}&maxLat=${bbox.maxLat}&minLon=${bbox.minLon}&maxLon=${bbox.maxLon}`,
  
  /** CCTV camera list */
  cctvCameras: `${PROXY_BASE_URL}/api/cctv/cameras`,
  
  /** CCTV thumbnail by camera ID */
  cctvThumbnail: (id: string) => `${PROXY_BASE_URL}/api/cctv/thumbnail/${encodeURIComponent(id)}`,
  
  /** CCTV stream by camera ID */
  cctvStream: (id: string) => `${PROXY_BASE_URL}/api/cctv/stream/${encodeURIComponent(id)}`,

  /** CCTV signed HLS URL resolver (for token-gated streams) */
  cctvHlsUrl: (id: string) => `${PROXY_BASE_URL}/api/cctv/hls/${encodeURIComponent(id)}`,

  /** CCTV HLS relay — proxies manifest + segments server-side to avoid CORS */
  cctvHlsRelay: (id: string) => `${PROXY_BASE_URL}/api/cctv/hls-relay/${encodeURIComponent(id)}/playlist.m3u8`,
  
  /** OSM Overpass API proxy */
  osm: `${PROXY_BASE_URL}/api/osm`,
  
  /** Geocoding endpoint */
  geocode: (query: string) => `${PROXY_BASE_URL}/geocode?q=${encodeURIComponent(query)}`,
  
  /** Google 2D map tiles */
  mapTiles: (z: number, x: number, y: number, lyrs = "m") =>
    `${PROXY_BASE_URL}/map-tiles/${z}/${x}/${y}?lyrs=${lyrs}`,
} as const;

/**
 * Local asset paths - bundled assets that should NOT use remote URLs
 */
export const LOCAL_ASSETS = {
  /** 3D aircraft model for flight visualization */
  aircraftModel: "/models/aircraft.glb",
} as const;
