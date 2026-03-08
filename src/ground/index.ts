/**
 * Ground Layer - Orchestrates all ground-level visualizations
 * Includes: Traffic particles, CCTV feeds, Seismic activity
 */

declare const Cesium: typeof import("cesium");

export * from "./traffic/index.ts";
export * from "./cctv/index.ts";
export * from "./seismic/index.ts";

// Re-export main components for convenience
export { TrafficParticleSystem } from "./traffic/TrafficParticleSystem.ts";
export { OSMFetcher } from "./traffic/OSMFetcher.ts";
export { RoadNetwork, buildNetwork } from "./traffic/RoadNetwork.ts";

// CCTV exports
export { CCTVManager } from "./cctv/CCTVManager.ts";
export { CCTVPanel } from "./cctv/CCTVPanel.ts";

// Seismic exports
export { EarthquakeLayer } from "./seismic/EarthquakeLayer.ts";
export { USGSFetcher } from "./seismic/USGSFetcher.ts";
export { RingAnimation, getMagnitudeConfig } from "./seismic/RingAnimation.ts";

// Import sub-layers for orchestrator
import { TrafficParticleSystem } from "./traffic/TrafficParticleSystem.ts";
import type { StyleMode } from "./traffic/particleStyles.ts";
import { OSMFetcher, type OSMFetcherError } from "./traffic/OSMFetcher.ts";
import { RoadNetwork } from "./traffic/RoadNetwork.ts";
import { CCTVManager } from "./cctv/CCTVManager.ts";
import { EarthquakeLayer } from "./seismic/EarthquakeLayer.ts";
import { flyTo } from "../globe.ts";

/** Minimum viewport size for traffic loading (degrees) */
const MIN_VIEWPORT_SIZE = 0.01;
/** Maximum viewport size for traffic loading (degrees) - skip if zoomed out too far */
const MAX_VIEWPORT_SIZE = 0.5;
/** Debounce delay for viewport changes (ms) */
const VIEWPORT_DEBOUNCE_MS = 800;
/** Minimum distance change to trigger reload (degrees) */
const MIN_RELOAD_DISTANCE = 0.05;

/** Ground layer error types */
export type GroundLayerError = {
  layer: "traffic" | "cctv" | "seismic";
  message: string;
  recoverable: boolean;
};

/**
 * GroundLayer - Unified orchestrator for all ground-level visualizations
 * Combines traffic particles, CCTV feeds, and earthquake visualization
 */
export class GroundLayer {
  // Sub-layer instances
  readonly traffic: TrafficParticleSystem;
  readonly cctv: CCTVManager;
  readonly seismic: EarthquakeLayer;

  // Private state
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private osmFetcher: OSMFetcher;
  private roadNetwork: RoadNetwork | null = null;
  private isInitialized = false;
  private isVisible = false;

  // Sub-layer visibility state
  private trafficVisible = true;
  private cctvVisible = true;
  private seismicVisible = true;
  
  // Viewport-based loading state
  private lastLoadedBbox: { south: number; west: number; north: number; east: number } | null = null;
  private viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cameraChangeHandler: (() => void) | null = null;

  // Callbacks
  private onCameraCountChange: ((count: number) => void) | null = null;
  private onError: ((error: GroundLayerError) => void) | null = null;
  
  // Error state
  private trafficError: string | null = null;
  private cctvError: string | null = null;
  private seismicError: string | null = null;

  constructor() {
    this.traffic = new TrafficParticleSystem();
    this.cctv = new CCTVManager();
    this.seismic = new EarthquakeLayer();
    this.osmFetcher = new OSMFetcher();
    
    // Set up OSM error handler
    this.osmFetcher.setOnError((error) => {
      this.trafficError = error.message;
      this.onError?.({
        layer: "traffic",
        message: `Traffic data unavailable: ${error.message}`,
        recoverable: error.retriable,
      });
    });
  }
  
  /**
   * Set callback for ground layer errors
   */
  setOnError(callback: (error: GroundLayerError) => void): void {
    this.onError = callback;
  }
  
  /**
   * Get current error state for each sub-layer
   */
  getErrorStates(): { traffic: string | null; cctv: string | null; seismic: string | null } {
    return {
      traffic: this.trafficError,
      cctv: this.cctvError,
      seismic: this.seismicError,
    };
  }
  
