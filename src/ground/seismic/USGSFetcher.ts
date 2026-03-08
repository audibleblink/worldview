/**
 * USGSFetcher - Fetches earthquake data from USGS GeoJSON feed
 * Polls every 60 seconds for real-time seismic activity
 */

/** USGS GeoJSON earthquake feature structure */
export interface EarthquakeFeature {
  properties: {
    mag: number;        // Magnitude
    place: string;      // Location description
    time: number;       // Unix timestamp (ms)
    type: string;       // "earthquake"
    url: string;        // USGS event page
    felt: number | null; // Number of felt reports
    tsunami: number;    // Tsunami warning (0 or 1)
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  id: string;           // USGS event ID
}

/** Parsed earthquake data for visualization */
export interface EarthquakeData {
  id: string;
  magnitude: number;
  place: string;
  time: Date;
  longitude: number;
  latitude: number;
  depth: number;        // Depth in km
  isSimulated: boolean; // True for demo/synthetic quakes
}

/** Bounding box for viewport filtering */
export interface ViewportBBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** USGS GeoJSON feed URL for last 24 hours, all magnitudes */
const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

/** Polling interval in milliseconds (60 seconds) */
const POLL_INTERVAL_MS = 60_000;

/** Maximum distance from viewport center to include earthquake (km) */
const MAX_DISTANCE_KM = 500;

/** Earth radius in km for distance calculations */
const EARTH_RADIUS_KM = 6371;

export class USGSFetcher {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastFetch: EarthquakeData[] = [];
  private onUpdate: ((earthquakes: EarthquakeData[]) => void) | null = null;
  private viewportCenter: { lat: number; lon: number } | null = null;

  /** Start polling USGS feed */
  startPolling(callback: (earthquakes: EarthquakeData[]) => void): void {
    this.onUpdate = callback;
    
    // Immediate first fetch
    this.fetchAndNotify();
    
    // Set up polling
    this.pollInterval = setInterval(() => {
      this.fetchAndNotify();
    }, POLL_INTERVAL_MS);
    
    console.log("[USGSFetcher] Started polling (60s interval)");
  }

  /** Stop polling */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log("[USGSFetcher] Stopped polling");
  }

  /** Update viewport center for filtering */
  setViewportCenter(lat: number, lon: number): void {
    this.viewportCenter = { lat, lon };
  }

  /** Fetch earthquakes (can be called directly) */
  async fetch(): Promise<EarthquakeData[]> {
    try {
      const response = await fetch(USGS_FEED_URL);
      
      if (!response.ok) {
        console.error(`[USGSFetcher] USGS API error: ${response.status}`);
        return this.lastFetch;
      }

      const geojson = await response.json();
      const features: EarthquakeFeature[] = geojson.features ?? [];
      
      // Parse and filter earthquakes
      const earthquakes = features
        .filter((f) => f.properties.type === "earthquake")
        .map((f) => this.parseFeature(f))
        .filter((eq): eq is EarthquakeData => eq !== null);
      
      this.lastFetch = earthquakes;
      console.log(`[USGSFetcher] Fetched ${earthquakes.length} earthquakes`);
      
      return earthquakes;
    } catch (error) {
      console.error("[USGSFetcher] Fetch error:", error);
      return this.lastFetch;
    }
  }

  /** Fetch earthquakes near the current viewport */
  async fetchNearViewport(): Promise<EarthquakeData[]> {
    const all = await this.fetch();
    
    if (!this.viewportCenter) {
      return all;
    }
    
    return all.filter((eq) => {
      const distance = this.haversineDistance(
        this.viewportCenter!.lat,
        this.viewportCenter!.lon,
        eq.latitude,
        eq.longitude
      );
      return distance <= MAX_DISTANCE_KM;
    });
  }

  /** Get cached earthquakes from last fetch */
  getCached(): EarthquakeData[] {
    return this.lastFetch;
  }

  /** Get earthquakes near viewport from cache */
  getCachedNearViewport(): EarthquakeData[] {
    if (!this.viewportCenter) {
      return this.lastFetch;
    }
    
    return this.lastFetch.filter((eq) => {
      const distance = this.haversineDistance(
        this.viewportCenter!.lat,
        this.viewportCenter!.lon,
        eq.latitude,
        eq.longitude
      );
      return distance <= MAX_DISTANCE_KM;
    });
  }

  /** Parse a GeoJSON feature into EarthquakeData */
  private parseFeature(feature: EarthquakeFeature): EarthquakeData | null {
    const { properties, geometry, id } = feature;
    
    if (!properties || !geometry || !geometry.coordinates) {
      return null;
    }

    const [lon, lat, depth] = geometry.coordinates;

    return {
      id,
      magnitude: properties.mag ?? 0,
      place: properties.place ?? "Unknown location",
      time: new Date(properties.time),
      longitude: lon,
      latitude: lat,
      depth: depth ?? 0,
      isSimulated: false,
    };
  }

  /** Calculate Haversine distance between two points in km */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return EARTH_RADIUS_KM * c;
  }

  /** Fetch and notify listener */
  private async fetchAndNotify(): Promise<void> {
    const earthquakes = await this.fetchNearViewport();
    this.onUpdate?.(earthquakes);
  }

  /** Destroy and clean up */
  destroy(): void {
    this.stopPolling();
    this.lastFetch = [];
    this.onUpdate = null;
    this.viewportCenter = null;
    console.log("[USGSFetcher] Destroyed");
  }
}
