/**
 * WorldView - Traffic Layer
 * Animated particles flowing along road networks using PointPrimitiveCollection
 */

import { createEffect, onCleanup, createSignal, on } from "solid-js";
import { createPointCollection } from "../../cesium/createPointCollection.ts";
import { usePreRender } from "../../cesium/hooks/usePreRender.ts";
import { useCesium } from "../../cesium/useCesium.ts";
import { useCamera } from "../../cesium/hooks/useCamera.ts";
import { groundState, setTrafficLoading, setTrafficError } from "./store.ts";
import { PROXY_ENDPOINTS } from "../../config.ts";
import { RoadNetwork, type RoadSegment } from "../../ground/traffic/RoadNetwork.ts";
import { OSMFetcher } from "../../ground/traffic/OSMFetcher.ts";
import { getRoadColor, toCesiumColor, ROAD_CONFIG } from "../../ground/traffic/particleStyles.ts";
import type { TrafficParticle, StyleMode } from "./types.ts";

declare const Cesium: typeof import("cesium");

/** Configuration */
const CONFIG = {
  maxParticles: 5000,
  baseSpeed: 0.15,
  particleSize: 4,
  minViewportSize: 0.01,
  maxViewportSize: 0.5,
  viewportDebounceMs: 800,
  minReloadDistance: 0.05,
  lodMinAltitude: 500,
  lodMaxAltitude: 50000,
  lodMinVisibleRatio: 0.2,
  updateBatchSize: 500,
  frustumPadding: 0.1,
};

/**
 * TrafficLayer - Renders animated traffic particles along roads
 */
