/**
 * USGSFetcher - Earthquake data from USGS GeoJSON feed (60s polling)
 */

export interface EarthquakeFeature {
  properties: { mag: number; place: string; time: number; type: string };
  geometry: { coordinates: [number, number, number] };
  id: string;
}

export interface EarthquakeData {
  id: string;
  magnitude: number;
  place: string;
  time: Date;
  longitude: number;
  latitude: number;
  depth: number;
  isSimulated: boolean;
}

const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const POLL_INTERVAL_MS = 60_000;
const MAX_DISTANCE_KM = 500;
const EARTH_RADIUS_KM = 6371;

export class USGSFetcher {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastFetch: EarthquakeData[] = [];
  private onUpdate: ((earthquakes: EarthquakeData[]) => void) | null = null;
  private viewportCenter: { lat: number; lon: number } | null = null;

  startPolling(callback: (earthquakes: EarthquakeData[]) => void): void {
    this.onUpdate = callback;
    this.fetchAndNotify();
    this.pollInterval = setInterval(() => this.fetchAndNotify(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = null;
  }

  setViewportCenter(lat: number, lon: number): void {
    this.viewportCenter = { lat, lon };
  }

  async fetch(): Promise<EarthquakeData[]> {
    try {
      const response = await fetch(USGS_FEED_URL);
      if (!response.ok) return this.lastFetch;

      const geojson = await response.json();
      this.lastFetch = (geojson.features ?? [])
        .filter((f: EarthquakeFeature) => f.properties.type === "earthquake")
        .map((f: EarthquakeFeature) => this.parseFeature(f))
        .filter(Boolean) as EarthquakeData[];

      return this.lastFetch;
    } catch {
      return this.lastFetch;
    }
  }

  async fetchNearViewport(): Promise<EarthquakeData[]> {
    const all = await this.fetch();
    return this.filterByDistance(all);
  }

  getCachedNearViewport(): EarthquakeData[] {
    return this.filterByDistance(this.lastFetch);
  }

  private filterByDistance(earthquakes: EarthquakeData[]): EarthquakeData[] {
    if (!this.viewportCenter) return earthquakes;
    const { lat, lon } = this.viewportCenter;
    return earthquakes.filter((eq) => this.haversineDistance(lat, lon, eq.latitude, eq.longitude) <= MAX_DISTANCE_KM);
  }

  private parseFeature(feature: EarthquakeFeature): EarthquakeData | null {
    const { properties, geometry, id } = feature;
    if (!geometry?.coordinates) return null;
    const [lon, lat, depth] = geometry.coordinates;
    return {
      id,
      magnitude: properties.mag ?? 0,
      place: properties.place ?? "Unknown",
      time: new Date(properties.time),
      longitude: lon,
      latitude: lat,
      depth: depth ?? 0,
      isSimulated: false,
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async fetchAndNotify(): Promise<void> {
    this.onUpdate?.(await this.fetchNearViewport());
  }

  destroy(): void {
    this.stopPolling();
    this.lastFetch = [];
    this.onUpdate = null;
    this.viewportCenter = null;
  }
}
