/**
 * WorldView - Seismic Layer
 * Earthquake visualization with animated expanding rings
 * Uses Entity API (low count) with CallbackProperty for smooth animation
 */

import { createEffect, onCleanup, createSignal, on } from "solid-js";
import { useCesium } from "../../cesium/useCesium.ts";
import { usePreRender } from "../../cesium/hooks/usePreRender.ts";
import { groundState, setEarthquakes } from "./store.ts";
import { USGSFetcher, type EarthquakeData } from "../../ground/seismic/USGSFetcher.ts";
import { getMagnitudeConfig } from "../../ground/seismic/RingAnimation.ts";

declare const Cesium: typeof import("cesium");

/** Configuration */
const CONFIG = {
  /** Demo earthquake spawn interval (ms) when no real quakes nearby */
  demoIntervalMs: 30_000,
  /** Demo earthquake minimum magnitude */
  demoMinMagnitude: 2.5,
  /** Demo earthquake maximum magnitude */
  demoMaxMagnitude: 4.5,
  /** Default center for demo quakes (Austin, TX) */
  defaultCenter: { lat: 30.27, lon: -97.74 },
  /** Radius for random demo placement (degrees) */
  placementRadius: 0.15,
  /** Ring spawn ratio relative to duration */
  ringSpawnRatio: 0.35,
};

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

/** Convert km to meters */
const kmToMeters = (km: number) => km * 1000;

/** Ring state for tracking animation */
interface RingState {
  entity: Cesium.Entity;
  startTime: number;
  duration: number;
  maxRadius: number;
}

/** Epicenter state */
interface EpicenterState {
  entity: Cesium.Entity;
  pulseStart: number;
}

/** Complete earthquake visualization */
interface EarthquakeVisualization {
  earthquakeId: string;
  data: EarthquakeData;
  rings: RingState[];
  epicenter: EpicenterState;
  labelEntity: Cesium.Entity;
  lastRingSpawn: number;
  isActive: boolean;
}

/**
 * SeismicLayer - Renders earthquake visualizations with animated rings
 */
