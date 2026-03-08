/**
 * RingAnimation - Animated expanding rings for earthquake visualization
 * Uses Cesium EllipseGraphics with CallbackProperty for smooth animation
 */

declare const Cesium: typeof import("cesium");

import type { EarthquakeData } from "./USGSFetcher.ts";

/** Configuration for a specific magnitude range */
export interface MagnitudeConfig {
  maxRadius: number;      // Maximum ring radius in km
  color: string;          // CSS color string
  ringCount: number;      // Number of concurrent rings
  animationDuration: number; // Seconds for full expansion
}

/** Ring state for animation tracking */
interface RingState {
  entity: InstanceType<typeof Cesium.Entity>;
  startTime: number;      // Animation start time (ms)
  duration: number;       // Animation duration (ms)
  maxRadius: number;      // Max radius in meters
}

/** Epicenter state */
interface EpicenterState {
  entity: InstanceType<typeof Cesium.Entity>;
  pulseStart: number;
}

/** Complete earthquake visualization state */
export interface EarthquakeVisualization {
  earthquakeId: string;
  data: EarthquakeData;
  rings: RingState[];
  epicenter: EpicenterState;
  labelEntity: InstanceType<typeof Cesium.Entity>;
  lastRingSpawn: number;
  isActive: boolean;
}

/** Magnitude configuration table */
const MAGNITUDE_CONFIG: { threshold: number; config: MagnitudeConfig }[] = [
  { threshold: 3.0, config: { maxRadius: 10, color: "#ffff00", ringCount: 2, animationDuration: 4 } },
  { threshold: 4.5, config: { maxRadius: 25, color: "#ff8800", ringCount: 3, animationDuration: 5 } },
  { threshold: 6.0, config: { maxRadius: 50, color: "#ff3333", ringCount: 4, animationDuration: 6 } },
  { threshold: Infinity, config: { maxRadius: 100, color: "#990000", ringCount: 5, animationDuration: 8 } },
];

/**
 * Get magnitude configuration for a given magnitude
 * @param magnitude - Earthquake magnitude
 * @returns Configuration object with ring properties
 */
export function getMagnitudeConfig(magnitude: number): MagnitudeConfig {
  for (const { threshold, config } of MAGNITUDE_CONFIG) {
    if (magnitude < threshold) {
      return config;
    }
  }
  // Fallback (shouldn't reach here)
  return MAGNITUDE_CONFIG[MAGNITUDE_CONFIG.length - 1]!.config;
}

/** Convert km to meters */
const kmToMeters = (km: number) => km * 1000;

/** Ring spawn interval relative to animation duration */
const RING_SPAWN_RATIO = 0.35; // New ring spawns at 35% of animation duration

export class RingAnimation {
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private visualizations: Map<string, EarthquakeVisualization> = new Map();
  private animationFrameId: number | null = null;
  private isRunning = false;

