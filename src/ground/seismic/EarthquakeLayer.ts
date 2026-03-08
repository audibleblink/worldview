/**
 * EarthquakeLayer - Orchestrates earthquake visualization
 * Coordinates USGSFetcher, RingAnimation, and demo fallback
 */

declare const Cesium: typeof import("cesium");

import { USGSFetcher, type EarthquakeData } from "./USGSFetcher.ts";
import { RingAnimation } from "./RingAnimation.ts";
import { onCameraChange, getCameraCenter } from "../../camera.ts";

/** Demo fallback configuration */
const DEMO_CONFIG = {
  cycleIntervalMs: 30_000,     // New demo earthquake every 30 seconds
  minMagnitude: 2.5,
  maxMagnitude: 4.5,
  // Austin center for demo fallback
  defaultCenter: { lat: 30.27, lon: -97.74 },
  // Radius around center for random placement (degrees)
  placementRadius: 0.15,
};

/** Demo location names */
const DEMO_LOCATIONS = [
  "Downtown Austin",
  "UT Campus Area",
  "South Congress",
  "East Austin",
  "North Loop",
  "Zilker Park",
  "Mueller",
  "Hyde Park",
  "Clarksville",
  "Travis Heights",
];

export class EarthquakeLayer {
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private fetcher: USGSFetcher;
  private ringAnimation: RingAnimation;
  private isVisible = false;
  private isInitialized = false;
  
  // Demo fallback state
  private demoInterval: ReturnType<typeof setInterval> | null = null;
  private currentDemoQuake: EarthquakeData | null = null;
  private demoIdCounter = 0;
  
  // Viewport tracking
  private viewportCenter: { lat: number; lon: number } | null = null;
  private removeCameraListener: (() => void) | null = null;

  constructor() {
    this.fetcher = new USGSFetcher();
    this.ringAnimation = new RingAnimation();
  }

  /** Initialize the earthquake layer with a Cesium viewer */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    if (this.isInitialized) return;
    
    this.viewer = viewer;
    this.ringAnimation.initialize(viewer);
    
    // Set up viewport tracking
    this.setupViewportTracking();
    
    // Set up earthquake update handler
    this.fetcher.startPolling((earthquakes) => {
      this.handleEarthquakeUpdate(earthquakes);
    });
    