  /**
   * Clear error states and retry failed operations
   */
  async retryFailedOperations(): Promise<void> {
    // Reset OSM fetcher offline mode
    if (this.trafficError) {
      this.osmFetcher.resetOfflineMode();
      this.trafficError = null;
      
      // Retry loading roads if visible
      if (this.isVisible && this.trafficVisible) {
        await this.loadRoadsForViewport();
      }
    }
    
    // Reset CCTV retry states
    if (this.cctvError) {
      this.cctv.resetAllRetryStates();
      this.cctvError = null;
    }
    
    // Seismic uses public USGS API, usually doesn't need retry
    this.seismicError = null;
    
    console.log("[GroundLayer] Retrying failed operations");
  }

  /**
   * Initialize the ground layer with a Cesium viewer
   * Initializes all sub-layers but doesn't show them yet
   */
  async initialize(viewer: InstanceType<typeof Cesium.Viewer>): Promise<void> {
    if (this.isInitialized) return;

    this.viewer = viewer;

    try {
      // Initialize traffic particle system
      this.traffic.initialize(viewer);
      console.log("[GroundLayer] Traffic system initialized");

      // Initialize CCTV manager
      this.cctv.initialize(viewer);
      this.cctv.setOnFlyToCamera((lon, lat) => flyTo(lon, lat, 1500, 1.5));
      console.log("[GroundLayer] CCTV manager initialized");

      // Initialize earthquake layer
      this.seismic.initialize(viewer);
      console.log("[GroundLayer] Seismic layer initialized");

      this.isInitialized = true;
      console.log("[GroundLayer] All sub-layers initialized");
    } catch (error) {
      console.error("[GroundLayer] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Get the current viewport bounding box from camera
   */
  private getViewportBbox(): { south: number; west: number; north: number; east: number } | null {
    if (!this.viewer) return null;

    const camera = this.viewer.camera;
    const canvas = this.viewer.scene.canvas;
    
    try {
      // Get corners of viewport in cartographic coordinates
      const corners = [
        camera.pickEllipsoid(new Cesium.Cartesian2(0, 0)),
        camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, 0)),
        camera.pickEllipsoid(new Cesium.Cartesian2(0, canvas.height)),
        camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, canvas.height)),
      ];

      // Filter out undefined values (when camera is looking at sky)
      const validCorners = corners.filter((c): c is InstanceType<typeof Cesium.Cartesian3> => c !== undefined);
      
      if (validCorners.length < 2) {
        return null; // Camera looking at sky
      }

      // Convert to cartographic and find bounds
      let west = 180, south = 90, east = -180, north = -90;
      
      for (const corner of validCorners) {
        const carto = Cesium.Cartographic.fromCartesian(corner);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }

      // Expand bounds slightly for better coverage
      const lonPadding = (east - west) * 0.15;
      const latPadding = (north - south) * 0.15;
      
      return {
        west: west - lonPadding,
        south: south - latPadding,
        east: east + lonPadding,
        north: north + latPadding,
      };
    } catch (error) {
      console.error("[GroundLayer] Error calculating viewport bbox:", error);
      return null;
    }
  }
  
  /**
   * Check if viewport has changed enough to warrant reloading roads
   */
  private shouldReloadRoads(newBbox: { south: number; west: number; north: number; east: number }): boolean {
    if (!this.lastLoadedBbox) return true;
    
    // Calculate center distance
    const oldCenterLon = (this.lastLoadedBbox.east + this.lastLoadedBbox.west) / 2;
    const oldCenterLat = (this.lastLoadedBbox.north + this.lastLoadedBbox.south) / 2;
    const newCenterLon = (newBbox.east + newBbox.west) / 2;
    const newCenterLat = (newBbox.north + newBbox.south) / 2;
    
    const distance = Math.sqrt(
      Math.pow(newCenterLon - oldCenterLon, 2) + 
      Math.pow(newCenterLat - oldCenterLat, 2)
    );
    
    return distance > MIN_RELOAD_DISTANCE;
  }
  
  /**
   * Handle camera movement to reload roads for new viewport
   */
  private handleCameraChange = (): void => {
    if (!this.isVisible || !this.trafficVisible) return;
    
    // Debounce rapid changes
    if (this.viewportDebounceTimer) {
      clearTimeout(this.viewportDebounceTimer);
    }
    
    this.viewportDebounceTimer = setTimeout(() => {
      this.loadRoadsForViewport();
    }, VIEWPORT_DEBOUNCE_MS);
  };
  
  /**
   * Load roads for the current viewport
   */
  async loadRoadsForViewport(): Promise<void> {
    const bbox = this.getViewportBbox();
    if (!bbox) {
      console.log("[GroundLayer] Cannot determine viewport - skipping road load");
      return;
    }
    
    // Check viewport size
    const lonSpan = bbox.east - bbox.west;
    const latSpan = bbox.north - bbox.south;
    
    if (lonSpan > MAX_VIEWPORT_SIZE || latSpan > MAX_VIEWPORT_SIZE) {
      console.log("[GroundLayer] Viewport too large for traffic - zoom in");
      return;
    }
    
    if (lonSpan < MIN_VIEWPORT_SIZE || latSpan < MIN_VIEWPORT_SIZE) {
      console.log("[GroundLayer] Viewport too small - using existing roads");
      return;
    }
    
    // Check if we need to reload
    if (!this.shouldReloadRoads(bbox)) {
      return;
    }
    
    await this.loadRoads(bbox);
  }

  /**
   * Load road network data for traffic visualization
   */
  async loadRoads(bbox: { south: number; west: number; north: number; east: number }): Promise<void> {
    try {
      console.log("[GroundLayer] Loading road network...");
      const rawWays = await this.osmFetcher.fetchRoads(bbox);
      
      if (rawWays.length === 0) {
        // Check if it's an error condition or just no roads in area
        if (this.osmFetcher.isInOfflineMode()) {
          this.trafficError = "Unable to fetch road data. Using cached data if available.";
          this.onError?.({
            layer: "traffic",
            message: this.trafficError,
            recoverable: true,
          });
        }
        console.warn("[GroundLayer] No road data available");
        return;
      }
      
      this.roadNetwork = new RoadNetwork(rawWays);
      await this.traffic.loadNetwork(this.roadNetwork);
      this.lastLoadedBbox = bbox;  // Track loaded area
      this.trafficError = null;  // Clear any previous error
      console.log(`[GroundLayer] Road network loaded: ${this.roadNetwork.segments.length} segments for bbox [${bbox.south.toFixed(3)}, ${bbox.west.toFixed(3)}, ${bbox.north.toFixed(3)}, ${bbox.east.toFixed(3)}]`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.trafficError = message;
      this.onError?.({
        layer: "traffic",
        message: `Failed to load road network: ${message}`,
        recoverable: true,
      });
      console.error("[GroundLayer] Failed to load road network:", error);
      // Don't throw - traffic is optional
    }
  }

  /**
   * Show the ground layer (all enabled sub-layers)
   */
  async show(): Promise<void> {
    if (!this.isInitialized) {
      console.error("[GroundLayer] Not initialized - call initialize() first");
      return;
    }

    this.isVisible = true;

    // Set up camera change listener for viewport-based loading
    if (this.viewer && !this.cameraChangeHandler) {
      this.cameraChangeHandler = this.handleCameraChange;
      this.viewer.camera.moveEnd.addEventListener(this.cameraChangeHandler);
    }

    // Load roads for current viewport
    await this.loadRoadsForViewport();

    // Show sub-layers based on their visibility state
    if (this.trafficVisible && this.roadNetwork) {
      this.traffic.start();
    }

    if (this.seismicVisible) {
      this.seismic.show();
    }

    // Show CCTV camera markers
    if (this.cctvVisible) {
      this.cctv.showCameraMarkers();
    }

    console.log("[GroundLayer] Layer shown");
  }

  /**
   * Hide the ground layer (all sub-layers)
   */
  hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;

    // Clear debounce timer
    if (this.viewportDebounceTimer) {
      clearTimeout(this.viewportDebounceTimer);
      this.viewportDebounceTimer = null;
    }

    // Stop traffic animation
    this.traffic.stop();

    // Hide seismic layer
    this.seismic.hide();

    // Hide CCTV camera markers
    this.cctv.hideCameraMarkers();

    console.log("[GroundLayer] Layer hidden");
  }

  /**
   * Toggle overall visibility
   */
  toggle(): boolean {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
    return this.isVisible;
  }

  /**
   * Check if layer is visible
   */
  isShown(): boolean {
    return this.isVisible;
  }

  // --- Sub-layer visibility controls ---

  /**
   * Set traffic sub-layer visibility
   */
  setTrafficVisible(visible: boolean): void {
    this.trafficVisible = visible;

    if (this.isVisible) {
      if (visible && this.roadNetwork) {
        this.traffic.start();
      } else {
        this.traffic.stop();
      }
    }

    console.log(`[GroundLayer] Traffic ${visible ? "enabled" : "disabled"}`);
  }

  /**
   * Check if traffic is enabled
   */
  isTrafficVisible(): boolean {
    return this.trafficVisible;
  }

  /**
   * Set CCTV sub-layer visibility
   */
  setCCTVVisible(visible: boolean): void {
    this.cctvVisible = visible;
    
    if (this.isVisible) {
      if (visible) {
        this.cctv.showCameraMarkers();
      } else {
        this.cctv.hideCameraMarkers();
      }
    }
    
    console.log(`[GroundLayer] CCTV ${visible ? "enabled" : "disabled"}`);
  }

  /**
   * Check if CCTV is enabled
   */
  isCCTVVisible(): boolean {
    return this.cctvVisible;
  }

  /**
   * Set seismic sub-layer visibility
   */
  setSeismicVisible(visible: boolean): void {
    this.seismicVisible = visible;

    if (this.isVisible) {
      if (visible) {
        this.seismic.show();
      } else {
        this.seismic.hide();
      }
    }

    console.log(`[GroundLayer] Seismic ${visible ? "enabled" : "disabled"}`);
  }

  /**
   * Check if seismic is enabled
   */
  isSeismicVisible(): boolean {
    return this.seismicVisible;
  }

  // --- Traffic style controls ---

  /**
   * Set traffic particle style mode
   */
  setTrafficStyleMode(mode: StyleMode): void {
    this.traffic.setStyleMode(mode);
  }

  /**
   * Get current traffic style mode
   */
  getTrafficStyleMode(): StyleMode {
    return this.traffic.getStyleMode();
  }

  // --- CCTV convenience methods ---

  /**
   * Get CCTVManager for panel integration
   */
  getCCTVManager(): CCTVManager {
    return this.cctv;
  }

  /**
   * Get active camera count
   */
  getActiveCameraCount(): number {
    return this.cctv.getActiveBillboardCount();
  }

  /**
   * Set callback for camera count changes
   */
  setOnCameraCountChange(callback: (count: number) => void): void {
    this.onCameraCountChange = callback;
    this.cctv.setOnBillboardChange(() => {
      callback(this.cctv.getActiveBillboardCount());
    });
  }

  // --- Performance & Debug ---
  
  /**
   * Get performance statistics for the ground layer
   */
  getPerformanceStats(): {
    traffic: {
      particleCount: number;
      visibleParticles: number;
      visibleSegments: number;
      avgFrameTime: number;
      lodLevel: number;
      cullingEnabled: boolean;
    };
    cctv: {
      activeBillboards: number;
      texturePool: { total: number; inUse: number; available: number };
      failedStreams: number;
    };
    seismic: {
      activeQuakes: number;
    };
  } {
    return {
      traffic: {
        particleCount: this.traffic.getParticleCount(),
        visibleParticles: this.traffic.getVisibleParticleCount(),
        visibleSegments: this.traffic.getVisibleSegmentCount(),
        avgFrameTime: this.traffic.getAverageFrameTime(),
        lodLevel: this.traffic.getLODLevel(),
        cullingEnabled: this.traffic.isCullingEnabled(),
      },
      cctv: {
        activeBillboards: this.cctv.getActiveBillboardCount(),
        texturePool: this.cctv.getTexturePoolStats(),
        failedStreams: this.cctv.getFailedStreamCount(),
      },
      seismic: {
        activeQuakes: this.seismic.getActiveCount(),
      },
    };
  }
  
  /**
   * Set LOD enabled state for traffic
   */
  setTrafficLODEnabled(enabled: boolean): void {
    this.traffic.setLODEnabled(enabled);
  }
  
  /**
   * Set culling enabled state for traffic
   */
  setTrafficCullingEnabled(enabled: boolean): void {
    this.traffic.setCullingEnabled(enabled);
  }
  
  /**
   * Reset performance counters
   */
  resetPerformanceCounters(): void {
    this.traffic.resetPerformanceCounters();
  }

  // --- Cleanup ---

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.hide();

    // Remove camera listener
    if (this.viewer && this.cameraChangeHandler) {
      this.viewer.camera.moveEnd.removeEventListener(this.cameraChangeHandler);
      this.cameraChangeHandler = null;
    }

    this.traffic.destroy();
    this.cctv.destroy();
    this.seismic.destroy();

    this.viewer = null;
    this.roadNetwork = null;
    this.lastLoadedBbox = null;
    this.isInitialized = false;
    this.trafficError = null;
    this.cctvError = null;
    this.seismicError = null;

    console.log("[GroundLayer] Destroyed");
  }
}