export function TrafficLayer() {
  const { viewer, ready } = useCesium();
  const { getViewportBBox } = useCamera();

  // Local state
  let groundAltitude = 0; // sampled once per road load; particles sit on 3D tile surface
  const [network, setNetwork] = createSignal<RoadNetwork | null>(null);
  const [particles, setParticles] = createSignal<TrafficParticle[]>([]);
  const [lastLoadedBbox, setLastLoadedBbox] = createSignal<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const [lodLevel, setLodLevel] = createSignal(0);
  const [visibleSegments, setVisibleSegments] = createSignal<Set<number>>(new Set());

  // OSM fetcher instance
  let osmFetcher: OSMFetcher | null = null;
  let viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let batchIndex = 0;
  let lastUpdateTime = performance.now();

  // Create point collection for particles
  const pointCollection = createPointCollection({
    defaultPixelSize: CONFIG.particleSize,
    defaultColor: Cesium.Color.CYAN,
  });

  // Initialize OSM fetcher
  createEffect(() => {
    if (!ready()) return;

    osmFetcher = new OSMFetcher();
    osmFetcher.setOnError((error) => {
      setTrafficError(`Traffic data unavailable: ${error.message}`);
    });

    console.log("[TrafficLayer] Initialized");
  });

  // Get viewport bounding box — delegates to useCamera which uses pickEllipsoid
  // (works with globe.show=false / photorealistic 3D tiles)
  function getViewportBbox() {
    return getViewportBBox();
  }

  // Check if viewport changed enough to reload
  function shouldReloadRoads(newBbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  }): boolean {
    const lastBbox = lastLoadedBbox();
    if (!lastBbox) return true;

    const oldCenterLon = (lastBbox.east + lastBbox.west) / 2;
    const oldCenterLat = (lastBbox.north + lastBbox.south) / 2;
    const newCenterLon = (newBbox.east + newBbox.west) / 2;
    const newCenterLat = (newBbox.north + newBbox.south) / 2;

    const distance = Math.sqrt(
      Math.pow(newCenterLon - oldCenterLon, 2) +
        Math.pow(newCenterLat - oldCenterLat, 2)
    );

    return distance > CONFIG.minReloadDistance;
  }

  // Load roads for viewport
  async function loadRoadsForViewport(): Promise<void> {
    if (!osmFetcher || !ready()) return;

    const bbox = getViewportBbox();
    if (!bbox) return; // pickEllipsoid returned null (camera above horizon?) — retry on next moveEnd

    // Check viewport size
    const lonSpan = bbox.east - bbox.west;
    const latSpan = bbox.north - bbox.south;

    if (lonSpan > CONFIG.maxViewportSize || latSpan > CONFIG.maxViewportSize) {
      console.log("[TrafficLayer] Viewport too large - zoom in for traffic");
      return;
    }

    if (lonSpan < CONFIG.minViewportSize || latSpan < CONFIG.minViewportSize) {
      return;
    }

    if (!shouldReloadRoads(bbox)) {
      return;
    }

    setTrafficLoading(true);
    setTrafficError(null);

    try {
      const rawWays = await osmFetcher.fetchRoads(bbox);

      if (rawWays.length === 0) {
        console.warn("[TrafficLayer] No road data available");
        setTrafficLoading(false);
        return;
      }

      const newNetwork = new RoadNetwork(rawWays);
      setNetwork(newNetwork);
      setLastLoadedBbox(bbox);

      // Sample ground height at bbox center so particles sit on 3D tile surface
      // (scene.sampleHeight works for tiles already in view; falls back to 0)
      const v = viewer();
      if (v && !v.isDestroyed()) {
        const centerLat = (bbox.south + bbox.north) / 2;
        const centerLon = (bbox.west + bbox.east) / 2;
        const sampled = v.scene.sampleHeight(
          Cesium.Cartographic.fromDegrees(centerLon, centerLat)
        );
        groundAltitude = sampled ?? 0;
      }

      // Spawn particles
      spawnParticles(newNetwork);

      console.log(
        `[TrafficLayer] Loaded ${newNetwork.segments.length} segments`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTrafficError(message);
      console.error("[TrafficLayer] Failed to load roads:", error);
    } finally {
      setTrafficLoading(false);
    }
  }

  // Spawn particles on the network
  function spawnParticles(roadNetwork: RoadNetwork): void {
    // Clear existing particles
    pointCollection.clear();
    const newParticles: TrafficParticle[] = [];

    const targetCount = CONFIG.maxParticles;
    const defaultConfig = ROAD_CONFIG.residential!;

    // Calculate particles per highway type
    const particlesByType = new Map<string, number>();
    let totalPercent = 0;

    for (const [highway, config] of Object.entries(ROAD_CONFIG)) {
      const segments = roadNetwork.getSegmentsByType(highway);
      if (segments.length > 0) {
        totalPercent += config.densityPercent;
        particlesByType.set(highway, config.densityPercent);
      }
    }

    let particleId = 0;

    // Spawn particles by highway type
    for (const [highway, percent] of particlesByType) {
      const count = Math.floor((percent / totalPercent) * targetCount);
      const segments = roadNetwork.getSegmentsByType(highway);

      if (segments.length === 0) continue;

      const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

      for (let i = 0; i < count; i++) {
        // Pick random segment weighted by length
        let target = Math.random() * totalLength;
        let segment: RoadSegment | null = null;
        let segmentIndex = 0;

        for (let j = 0; j < segments.length; j++) {
          const seg = segments[j];
          if (!seg) continue;
          target -= seg.length;
          if (target <= 0) {
            segment = seg;
            segmentIndex = roadNetwork.segments.indexOf(segment);
            break;
          }
        }

        if (!segment && segments.length > 0) {
          segment = segments[segments.length - 1] ?? null;
          if (segment) {
            segmentIndex = roadNetwork.segments.indexOf(segment);
          }
        }

        if (segment) {
          const progress = Math.random();
          const direction: 1 | -1 = segment.oneway
            ? segment.direction
            : Math.random() < 0.5
              ? 1
              : -1;

          const [lon, lat] = roadNetwork.getPositionOnSegment(segment, progress);
          const color = getRoadColor(segment.highway, groundState.trafficStyle);

          const id = `particle-${particleId++}`;

          // Add to point collection
          pointCollection.add({
            id,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, groundAltitude + 5),
            color: toCesiumColor(color),
            pixelSize: CONFIG.particleSize,
          });

          newParticles.push({
            id,
            segmentIndex,
            progress,
            speed: segment.speedMultiplier * CONFIG.baseSpeed,
            direction,
            visible: true,
          });
        }
      }
    }

    setParticles(newParticles);
    updateVisibleSegments();

    console.log(`[TrafficLayer] Spawned ${newParticles.length} particles`);
  }

  // Update visible segments based on camera frustum
  function updateVisibleSegments(): void {
    const roadNetwork = network();
    if (!roadNetwork) return;

    const bbox = getViewportBbox();
    const visible = new Set<number>();

    if (!bbox) {
      // Camera looking at sky - show all
      for (let i = 0; i < roadNetwork.segments.length; i++) {
        visible.add(i);
      }
    } else {
      const { west, east, south, north } = bbox;

      for (let i = 0; i < roadNetwork.segments.length; i++) {
        const segment = roadNetwork.segments[i];
        if (!segment || segment.points.length === 0) continue;

        const first = segment.points[0]!;
        const last = segment.points[segment.points.length - 1]!;

        const inBounds = (lon: number, lat: number) =>
          lon >= west && lon <= east && lat >= south && lat <= north;

        if (inBounds(first[0], first[1]) || inBounds(last[0], last[1])) {
          visible.add(i);
        }
      }
    }

    setVisibleSegments(visible);
  }

  // Update LOD based on camera altitude
  function updateLOD(): void {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const ellipsoid = v.scene.globe.ellipsoid;
    const cartographic = ellipsoid.cartesianToCartographic(v.camera.position);
    if (!cartographic) return;

    const altitude = cartographic.height;
    let level: number;

    if (altitude <= CONFIG.lodMinAltitude) {
      level = 0;
    } else if (altitude >= CONFIG.lodMaxAltitude) {
      level = 1;
    } else {
      level =
        (altitude - CONFIG.lodMinAltitude) /
        (CONFIG.lodMaxAltitude - CONFIG.lodMinAltitude);
    }

    if (Math.abs(level - lodLevel()) > 0.05) {
      setLodLevel(level);
      applyLOD(level);
    }
  }

  // Apply LOD visibility to particles
  function applyLOD(level: number): void {
    const currentParticles = particles();
    if (currentParticles.length === 0) return;

    const visibleRatio = 1 - level * (1 - CONFIG.lodMinVisibleRatio);
    const targetVisible = Math.floor(currentParticles.length * visibleRatio);

    let visibleCount = 0;

    for (const particle of currentParticles) {
      const shouldBeVisible = visibleCount < targetVisible;

      if (particle.visible !== shouldBeVisible) {
        particle.visible = shouldBeVisible;
        pointCollection.update(particle.id, { show: shouldBeVisible });
      }

      if (shouldBeVisible) visibleCount++;
    }
  }

  // Handle camera movement
  function handleCameraChange(): void {
    if (!groundState.trafficEnabled) return;

    if (viewportDebounceTimer) {
      clearTimeout(viewportDebounceTimer);
    }

    viewportDebounceTimer = setTimeout(() => {
      loadRoadsForViewport();
      updateVisibleSegments();
      updateLOD();
    }, CONFIG.viewportDebounceMs);
  }

  // Update particle physics
  function updateParticles(deltaTime: number): void {
    const roadNetwork = network();
    const currentParticles = particles();

    if (!roadNetwork || currentParticles.length === 0) return;

    const visible = visibleSegments();
    const batchSize = CONFIG.updateBatchSize;
    const adjustedDelta =
      deltaTime * (currentParticles.length / batchSize);

    let processed = 0;
    const updates: Array<{ id: string; options: { position: Cesium.Cartesian3 } }> = [];

    while (processed < batchSize && processed < currentParticles.length) {
      const particle = currentParticles[batchIndex];
      batchIndex = (batchIndex + 1) % currentParticles.length;
      processed++;

      if (!particle || !particle.visible || !visible.has(particle.segmentIndex)) {
        continue;
      }

      const segment = roadNetwork.segments[particle.segmentIndex];
      if (!segment) continue;

      // Update progress
      particle.progress += particle.speed * adjustedDelta * particle.direction;

      // Handle boundary transitions
      if (particle.progress >= 1 || particle.progress <= 0) {
        transitionParticle(particle, segment, roadNetwork);
      }

      // Update position
      const [lon, lat] = roadNetwork.getPositionOnSegment(
        segment,
        Math.max(0, Math.min(1, particle.progress))
      );

      updates.push({
        id: particle.id,
        options: { position: Cesium.Cartesian3.fromDegrees(lon, lat, groundAltitude + 5) },
      });
    }

    // Batch update positions
    pointCollection.batchUpdate(updates);
  }

  // Transition particle between segments
  function transitionParticle(
    particle: TrafficParticle,
    currentSegment: RoadSegment,
    roadNetwork: RoadNetwork
  ): void {
    const connected = roadNetwork.getConnectedSegments(currentSegment.id);

    if (connected.length > 0) {
      const nextSegment =
        connected[Math.floor(Math.random() * connected.length)];
      if (nextSegment) {
        const nextIndex = roadNetwork.segments.indexOf(nextSegment);
        if (nextIndex >= 0) {
          particle.segmentIndex = nextIndex;
          particle.speed = nextSegment.speedMultiplier * CONFIG.baseSpeed;

          if (nextSegment.oneway) {
            particle.direction = nextSegment.direction;
            particle.progress = nextSegment.direction === 1 ? 0 : 1;
          } else {
            particle.progress = particle.direction === 1 ? 0 : 1;
          }
          return;
        }
      }
    }

    // Respawn at random location
    respawnParticle(particle, roadNetwork);
  }

  // Respawn particle at random location
  function respawnParticle(
    particle: TrafficParticle,
    roadNetwork: RoadNetwork
  ): void {
    const segment = roadNetwork.getRandomSegmentWeighted();
    if (!segment) return;

    const segmentIndex = roadNetwork.segments.indexOf(segment);
    if (segmentIndex < 0) return;

    particle.segmentIndex = segmentIndex;
    particle.progress = Math.random();
    particle.speed = segment.speedMultiplier * CONFIG.baseSpeed;
    particle.direction = segment.oneway
      ? segment.direction
      : Math.random() < 0.5
        ? 1
        : -1;
  }

  // Pre-render hook for animation
  usePreRender(() => {
    if (!groundState.trafficEnabled || particles().length === 0) return;

    const now = performance.now();
    const deltaTime = (now - lastUpdateTime) / 1000;
    lastUpdateTime = now;

    updateParticles(deltaTime);
  });

  // Watch for style changes
  createEffect(
    on(
      () => groundState.trafficStyle,
      (style) => {
        const roadNetwork = network();
        const currentParticles = particles();

        if (!roadNetwork || currentParticles.length === 0) return;

        // Update particle colors
        for (const particle of currentParticles) {
          const segment = roadNetwork.segments[particle.segmentIndex];
          if (!segment) continue;

          const color = getRoadColor(segment.highway, style);
          pointCollection.update(particle.id, { color: toCesiumColor(color) });
        }

        console.log(`[TrafficLayer] Style mode set to: ${style}`);
      }
    )
  );

  // Set up camera listener for viewport changes
  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    v.camera.moveEnd.addEventListener(handleCameraChange);

    onCleanup(() => {
      if (!v.isDestroyed()) {
        v.camera.moveEnd.removeEventListener(handleCameraChange);
      }
    });
  });

  // Initial load — deferred by one microtask so createCollectionFactory's own
  // createEffect (which sets up the PointPrimitiveCollection) runs first.
  createEffect(() => {
    if (!ready()) return;
    Promise.resolve().then(() => loadRoadsForViewport());
  });

  // Cleanup
  onCleanup(() => {
    if (viewportDebounceTimer) {
      clearTimeout(viewportDebounceTimer);
    }
    pointCollection.clear();
    console.log("[TrafficLayer] Unmounted");
  });

  return null;
}

export default TrafficLayer;