    this.isInitialized = true;
    console.log("[EarthquakeLayer] Initialized");
  }

  /** Set up viewport change tracking */
  private setupViewportTracking(): void {
    if (!this.viewer) return;

    const updateViewportCenter = () => {
      const center = getCameraCenter(this.viewer!);
      if (center) {
        this.viewportCenter = center;
        this.fetcher.setViewportCenter(center.lat, center.lon);
      }
    };

    this.removeCameraListener = onCameraChange(this.viewer, updateViewportCenter);
    updateViewportCenter();
  }

  /** Handle earthquake data updates */
  private handleEarthquakeUpdate(earthquakes: EarthquakeData[]): void {
    if (!this.isVisible) return;

    // Get currently displayed earthquake IDs
    const currentIds = new Set(this.ringAnimation.getActiveIds());
    const newIds = new Set(earthquakes.map((eq) => eq.id));

    // Remove visualizations for earthquakes no longer in data
    // (but keep demo quakes)
    for (const id of currentIds) {
      if (!newIds.has(id) && !id.startsWith("demo-")) {
        this.ringAnimation.removeVisualization(id);
      }
    }

    // Add visualizations for new earthquakes
    for (const eq of earthquakes) {
      if (!this.ringAnimation.hasVisualization(eq.id)) {
        this.ringAnimation.createVisualization(eq);
      }
    }

    // Check if we need demo fallback
    this.checkDemoFallback(earthquakes);
  }

  /** Check if demo fallback is needed */
  private checkDemoFallback(realEarthquakes: EarthquakeData[]): void {
    if (realEarthquakes.length > 0) {
      // Real earthquakes exist - remove demo if present
      this.stopDemoFallback();
      return;
    }

    // No real earthquakes - start demo fallback if not already running
    if (!this.demoInterval) {
      this.startDemoFallback();
    }
  }

  /** Start demo fallback mode */
  private startDemoFallback(): void {
    if (this.demoInterval) return;
    
    console.log("[EarthquakeLayer] Starting demo fallback mode");
    
    // Create initial demo earthquake
    this.spawnDemoEarthquake();
    
    // Cycle demo earthquakes
    this.demoInterval = setInterval(() => {
      this.spawnDemoEarthquake();
    }, DEMO_CONFIG.cycleIntervalMs);
  }

  /** Stop demo fallback mode */
  private stopDemoFallback(): void {
    if (!this.demoInterval) return;
    
    clearInterval(this.demoInterval);
    this.demoInterval = null;
    
    // Remove current demo earthquake
    if (this.currentDemoQuake) {
      this.ringAnimation.removeVisualization(this.currentDemoQuake.id);
      this.currentDemoQuake = null;
    }
    
    console.log("[EarthquakeLayer] Stopped demo fallback mode");
  }

  /** Spawn a new demo earthquake */
  private spawnDemoEarthquake(): void {
    // Remove previous demo quake
    if (this.currentDemoQuake) {
      this.ringAnimation.removeVisualization(this.currentDemoQuake.id);
    }

    // Use viewport center if available, otherwise default to Austin
    const center = this.viewportCenter ?? DEMO_CONFIG.defaultCenter;
    
    // Random position within radius
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * DEMO_CONFIG.placementRadius;
    const lat = center.lat + radius * Math.sin(angle);
    const lon = center.lon + radius * Math.cos(angle);
    
    // Random magnitude
    const magnitude = DEMO_CONFIG.minMagnitude + 
      Math.random() * (DEMO_CONFIG.maxMagnitude - DEMO_CONFIG.minMagnitude);
    
    // Random location name
    const place = DEMO_LOCATIONS[Math.floor(Math.random() * DEMO_LOCATIONS.length)] ?? "Unknown";
    
    this.demoIdCounter++;
    const demoQuake: EarthquakeData = {
      id: `demo-${this.demoIdCounter}`,
      magnitude: Math.round(magnitude * 10) / 10, // Round to 1 decimal
      place,
      time: new Date(),
      longitude: lon,
      latitude: lat,
      depth: 5 + Math.random() * 10, // 5-15 km depth
      isSimulated: true,
    };

    this.currentDemoQuake = demoQuake;
    this.ringAnimation.createVisualization(demoQuake);
    
    console.log(`[EarthquakeLayer] Demo earthquake: M${demoQuake.magnitude} at ${demoQuake.place}`);
  }

  /** Show the earthquake layer */
  show(): void {
    if (this.isVisible) return;
    
    this.isVisible = true;
    this.ringAnimation.start();
    
    // Trigger initial data fetch
    const earthquakes = this.fetcher.getCachedNearViewport();
    this.handleEarthquakeUpdate(earthquakes);
    
    console.log("[EarthquakeLayer] Shown");
  }

  /** Hide the earthquake layer */
  hide(): void {
    if (!this.isVisible) return;
    
    this.isVisible = false;
    this.ringAnimation.stop();
    this.stopDemoFallback();
    
    // Remove all visualizations
    for (const id of this.ringAnimation.getActiveIds()) {
      this.ringAnimation.removeVisualization(id);
    }
    
    console.log("[EarthquakeLayer] Hidden");
  }

  /** Toggle visibility */
  toggle(): boolean {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
    return this.isVisible;
  }

  /** Check if layer is visible */
  isShown(): boolean {
    return this.isVisible;
  }

  /** Get count of active earthquake visualizations */
  getActiveCount(): number {
    return this.ringAnimation.getActiveCount();
  }

  /** Force refresh earthquake data */
  async refresh(): Promise<void> {
    const earthquakes = await this.fetcher.fetchNearViewport();
    if (this.isVisible) {
      this.handleEarthquakeUpdate(earthquakes);
    }
  }

  /** Clean up all resources */
  destroy(): void {
    this.hide();
    
    this.removeCameraListener?.();
    this.removeCameraListener = null;
    
    this.fetcher.destroy();
    this.ringAnimation.destroy();
    this.viewer = null;
    this.isInitialized = false;
    
    console.log("[EarthquakeLayer] Destroyed");
  }
}