export function SeismicLayer() {
  const { viewer, ready } = useCesium();

  const [earthquakes, setLocalEarthquakes] = createSignal<EarthquakeData[]>([]);
  const [visualizations] = createSignal(new Map<string, EarthquakeVisualization>());
  const [viewportCenter, setViewportCenter] = createSignal<{ lat: number; lon: number } | null>(null);

  let fetcher: USGSFetcher | null = null;
  let demoInterval: ReturnType<typeof setInterval> | null = null;
  let currentDemoQuake: EarthquakeData | null = null;
  let demoIdCounter = 0;

  /**
   * Create pulsing epicenter point
   */
  function createEpicenter(
    position: Cesium.Cartesian3,
    colorStr: string
  ): EpicenterState {
    const v = viewer();
    if (!v) throw new Error("Viewer not available");

    const now = performance.now();
    const baseColor = Cesium.Color.fromCssColorString(colorStr);

    // Pulsing scale via CallbackProperty
    const pulseScale = new Cesium.CallbackProperty(() => {
      const elapsed = (performance.now() - now) / 1000;
      const pulse = 0.8 + 0.4 * Math.sin(elapsed * 4);
      return 8 * pulse;
    }, false);

    const entity = v.entities.add({
      position,
      point: {
        pixelSize: pulseScale as unknown as number,
        color: baseColor,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    return { entity, pulseStart: now };
  }

  /**
   * Spawn an expanding ring for an earthquake
   */
  function spawnRing(visualization: EarthquakeVisualization): void {
    const v = viewer();
    if (!v) return;

    const config = getMagnitudeConfig(visualization.data.magnitude);
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
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      return Math.max(100, maxRadiusM * eased);
    }, false);

    // Animated outline color (fades)
    const outlineColor = new Cesium.CallbackProperty(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const alpha = 1 - progress;
      return baseColor.withAlpha(alpha);
    }, false);

    const entity = v.entities.add({
      position,
      ellipse: {
        semiMajorAxis: semiMajorAxis as unknown as number,
        semiMinorAxis: semiMajorAxis as unknown as number,
        fill: false,
        outline: true,
        outlineColor: outlineColor as unknown as Cesium.Color,
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

  /**
   * Create visualization for an earthquake
   */
  function createVisualization(earthquake: EarthquakeData): EarthquakeVisualization | null {
    const v = viewer();
    if (!v) return null;

    const vizMap = visualizations();
    if (vizMap.has(earthquake.id)) {
      return vizMap.get(earthquake.id)!;
    }

    const config = getMagnitudeConfig(earthquake.magnitude);
    const position = Cesium.Cartesian3.fromDegrees(
      earthquake.longitude,
      earthquake.latitude,
      0
    );

    // Create epicenter
    const epicenter = createEpicenter(position, config.color);

    // Create label
    const labelText = earthquake.isSimulated
      ? `M${earthquake.magnitude.toFixed(1)} - SIMULATED`
      : `M${earthquake.magnitude.toFixed(1)} - ${earthquake.place}`;

    const labelEntity = v.entities.add({
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
    spawnRing(visualization);
    visualization.lastRingSpawn = performance.now();

    vizMap.set(earthquake.id, visualization);

    console.log(`[SeismicLayer] Created visualization for M${earthquake.magnitude.toFixed(1)} at ${earthquake.place}`);
    return visualization;
  }

  /**
   * Remove visualization for an earthquake
   */
  function removeVisualization(earthquakeId: string): void {
    const v = viewer();
    const vizMap = visualizations();
    const visualization = vizMap.get(earthquakeId);

    if (!visualization || !v) return;

    visualization.isActive = false;

    // Remove ring entities
    for (const ring of visualization.rings) {
      v.entities.remove(ring.entity);
    }

    // Remove epicenter and label
    v.entities.remove(visualization.epicenter.entity);
    v.entities.remove(visualization.labelEntity);

    vizMap.delete(earthquakeId);
    console.log(`[SeismicLayer] Removed visualization: ${earthquakeId}`);
  }

  /**
   * Handle earthquake data updates
   */
  function handleEarthquakeUpdate(data: EarthquakeData[]): void {
    if (!groundState.seismicEnabled) return;

    const vizMap = visualizations();
    const currentIds = new Set(vizMap.keys());
    const newIds = new Set(data.map((eq) => eq.id));

    // Remove visualizations for earthquakes no longer in data (keep demo quakes)
    for (const id of currentIds) {
      if (!newIds.has(id) && !id.startsWith("demo-")) {
        removeVisualization(id);
      }
    }

    // Add visualizations for new earthquakes
    for (const eq of data) {
      if (!vizMap.has(eq.id)) {
        createVisualization(eq);
      }
    }

    // Update store
    setEarthquakes(data);
    setLocalEarthquakes(data);

    // Check for demo fallback
    checkDemoFallback(data);
  }

  /**
   * Check if demo fallback is needed
   */
  function checkDemoFallback(realEarthquakes: EarthquakeData[]): void {
    if (realEarthquakes.length > 0) {
      stopDemoFallback();
      return;
    }

    if (!demoInterval) {
      startDemoFallback();
    }
  }

  /**
   * Start demo fallback mode
   */
  function startDemoFallback(): void {
    if (demoInterval) return;

    console.log("[SeismicLayer] Starting demo fallback mode");
    spawnDemoEarthquake();

    demoInterval = setInterval(() => {
      spawnDemoEarthquake();
    }, CONFIG.demoIntervalMs);
  }

  /**
   * Stop demo fallback mode
   */
  function stopDemoFallback(): void {
    if (!demoInterval) return;

    clearInterval(demoInterval);
    demoInterval = null;

    if (currentDemoQuake) {
      removeVisualization(currentDemoQuake.id);
      currentDemoQuake = null;
    }

    console.log("[SeismicLayer] Stopped demo fallback mode");
  }

  /**
   * Spawn a demo earthquake
   */
  function spawnDemoEarthquake(): void {
    if (currentDemoQuake) {
      removeVisualization(currentDemoQuake.id);
    }

    const center = viewportCenter() ?? CONFIG.defaultCenter;

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * CONFIG.placementRadius;
    const lat = center.lat + radius * Math.sin(angle);
    const lon = center.lon + radius * Math.cos(angle);

    const magnitude =
      CONFIG.demoMinMagnitude +
      Math.random() * (CONFIG.demoMaxMagnitude - CONFIG.demoMinMagnitude);

    const place = DEMO_LOCATIONS[Math.floor(Math.random() * DEMO_LOCATIONS.length)] ?? "Unknown";

    demoIdCounter++;
    const demoQuake: EarthquakeData = {
      id: `demo-${demoIdCounter}`,
      magnitude: Math.round(magnitude * 10) / 10,
      place,
      time: new Date(),
      longitude: lon,
      latitude: lat,
      depth: 5 + Math.random() * 10,
      isSimulated: true,
    };

    currentDemoQuake = demoQuake;
    createVisualization(demoQuake);

    console.log(`[SeismicLayer] Demo earthquake: M${demoQuake.magnitude} at ${demoQuake.place}`);
  }

  /**
   * Update viewport center from camera
   */
  function updateViewportCenter(): void {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const camera = v.camera;
    const ellipsoid = v.scene.globe.ellipsoid;

    // Get center of screen
    const center = new Cesium.Cartesian2(
      v.scene.canvas.clientWidth / 2,
      v.scene.canvas.clientHeight / 2
    );

    const ray = camera.getPickRay(center);
    if (!ray) return;

    const position = v.scene.globe.pick(ray, v.scene);
    if (!position) return;

    const cartographic = ellipsoid.cartesianToCartographic(position);
    if (!cartographic) return;

    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);

    setViewportCenter({ lat, lon });
    fetcher?.setViewportCenter(lat, lon);
  }

  // Animation loop via preRender
  usePreRender(() => {
    if (!groundState.seismicEnabled) return;

    const vizMap = visualizations();
    const now = performance.now();

    for (const visualization of vizMap.values()) {
      if (!visualization.isActive) continue;

      const config = getMagnitudeConfig(visualization.data.magnitude);
      const ringSpawnInterval = config.animationDuration * 1000 * CONFIG.ringSpawnRatio;

      // Spawn new ring if needed
      if (
        visualization.rings.length < config.ringCount &&
        now - visualization.lastRingSpawn >= ringSpawnInterval
      ) {
        spawnRing(visualization);
        visualization.lastRingSpawn = now;
      }

      // Remove completed rings and spawn replacements
      const completedRings: RingState[] = [];

      for (const ring of visualization.rings) {
        const elapsed = now - ring.startTime;
        if (elapsed >= ring.duration) {
          completedRings.push(ring);
        }
      }

      const v = viewer();
      for (const ring of completedRings) {
        if (v) {
          v.entities.remove(ring.entity);
        }
        const idx = visualization.rings.indexOf(ring);
        if (idx >= 0) {
          visualization.rings.splice(idx, 1);
        }

        // Spawn replacement
        if (visualization.isActive && visualization.rings.length < config.ringCount) {
          spawnRing(visualization);
          visualization.lastRingSpawn = now;
        }
      }
    }
  });

  // Initialize fetcher and polling
  createEffect(() => {
    if (!ready()) return;

    fetcher = new USGSFetcher();

    fetcher.startPolling((data) => {
      handleEarthquakeUpdate(data);
    });

    // Set up camera change listener
    const v = viewer();
    if (v && !v.isDestroyed()) {
      v.camera.moveEnd.addEventListener(updateViewportCenter);
      updateViewportCenter();
    }

    console.log("[SeismicLayer] Initialized");
  });

  // Handle enabled state changes
  createEffect(
    on(
      () => groundState.seismicEnabled,
      (enabled) => {
        const vizMap = visualizations();

        if (!enabled) {
          // Hide all visualizations
          for (const id of vizMap.keys()) {
            removeVisualization(id);
          }
          stopDemoFallback();
        } else {
          // Re-fetch and show
          const cached = fetcher?.getCachedNearViewport() ?? [];
          handleEarthquakeUpdate(cached);
        }
      }
    )
  );

  // Cleanup
  onCleanup(() => {
    const v = viewer();
    if (v && !v.isDestroyed()) {
      v.camera.moveEnd.removeEventListener(updateViewportCenter);
    }

    stopDemoFallback();
    fetcher?.destroy();

    // Remove all visualizations
    const vizMap = visualizations();
    for (const id of vizMap.keys()) {
      removeVisualization(id);
    }

    console.log("[SeismicLayer] Unmounted");
  });

  return null;
}

export default SeismicLayer;
