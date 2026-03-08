/**
 * TrafficParticleSystem - Animated particles flowing along road network
 * Uses Cesium PointPrimitiveCollection for efficient rendering
 */

declare const Cesium: typeof import("cesium");

import { RoadNetwork, type RoadSegment } from "./RoadNetwork.ts";
import { type StyleMode, getRoadColor, toCesiumColor, ROAD_CONFIG } from "./particleStyles.ts";

/** State of a single traffic particle */
export interface ParticleState {
  segmentIndex: number;      // Index into network.segments
  progress: number;          // 0-1 along segment
  speed: number;             // Units per second (based on road class)
  direction: 1 | -1;         // Forward or reverse along segment
  primitiveIndex: number;    // Index in PointPrimitiveCollection
  visible: boolean;          // Whether particle is currently visible (for LOD)
}

/** Configuration for the particle system */
export interface ParticleSystemConfig {
  maxParticles: number;
  baseSpeed: number;         // Base speed in progress units per second
  particleSize: number;      // Size in pixels
}

const DEFAULT_CONFIG: ParticleSystemConfig = {
  maxParticles: 5000,
  baseSpeed: 0.15,           // ~15% of segment per second at speed 1.0
  particleSize: 4,
};

/** LOD configuration */
const LOD_CONFIG = {
  minAltitude: 500,          // Altitude (meters) below which we show 100% particles
  maxAltitude: 50000,        // Altitude (meters) above which we show minimum particles
  minVisibleRatio: 0.2,      // Minimum ratio of visible particles at max altitude
  updateBatchSize: 500,      // Max particles to update per frame
};

/** Culling configuration */
const CULLING_CONFIG = {
  frustumPadding: 0.1,       // Extra padding around frustum (degrees)
};

export class TrafficParticleSystem {
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private pointCollection: InstanceType<typeof Cesium.PointPrimitiveCollection> | null = null;
  private network: RoadNetwork | null = null;
  private particles: ParticleState[] = [];
  private config: ParticleSystemConfig;
  private styleMode: StyleMode = "heatmap";
  private isRunning = false;
  private lastUpdateTime = 0;
  private animationFrameId: number | null = null;
  
  // LOD state
  private currentLODLevel = 0;           // 0 = full detail, 1 = minimum detail
  private lodEnabled = true;
  private cameraChangeHandler: (() => void) | null = null;
  
  // Culling state
  private cullingEnabled = true;
  private visibleSegmentIndices: Set<number> = new Set();
  
  // Batching state
  private batchIndex = 0;                // Current position in particle array for batch updates
  
  // Performance tracking
  private lastFrameTime = 0;
  private frameTimeAccumulator = 0;
  private frameCount = 0;

  constructor(config: Partial<ParticleSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Initialize the particle system with a Cesium viewer */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    this.viewer = viewer;
    
    // Create point primitive collection for particles
    this.pointCollection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(this.pointCollection);
    
    // Set up camera change listener for LOD updates
    this.setupCameraListener();
    
    console.log("[TrafficParticleSystem] Initialized");
  }
  
  /** Set up camera listener for LOD and culling updates */
  private setupCameraListener(): void {
    if (!this.viewer) return;
    
    this.cameraChangeHandler = () => {
      if (this.lodEnabled) {
        this.updateLODFromCamera();
      }
      if (this.cullingEnabled) {
        this.updateVisibleSegments();
      }
    };
    
    this.viewer.camera.changed.addEventListener(this.cameraChangeHandler);
  }
  
