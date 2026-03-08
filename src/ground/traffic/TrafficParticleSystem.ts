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

  constructor(config: Partial<ParticleSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Initialize the particle system with a Cesium viewer */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    this.viewer = viewer;
    
    // Create point primitive collection for particles
    this.pointCollection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(this.pointCollection);
    
    console.log("[TrafficParticleSystem] Initialized");
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

  /** Update all particles */
  update(deltaTime: number): void {
    if (!this.network || !this.pointCollection) return;

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      if (!particle) continue;
      
      const segment = this.network.segments[particle.segmentIndex];
      if (!segment) continue;

      // Advance particle along segment
      const movement = particle.speed * deltaTime * particle.direction;
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
    // Level 0-1: 0 = full particles, 1 = reduced particles
    const targetCount = Math.floor(this.config.maxParticles * (1 - level * 0.8));
    
    // Note: Reducing particles requires hiding them since PointPrimitiveCollection
    // doesn't support efficient removal. Full implementation would use show/hide.
    console.log(`[TrafficParticleSystem] LOD level set to ${level}, target particles: ${targetCount}`);
  }

  /** Enable/disable frustum culling */
  setCullingEnabled(enabled: boolean): void {
    // Placeholder for Phase 5 optimization
    console.log(`[TrafficParticleSystem] Culling ${enabled ? "enabled" : "disabled"}`);
  }

  /** Clean up resources */
  destroy(): void {
    this.stop();
    
    if (this.pointCollection && this.viewer) {
      this.viewer.scene.primitives.remove(this.pointCollection);
      this.pointCollection = null;
    }
    
    this.particles = [];
    this.network = null;
    this.viewer = null;
    
    console.log("[TrafficParticleSystem] Destroyed");
  }
}