  /** Initialize with Cesium viewer */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    this.viewer = viewer;
    console.log("[RingAnimation] Initialized");
  }

  /** Create visualization for an earthquake */
  createVisualization(earthquake: EarthquakeData): EarthquakeVisualization | null {
    if (!this.viewer) {
      console.error("[RingAnimation] Viewer not initialized");
      return null;
    }

    // Don't duplicate
    if (this.visualizations.has(earthquake.id)) {
      return this.visualizations.get(earthquake.id)!;
    }

    const config = getMagnitudeConfig(earthquake.magnitude);
    const position = Cesium.Cartesian3.fromDegrees(
      earthquake.longitude,
      earthquake.latitude,
      0
    );

    // Create epicenter pulsing dot
    const epicenter = this.createEpicenter(position, config.color);

    // Create label
    const labelText = earthquake.isSimulated
      ? `M${earthquake.magnitude.toFixed(1)} - SIMULATED`
      : `M${earthquake.magnitude.toFixed(1)} - ${earthquake.place}`;

    const labelEntity = this.viewer.entities.add({
      position,
      label: {
        text: labelText,
        font: "bold 12px Courier New",
        fillColor: Cesium.Color.fromCssColorString("#00ff88"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    const visualization: EarthquakeVisualization = {
      earthquakeId: earthquake.id,
      data: earthquake,
      rings: [],
      epicenter,
      labelEntity,
      lastRingSpawn: 0,
      isActive: true,
    };

    // Spawn initial ring
    this.spawnRing(visualization, config);
    visualization.lastRingSpawn = performance.now();

    this.visualizations.set(earthquake.id, visualization);
    console.log(`[RingAnimation] Created visualization for M${earthquake.magnitude.toFixed(1)} at ${earthquake.place}`);

    return visualization;
  }

  /** Create pulsing epicenter dot */
  private createEpicenter(
    position: InstanceType<typeof Cesium.Cartesian3>,
    colorStr: string
  ): EpicenterState {
    const now = performance.now();
    const baseColor = Cesium.Color.fromCssColorString(colorStr);

    // Pulsing scale via CallbackProperty
    const pulseScale = new Cesium.CallbackProperty(() => {
      const elapsed = (performance.now() - now) / 1000;
      const pulse = 0.8 + 0.4 * Math.sin(elapsed * 4); // 4 Hz pulse
      return 8 * pulse; // Base size 8 pixels, pulses +-40%
    }, false);

    const entity = this.viewer!.entities.add({
      position,
      point: {
        pixelSize: pulseScale,
        color: baseColor,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    return { entity, pulseStart: now };
  }

  /** Spawn a new expanding ring */
  private spawnRing(visualization: EarthquakeVisualization, config: MagnitudeConfig): void {
    if (!this.viewer) return;

    const position = Cesium.Cartesian3.fromDegrees(
      visualization.data.longitude,
      visualization.data.latitude,
      0
    );

    const startTime = performance.now();
    const durationMs = config.animationDuration * 1000;
    const maxRadiusM = kmToMeters(config.maxRadius);
    const baseColor = Cesium.Color.fromCssColorString(config.color);

    // Animated radius via CallbackProperty
    const semiMajorAxis = new Cesium.CallbackProperty(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic for natural expansion
      const eased = 1 - Math.pow(1 - progress, 3);
      return Math.max(100, maxRadiusM * eased); // Min 100m to be visible
    }, false);

    // Animated opacity (fades as ring expands)
    const material = new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const alpha = 1 - progress; // Linear fade
        return baseColor.withAlpha(alpha * 0.7); // Max 70% opacity
      }, false)
    );

    const entity = this.viewer.entities.add({
      position,
      ellipse: {
        semiMajorAxis,
        semiMinorAxis: semiMajorAxis, // Circular ring
        fill: false,
        outline: true,
        outlineColor: new Cesium.CallbackProperty(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          const alpha = 1 - progress;
          return baseColor.withAlpha(alpha);
        }, false),
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    visualization.rings.push({
      entity,
      startTime,
      duration: durationMs,
      maxRadius: maxRadiusM,
    });
  }

  /** Start animation loop */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animationLoop();
    console.log("[RingAnimation] Started");
  }

  /** Stop animation loop */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log("[RingAnimation] Stopped");
  }

  /** Animation loop - manages ring lifecycle */
  private animationLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();

    for (const visualization of this.visualizations.values()) {
      if (!visualization.isActive) continue;

      const config = getMagnitudeConfig(visualization.data.magnitude);
      const ringSpawnInterval = config.animationDuration * 1000 * RING_SPAWN_RATIO;

      // Spawn new ring if needed
      if (
        visualization.rings.length < config.ringCount &&
        now - visualization.lastRingSpawn >= ringSpawnInterval
      ) {
        this.spawnRing(visualization, config);
        visualization.lastRingSpawn = now;
      }

      // Remove completed rings and spawn new ones to maintain count
      const completedRings: RingState[] = [];
      
      for (const ring of visualization.rings) {
        const elapsed = now - ring.startTime;
        if (elapsed >= ring.duration) {
          completedRings.push(ring);
        }
      }

      for (const ring of completedRings) {
        if (this.viewer) {
          this.viewer.entities.remove(ring.entity);
        }
        const idx = visualization.rings.indexOf(ring);
        if (idx >= 0) {
          visualization.rings.splice(idx, 1);
        }
        
        // Spawn replacement ring
        if (visualization.isActive && visualization.rings.length < config.ringCount) {
          this.spawnRing(visualization, config);
          visualization.lastRingSpawn = now;
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animationLoop);
  };

  /** Remove visualization for an earthquake */
  removeVisualization(earthquakeId: string): void {
    const visualization = this.visualizations.get(earthquakeId);
    if (!visualization || !this.viewer) return;

    visualization.isActive = false;

    // Remove all ring entities
    for (const ring of visualization.rings) {
      this.viewer.entities.remove(ring.entity);
    }

    // Remove epicenter
    this.viewer.entities.remove(visualization.epicenter.entity);

    // Remove label
    this.viewer.entities.remove(visualization.labelEntity);

    this.visualizations.delete(earthquakeId);
    console.log(`[RingAnimation] Removed visualization: ${earthquakeId}`);
  }

  /** Check if earthquake is being visualized */
  hasVisualization(earthquakeId: string): boolean {
    return this.visualizations.has(earthquakeId);
  }

  /** Get all active visualization IDs */
  getActiveIds(): string[] {
    return Array.from(this.visualizations.keys());
  }

  /** Get count of active visualizations */
  getActiveCount(): number {
    return this.visualizations.size;
  }

  /** Clean up all resources */
  destroy(): void {
    this.stop();

    for (const id of this.visualizations.keys()) {
      this.removeVisualization(id);
    }

    this.visualizations.clear();
    this.viewer = null;
    console.log("[RingAnimation] Destroyed");
  }
}
