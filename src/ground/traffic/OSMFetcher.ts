/**
 * OSMFetcher - Fetch road data from OpenStreetMap Overpass API
 * Includes IndexedDB caching for offline support and rate limiting
 */

export interface BoundingBox {
  south: number; // min latitude
  west: number;  // min longitude  
  north: number; // max latitude
  east: number;  // max longitude
}

export interface RawOSMWay {
  id: number;
  tags: {
    highway?: string;
    oneway?: string;
    name?: string;
    maxspeed?: string;
    lanes?: string;
  };
  geometry: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements: Array<{
    type: "way" | "node" | "relation";
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}

const OVERPASS_API_URL = "/api/osm"; // Proxy endpoint
const DB_NAME = "worldview-osm-cache";
const DB_VERSION = 1;
const STORE_NAME = "tiles";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Highway types to fetch */
const HIGHWAY_TYPES = ["motorway", "motorway_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "residential"];

/** Retry configuration for API failures */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/** Error event for external listeners */
export type OSMFetcherError = {
  type: "api_error" | "network_error" | "cache_error";
  message: string;
  retriable: boolean;
};

export class OSMFetcher {
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<void> | null = null;
  private onError: ((error: OSMFetcherError) => void) | null = null;
  private lastError: OSMFetcherError | null = null;
  private isOffline = false;

  constructor() {
    // Initialize IndexedDB lazily
    this.dbInitPromise = this.initDB();
  }
  
  /** Set error callback for external handling */
  setOnError(callback: (error: OSMFetcherError) => void): void {
    this.onError = callback;
  }
  
  /** Get last error that occurred */
  getLastError(): OSMFetcherError | null {
    return this.lastError;
  }
  
  /** Check if fetcher is in offline/error mode */
  isInOfflineMode(): boolean {
    return this.isOffline;
  }
  
  /** Reset offline mode (for retry) */
  resetOfflineMode(): void {
    this.isOffline = false;
    this.lastError = null;
  }
  
  /** Emit an error to callback */
  private emitError(error: OSMFetcherError): void {
    this.lastError = error;
    this.onError?.(error);
    console.error(`[OSMFetcher] ${error.type}: ${error.message}`);
  }

  /** Initialize IndexedDB for caching */
  private async initDB(): Promise<void> {
    // Skip IndexedDB in non-browser environments
    if (typeof indexedDB === "undefined") {
      console.warn("[OSMFetcher] IndexedDB not available - caching disabled");
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("[OSMFetcher] Failed to open IndexedDB:", request.error);
        resolve(); // Continue without caching
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
    });
  }

  /** Generate cache key from bounding box */
  private getCacheKey(bbox: BoundingBox): string {
    // Round to 2 decimal places for cache key stability
    const round = (n: number) => Math.round(n * 100) / 100;
    return `${round(bbox.south)},${round(bbox.west)},${round(bbox.north)},${round(bbox.east)}`;
  }

  /** Get cached data if valid */
  private async getFromCache(key: string): Promise<RawOSMWay[] | null> {
    await this.dbInitPromise;
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result && Date.now() - result.timestamp < CACHE_TTL) {
          console.log(`[OSMFetcher] Cache hit for ${key}`);
          resolve(result.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  }

  /** Store data in cache */
  private async setCache(key: string, data: RawOSMWay[]): Promise<void> {
    await this.dbInitPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({ key, data, timestamp: Date.now() });
      transaction.oncomplete = () => {
        console.log(`[OSMFetcher] Cached ${data.length} ways for ${key}`);
        resolve();
      };
      transaction.onerror = () => resolve();
    });
  }

  /** Build Overpass QL query for roads in bounding box */
  private buildQuery(bbox: BoundingBox): string {
    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    const highwayRegex = HIGHWAY_TYPES.join("|");
    
    return `[out:json][timeout:25];
(
  way["highway"~"^(${highwayRegex})$"](${bboxStr});
);
out geom;`;
  }