  /** Calculate LOD level from current camera altitude */
  private updateLODFromCamera(): void {
    if (!this.viewer) return;
    
    const camera = this.viewer.camera;
    const ellipsoid = this.viewer.scene.globe.ellipsoid;
    
    // Get camera altitude
    const cartographic = ellipsoid.cartesianToCartographic(camera.position);
    if (!cartographic) return;
    
    const altitude = cartographic.height;
    
    // Calculate LOD level (0 = full detail, 1 = minimum)
    let lodLevel: number;
    if (altitude <= LOD_CONFIG.minAltitude) {
      lodLevel = 0;
    } else if (altitude >= LOD_CONFIG.maxAltitude) {
      lodLevel = 1;
    } else {
      // Smooth interpolation between min and max altitude
      const t = (altitude - LOD_CONFIG.minAltitude) / (LOD_CONFIG.maxAltitude - LOD_CONFIG.minAltitude);
      lodLevel = t;
    }
    
    // Only update if LOD level changed significantly
    if (Math.abs(lodLevel - this.currentLODLevel) > 0.05) {
      this.setLODLevel(lodLevel);
    }
  }
  
  /** Update which segments are visible in the camera frustum */
  private updateVisibleSegments(): void {
    if (!this.viewer || !this.network || !this.cullingEnabled) {
      return;
    }
    
    this.visibleSegmentIndices.clear();
    
    const camera = this.viewer.camera;
    const canvas = this.viewer.scene.canvas;
    
    // Get viewport bounds
    const corners = [
      camera.pickEllipsoid(new Cesium.Cartesian2(0, 0)),
      camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, 0)),
      camera.pickEllipsoid(new Cesium.Cartesian2(0, canvas.height)),
      camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, canvas.height)),
    ];
    
    const validCorners = corners.filter((c): c is InstanceType<typeof Cesium.Cartesian3> => c !== undefined);
    
    if (validCorners.length < 2) {
      // Camera looking at sky - show all segments
      for (let i = 0; i < this.network.segments.length; i++) {
        this.visibleSegmentIndices.add(i);
      }
      return;
    }
    
    // Calculate bounds
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
    
    // Add padding
    const padding = CULLING_CONFIG.frustumPadding;
    west -= padding;
    east += padding;
    south -= padding;
    north += padding;
    
    // Check which segments are in bounds
    for (let i = 0; i < this.network.segments.length; i++) {
      const segment = this.network.segments[i];
      if (!segment) continue;
      
      // Check if segment intersects viewport (simplified check using first and last point)
      const firstPoint = segment.points[0];
      const lastPoint = segment.points[segment.points.length - 1];
      
      if (!firstPoint || !lastPoint) continue;
      
      // Check if either endpoint is in viewport, or segment crosses viewport
      const inBounds = (lon: number, lat: number) => 
        lon >= west && lon <= east && lat >= south && lat <= north;
      
      if (inBounds(firstPoint[0], firstPoint[1]) || inBounds(lastPoint[0], lastPoint[1])) {
        this.visibleSegmentIndices.add(i);
      }
    }
  }

  /** Load road network and spawn initial particles */
  async loadNetwork(network: RoadNetwork): Promise<void> {
    this.network = network;
    
    // Clear existing particles
    this.clearParticles();
    
    // Spawn particles based on road density
    this.spawnParticles();
    
    console.log(`[TrafficParticleSystem] Loaded network with ${network.segments.length} segments, spawned ${this.particles.length} particles`);
  }

  /** Spawn particles according to road density configuration */
  private spawnParticles(): void {
    if (!this.network || !this.pointCollection) return;

    const targetCount = this.config.maxParticles;
    
    // Calculate particles per highway type based on density percentages
    const particlesByType = new Map<string, number>();
    let totalPercent = 0;
    
    for (const [highway, config] of Object.entries(ROAD_CONFIG)) {
      const segments = this.network.getSegmentsByType(highway);
      if (segments.length > 0) {
        totalPercent += config.densityPercent;
        particlesByType.set(highway, config.densityPercent);
      }
    }

    // Normalize and spawn
    for (const [highway, percent] of particlesByType) {
      const count = Math.floor((percent / totalPercent) * targetCount);
      const segments = this.network.getSegmentsByType(highway);
      
      if (segments.length === 0) continue;
      
      // Calculate total length for weighted distribution
      const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
      
      for (let i = 0; i < count; i++) {
        // Pick a random segment weighted by length
        let target = Math.random() * totalLength;
        let segment: RoadSegment | null = null;
        let segmentIndex = 0;
        
        for (let j = 0; j < segments.length; j++) {
          const seg = segments[j];
          if (!seg) continue;
          target -= seg.length;
          if (target <= 0) {
            segment = seg;
            segmentIndex = this.network.segments.indexOf(segment);
            break;
          }
        }
        
        if (!segment && segments.length > 0) {
          segment = segments[segments.length - 1] ?? null;
          if (segment) {
            segmentIndex = this.network.segments.indexOf(segment);
          }
        }
        
        if (segment) {
          this.spawnParticleOnSegment(segment, segmentIndex);
        }
      }
    }
    
    // Initialize visible segments (all visible initially)
    this.visibleSegmentIndices.clear();
    for (let i = 0; i < this.network.segments.length; i++) {
      this.visibleSegmentIndices.add(i);
    }
  }

  /** Spawn a single particle on a segment */
  private spawnParticleOnSegment(segment: RoadSegment, segmentIndex: number): void {
    if (!this.pointCollection || !this.network) return;

    // Random position along segment
    const progress = Math.random();
    
    // Direction based on oneway status
    let direction: 1 | -1;
    if (segment.oneway) {
      direction = segment.direction;
    } else {
      // Bidirectional: random direction
      direction = Math.random() < 0.5 ? 1 : -1;
    }

    // Calculate initial position
    const [lon, lat] = this.network.getPositionOnSegment(segment, progress);
    
    // Get color based on road type and style mode
    const color = getRoadColor(segment.highway, this.styleMode);
    
    // Create point primitive
    this.pointCollection.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 5), // 5m above ground
      color: toCesiumColor(color),
      pixelSize: this.config.particleSize,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    // Track particle state
    this.particles.push({
      segmentIndex,
      progress,
      speed: segment.speedMultiplier * this.config.baseSpeed,
      direction,
      primitiveIndex: this.pointCollection.length - 1,
      visible: true,
    });
  }

  /** Clear all particles */
  private clearParticles(): void {
    if (this.pointCollection) {
      this.pointCollection.removeAll();
    }
    this.particles = [];
  }

  /** Start the animation loop */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.animationLoop();
    console.log("[TrafficParticleSystem] Started");
  }

  /** Stop the animation loop */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log("[TrafficParticleSystem] Stopped");
  }

  /** Animation loop */
  private animationLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = now;

    this.update(deltaTime);

    this.animationFrameId = requestAnimationFrame(this.animationLoop);
  };

  /** Update all particles (with batching support) */
  update(deltaTime: number): void {
    if (!this.network || !this.pointCollection) return;

    const startTime = performance.now();
    
    // Determine batch size based on total particles
    const batchSize = LOD_CONFIG.updateBatchSize;
    const totalParticles = this.particles.length;
    
    // Process a batch of particles
    let processed = 0;
    while (processed < batchSize && processed < totalParticles) {
      const i = this.batchIndex;
      const particle = this.particles[i];
      
      // Advance batch index with wrap-around
      this.batchIndex = (this.batchIndex + 1) % totalParticles;
      processed++;
      
      if (!particle) continue;
      
      // Skip hidden particles (LOD)
      if (!particle.visible) continue;
      
      // Skip particles on culled segments
      if (this.cullingEnabled && !this.visibleSegmentIndices.has(particle.segmentIndex)) {
        continue;
      }
      
      const segment = this.network.segments[particle.segmentIndex];
      if (!segment) continue;

      // Advance particle along segment (compensate for batch delay)
      const adjustedDeltaTime = deltaTime * (totalParticles / batchSize);
      const movement = particle.speed * adjustedDeltaTime * particle.direction;
      particle.progress += movement;

      // Handle segment transitions
      if (particle.progress >= 1) {
        // Reached end of segment - try to continue to next segment
        this.transitionParticle(particle, segment, 1);
      } else if (particle.progress <= 0) {
        // Reached start of segment (reverse direction)
        this.transitionParticle(particle, segment, -1);
      }

      // Update visual position
      this.updateParticlePosition(particle);
    }
    
    // Track frame time for performance monitoring
    const frameTime = performance.now() - startTime;
    this.frameTimeAccumulator += frameTime;
    this.frameCount++;
    this.lastFrameTime = frameTime;
    
    // Log warning if particle update takes too long
    if (frameTime > 2) {
      console.warn(`[TrafficParticleSystem] Particle update took ${frameTime.toFixed(1)}ms (> 2ms budget)`);
    }
  }

  /** Handle particle transitioning between segments */
  private transitionParticle(particle: ParticleState, currentSegment: RoadSegment, direction: 1 | -1): void {
    if (!this.network) return;

    // Get connected segments at the appropriate endpoint
    const connected = this.network.getConnectedSegments(currentSegment.id);
    
    if (connected.length > 0) {
      // Pick a random connected segment
      const nextSegment = connected[Math.floor(Math.random() * connected.length)];
      if (!nextSegment) {
        this.respawnParticle(particle);
        return;
      }
      
      const nextIndex = this.network.segments.indexOf(nextSegment);
      
      if (nextIndex >= 0) {
        particle.segmentIndex = nextIndex;
        particle.speed = nextSegment.speedMultiplier * this.config.baseSpeed;
        
        // Determine direction on new segment
        if (nextSegment.oneway) {
          particle.direction = nextSegment.direction;
          particle.progress = nextSegment.direction === 1 ? 0 : 1;
        } else {
          // Continue in a consistent direction
          particle.progress = direction === 1 ? 0 : 1;
          particle.direction = direction;
        }
        return;
      }
    }

    // No connected segments - respawn randomly
    this.respawnParticle(particle);
  }

  /** Respawn a particle at a random location */
  private respawnParticle(particle: ParticleState): void {
    if (!this.network) return;

    const segment = this.network.getRandomSegmentWeighted();
    if (!segment) return;

    const segmentIndex = this.network.segments.indexOf(segment);
    if (segmentIndex < 0) return;

    particle.segmentIndex = segmentIndex;
    particle.progress = Math.random();
    particle.speed = segment.speedMultiplier * this.config.baseSpeed;
    
    if (segment.oneway) {
      particle.direction = segment.direction;
    } else {
      particle.direction = Math.random() < 0.5 ? 1 : -1;
    }
  }

  /** Update the visual position of a particle */
  private updateParticlePosition(particle: ParticleState): void {
    if (!this.network || !this.pointCollection) return;

    const segment = this.network.segments[particle.segmentIndex];
    if (!segment) return;

    const [lon, lat] = this.network.getPositionOnSegment(segment, particle.progress);
    const point = this.pointCollection.get(particle.primitiveIndex);
    
    if (point) {
      point.position = Cesium.Cartesian3.fromDegrees(lon, lat, 5);
    }
  }

  /** Set the visual style mode */
  setStyleMode(mode: StyleMode): void {
    this.styleMode = mode;
    
    // Update all particle colors
    if (!this.network || !this.pointCollection) return;

    for (const particle of this.particles) {
      const segment = this.network.segments[particle.segmentIndex];
      if (!segment) continue;

      const color = getRoadColor(segment.highway, mode);
      const point = this.pointCollection.get(particle.primitiveIndex);
      
      if (point) {
        point.color = toCesiumColor(color);
      }
    }

    console.log(`[TrafficParticleSystem] Style mode set to: ${mode}`);
  }

  /** Get current style mode */
  getStyleMode(): StyleMode {
    return this.styleMode;
  }

  /** Get particle count */
  getParticleCount(): number {
    return this.particles.length;
  }

  /** Set LOD level (for performance optimization) */
  setLODLevel(level: number): void {
    // Clamp level to 0-1
    level = Math.max(0, Math.min(1, level));
    this.currentLODLevel = level;
    
    // Calculate visible ratio based on LOD level
    // Level 0 = 100% visible, Level 1 = minVisibleRatio
    const visibleRatio = 1 - (level * (1 - LOD_CONFIG.minVisibleRatio));
    const targetVisibleCount = Math.floor(this.particles.length * visibleRatio);
    
    // Update particle visibility
    let visibleCount = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      if (!particle) continue;
      
      // Deterministic visibility based on particle index (for consistency)
      const shouldBeVisible = visibleCount < targetVisibleCount;
      
      if (particle.visible !== shouldBeVisible) {
        particle.visible = shouldBeVisible;
        
        // Update primitive visibility
        const point = this.pointCollection?.get(particle.primitiveIndex);
        if (point) {
          point.show = shouldBeVisible;
        }
      }
      
      if (shouldBeVisible) {
        visibleCount++;
      }
    }
    
    console.log(`[TrafficParticleSystem] LOD level: ${level.toFixed(2)}, visible: ${visibleCount}/${this.particles.length}`);
  }
  
  /** Enable/disable LOD system */
  setLODEnabled(enabled: boolean): void {
    this.lodEnabled = enabled;
    if (!enabled) {
      // Reset to full visibility
      this.setLODLevel(0);
    }
    console.log(`[TrafficParticleSystem] LOD ${enabled ? "enabled" : "disabled"}`);
  }
  
  /** Check if LOD is enabled */
  isLODEnabled(): boolean {
    return this.lodEnabled;
  }
  
  /** Get current LOD level */
  getLODLevel(): number {
    return this.currentLODLevel;
  }

  /** Enable/disable frustum culling */
  setCullingEnabled(enabled: boolean): void {
    this.cullingEnabled = enabled;
    
    if (!enabled) {
      // Reset to all segments visible
      this.visibleSegmentIndices.clear();
      if (this.network) {
        for (let i = 0; i < this.network.segments.length; i++) {
          this.visibleSegmentIndices.add(i);
        }
      }
    } else {
      // Update visible segments immediately
      this.updateVisibleSegments();
    }
    
    console.log(`[TrafficParticleSystem] Culling ${enabled ? "enabled" : "disabled"}`);
  }
  
  /** Check if culling is enabled */
  isCullingEnabled(): boolean {
    return this.cullingEnabled;
  }
  
  /** Get count of visible segments */
  getVisibleSegmentCount(): number {
    return this.visibleSegmentIndices.size;
  }
  
  /** Get count of visible particles (LOD-affected) */
  getVisibleParticleCount(): number {
    return this.particles.filter(p => p.visible).length;
  }
  
  /** Get average frame time for particle updates */
  getAverageFrameTime(): number {
    if (this.frameCount === 0) return 0;
    return this.frameTimeAccumulator / this.frameCount;
  }
  
  /** Reset performance counters */
  resetPerformanceCounters(): void {
    this.frameTimeAccumulator = 0;
    this.frameCount = 0;
  }

  /** Clean up resources */
  destroy(): void {
    this.stop();
    
    // Remove camera listener
    if (this.viewer && this.cameraChangeHandler) {
      this.viewer.camera.changed.removeEventListener(this.cameraChangeHandler);
      this.cameraChangeHandler = null;
    }
    
    if (this.pointCollection && this.viewer) {
      this.viewer.scene.primitives.remove(this.pointCollection);
      this.pointCollection = null;
    }
    
    this.particles = [];
    this.network = null;
    this.visibleSegmentIndices.clear();
    this.viewer = null;
    
    console.log("[TrafficParticleSystem] Destroyed");
  }
}
