/**
 * WorldView - Shared Configuration
 * 
 * All proxy URLs and shared constants are defined here.
 * NEVER hardcode proxy URLs elsewhere in the codebase.
 */

/** Base URL for the proxy server */
export const PROXY_BASE_URL = "http://localhost:3001";

/** Proxy endpoint URLs - use these instead of hardcoding paths */
export const PROXY_ENDPOINTS = {
  /** Health check endpoint */
  health: `${PROXY_BASE_URL}/health`,
  
  /** TLE satellite data endpoint */
  tle: (group: string) => `${PROXY_BASE_URL}/tle?group=${encodeURIComponent(group)}`,
  
  /** Ship tracking endpoint with bounding box */
  ships: ({ minLat, maxLat, minLon, maxLon }: { minLat: number; maxLat: number; minLon: number; maxLon: number }) =>
    `${PROXY_BASE_URL}/ships?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`,

  /** Plane tracking endpoint with bounding box */
  planes: ({ minLat, maxLat, minLon, maxLon }: { minLat: number; maxLat: number; minLon: number; maxLon: number }) =>
    `${PROXY_BASE_URL}/planes?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`,

  /** Plane search by callsign */
  planesSearch: (callsign: string) =>
    `${PROXY_BASE_URL}/planes/search?callsign=${encodeURIComponent(callsign)}`,
  
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
export const LOCAL_ASSETS = {} as const;
