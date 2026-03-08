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

/** Default Austin bounding box for initial traffic load */
const AUSTIN_BBOX = { south: 30.20, west: -97.80, north: 30.35, east: -97.68 };

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
        await this.loadRoads();
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
   * Load road network data for traffic visualization
   * Call this before showing the layer for best experience
   */
  async loadRoads(bbox = AUSTIN_BBOX): Promise<void> {
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
      this.trafficError = null;  // Clear any previous error
      console.log(`[GroundLayer] Road network loaded: ${this.roadNetwork.segments.length} segments`);
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

    // Load roads if not already loaded
    if (!this.roadNetwork) {
      await this.loadRoads();
    }

    // Show sub-layers based on their visibility state
    if (this.trafficVisible && this.roadNetwork) {
      this.traffic.start();
    }

    if (this.seismicVisible) {
      this.seismic.show();
    }

    // CCTV doesn't have show/hide - billboards are controlled individually
    console.log("[GroundLayer] Layer shown");
  }

  /**
   * Hide the ground layer (all sub-layers)
   */
  hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;

    // Stop traffic animation
    this.traffic.stop();

    // Hide seismic layer
    this.seismic.hide();

    // Note: CCTV billboards remain active - they have their own lifecycle
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
    // CCTV visibility is managed per-billboard - this just tracks the setting
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

    this.traffic.destroy();
    this.cctv.destroy();
    this.seismic.destroy();

    this.viewer = null;
    this.roadNetwork = null;
    this.isInitialized = false;
    this.trafficError = null;
    this.cctvError = null;
    this.seismicError = null;

    console.log("[GroundLayer] Destroyed");
  }
}