  /**
   * Fetch roads within a bounding box
   * Returns cached data if available, otherwise fetches from Overpass API
   * Includes retry logic with exponential backoff
   */
  async fetchRoads(bbox: BoundingBox): Promise<RawOSMWay[]> {
    const cacheKey = this.getCacheKey(bbox);

    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // If in offline mode, return empty (don't spam failed requests)
    if (this.isOffline) {
      console.log("[OSMFetcher] In offline mode, using cached data only");
      return [];
    }

    // Fetch from API with retry logic
    const query = this.buildQuery(bbox);
    console.log(`[OSMFetcher] Fetching roads for bbox: ${cacheKey}`);

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(OVERPASS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: query,
        });

        if (!response.ok) {
          // Check for rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
            console.warn(`[OSMFetcher] Rate limited, retrying in ${delay}ms`);
            await this.sleep(Math.min(delay, RETRY_CONFIG.maxDelayMs));
            continue;
          }
          
          throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
        }

        const data: OverpassResponse = await response.json();
        
        // Parse response into RawOSMWay format
        const ways: RawOSMWay[] = data.elements
          .filter((el): el is typeof el & { type: "way"; geometry: Array<{ lat: number; lon: number }> } => 
            el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2
          )
          .map((el) => ({
            id: el.id,
            tags: {
              highway: el.tags?.highway,
              oneway: el.tags?.oneway,
              name: el.tags?.name,
              maxspeed: el.tags?.maxspeed,
              lanes: el.tags?.lanes,
            },
            geometry: el.geometry,
          }));

        console.log(`[OSMFetcher] Fetched ${ways.length} road segments`);

        // Cache the results
        await this.setCache(cacheKey, ways);

        // Success - reset offline mode if it was set
        this.isOffline = false;
        this.lastError = null;

        return ways;
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a network error
        const isNetworkError = error instanceof TypeError && error.message.includes("fetch");
        
        if (attempt < RETRY_CONFIG.maxRetries - 1) {
          const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
          console.warn(`[OSMFetcher] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        } else {
          // All retries exhausted
          this.isOffline = true;
          this.emitError({
            type: isNetworkError ? "network_error" : "api_error",
            message: `Failed to fetch roads after ${RETRY_CONFIG.maxRetries} attempts: ${lastError.message}`,
            retriable: true,
          });
        }
      }
    }

    // Return empty array on failure (graceful degradation)
    console.error("[OSMFetcher] Failed to fetch roads after all retries:", lastError);
    return [];
  }
  
  /** Sleep utility for retry delays */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch roads for multiple tiles (useful for larger areas)
   */
  async fetchRoadsTiled(bbox: BoundingBox, tileSize = 0.02): Promise<RawOSMWay[]> {
    const tiles: BoundingBox[] = [];
    
    for (let lat = bbox.south; lat < bbox.north; lat += tileSize) {
      for (let lon = bbox.west; lon < bbox.east; lon += tileSize) {
        tiles.push({
          south: lat,
          west: lon,
          north: Math.min(lat + tileSize, bbox.north),
          east: Math.min(lon + tileSize, bbox.east),
        });
      }
    }

    // Fetch all tiles (with some rate limiting)
    const allWays: RawOSMWay[] = [];
    const seenIds = new Set<number>();

    for (const tile of tiles) {
      const ways = await this.fetchRoads(tile);
      for (const way of ways) {
        if (!seenIds.has(way.id)) {
          seenIds.add(way.id);
          allWays.push(way);
        }
      }
      // Small delay between tiles to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    return allWays;
  }

  /** Clear all cached data */
  async clearCache(): Promise<void> {
    await this.dbInitPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      transaction.oncomplete = () => {
        console.log("[OSMFetcher] Cache cleared");
        resolve();
      };
      transaction.onerror = () => resolve();
    });
  }
}
