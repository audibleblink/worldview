/**
 * WorldView - Satellite Layer
 *
 * SolidJS component that renders satellites on the Cesium globe.
 * Features: TLE fetch, SGP4 propagation, billboard rendering,
 * category filtering, selection, follow mode, orbital paths.
 */

import { onMount, onCleanup, createEffect, on, createSignal } from "solid-js";
import * as satellite from "satellite.js";
import { useCesium } from "../../cesium/useCesium";
import { usePreRender } from "../../cesium/hooks/usePreRender";
import { useFollowMode } from "../../cesium/hooks/useFollowMode";
import { createBillboardCollection } from "../../cesium/createBillboardCollection";
import { PROXY_ENDPOINTS } from "../../config";
import { selectEntity, clearSelection, selection, type SatelliteData } from "../../stores/selection";
import {
  satelliteState,
  setSatellites,
  setLoading,
  setError,
  followSatellite,
  unfollowSatellite,
  getSatelliteByNoradId,
} from "./store";
import {
  type SatelliteRecord,
  type SatelliteCategory,
  type SatellitePosition,
  CATEGORY_TO_GROUPS,
  CATEGORY_COLORS,
  BILLBOARD_SIZE_NORMAL,
  BILLBOARD_SIZE_SELECTED,
  POSITION_UPDATE_INTERVAL_MS,
  FOLLOW_RANGE_METERS,
} from "./types";

declare const Cesium: typeof import("cesium");

// Cache satellite positions for follow mode and selection
const satellitePositions = new Map<string, Cesium.Cartesian3>();

/**
 * Parse TLE text into satellite records
 */
function parseTLEText(text: string, category: SatelliteCategory): SatelliteRecord[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: SatelliteRecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i]!;
    const line1 = lines[i + 1]!;
    const line2 = lines[i + 2]!;

    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec.error !== 0) continue;

    // NORAD catalog number: columns 3–7 (0-indexed chars 2–6)
    const noradId = line1.substring(2, 7).trim();
    const colorStr = CATEGORY_COLORS[category];
    const color = Cesium.Color.fromCssColorString(colorStr);

    records.push({ name, noradId, line1, line2, category, satrec, color });
  }

  return records;
}

/**
 * Fetch TLEs for a category from the proxy
 */
async function fetchTLEs(category: SatelliteCategory): Promise<SatelliteRecord[]> {
  const groups = CATEGORY_TO_GROUPS[category];
  const allRecords: SatelliteRecord[] = [];

  for (const group of groups) {
    const url = PROXY_ENDPOINTS.tle(group);
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error(`[SatelliteLayer] Failed to fetch TLEs for "${group}": ${res.status}`);
      continue;
    }

    const text = await res.text();
    allRecords.push(...parseTLEText(text, category));
  }

  return allRecords;
}

/**
 * Load all TLE categories
 */
async function loadAllTLEs(): Promise<SatelliteRecord[]> {
  const categories: SatelliteCategory[] = ["stations", "military", "starlink", "gnss", "research"];
  const results = await Promise.all(categories.map((cat) => fetchTLEs(cat)));
  return results.flat();
}

/**
 * Propagate all satellites to their current positions
 */
function propagateAll(records: SatelliteRecord[], date: Date): SatellitePosition[] {
  const gmst = satellite.gstime(date);
  const results: SatellitePosition[] = [];

  for (const record of records) {
    const result = satellite.propagate(record.satrec, date);
    if (!result?.position || typeof result.position === "boolean") continue;

    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    const cartesian = Cesium.Cartesian3.fromRadians(
      geo.longitude,
      geo.latitude,
      geo.height * 1000
    );

    // Compute velocity if available
    let velocityKmS: number | undefined;
    if (result.velocity && typeof result.velocity !== "boolean") {
      const { x, y, z } = result.velocity;
      velocityKmS = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    }

    results.push({ record, cartesian, velocityKmS });
  }

  return results;
}

/**
 * Compute orbital path for a satellite (one full orbit)
 */
function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  // Period in minutes: satrec.no is mean motion in rad/min → T = 2π / no
  const periodMinutes = (2 * Math.PI) / record.satrec.no;
  const stepMinutes = 1;
  const steps = Math.ceil(periodMinutes / stepMinutes);
  const now = new Date();
  const positions: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = new Date(now.getTime() + i * stepMinutes * 60_000);
    const result = satellite.propagate(record.satrec, t);
    if (!result?.position || typeof result.position === "boolean") continue;

    const gmst = satellite.gstime(t);
    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    positions.push(Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000));
  }

  return positions;
}

/**
 * Create a satellite sprite texture
 * Draws a satellite shape (body with solar panels) in white for color tinting.
 */
function createSatelliteTexture(): string {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const centerX = size / 2;
  const centerY = size / 2;

  // Draw subtle glow behind
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;

  // Central body (rectangle)
  const bodyWidth = 6;
  const bodyHeight = 8;
  ctx.fillRect(centerX - bodyWidth / 2, centerY - bodyHeight / 2, bodyWidth, bodyHeight);

  // Left solar panel
  ctx.fillRect(centerX - 14, centerY - 3, 10, 6);

  // Right solar panel
  ctx.fillRect(centerX + 4, centerY - 3, 10, 6);

  // Panel grid lines
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 0.5;

  // Left panel lines
  ctx.beginPath();
  ctx.moveTo(centerX - 9, centerY - 3);
  ctx.lineTo(centerX - 9, centerY + 3);
  ctx.moveTo(centerX - 14, centerY);
  ctx.lineTo(centerX - 4, centerY);
  ctx.stroke();

  // Right panel lines
  ctx.beginPath();
  ctx.moveTo(centerX + 9, centerY - 3);
  ctx.lineTo(centerX + 9, centerY + 3);
  ctx.moveTo(centerX + 4, centerY);
  ctx.lineTo(centerX + 14, centerY);
  ctx.stroke();

  return canvas.toDataURL();
}

/**
 * SatelliteLayer - Renders satellites on the globe
 */
export function SatelliteLayer() {
  const { viewer, ready } = useCesium();
  const { track, stop: stopFollow, isFollowing } = useFollowMode();
  const { add, remove, update, get, clear, collection } = createBillboardCollection();

  // Local state
  const [selectedNoradId, setSelectedNoradId] = createSignal<string | null>(null);
  const [satelliteTexture, setSatelliteTexture] = createSignal<string | null>(null);
  
  // Refs for cleanup
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let orbitalPathEntity: Cesium.Entity | null = null;
  let screenSpaceHandler: Cesium.ScreenSpaceEventHandler | null = null;

  // Initialize texture
  onMount(() => {
    setSatelliteTexture(createSatelliteTexture());
  });

  // Load TLEs when viewer is ready
  createEffect(
    on(ready, async (isReady) => {
      if (!isReady) return;

      console.log("[SatelliteLayer] Loading TLEs...");
      setLoading(true);

      try {
        const records = await loadAllTLEs();
        setSatellites(records);
        console.log(`[SatelliteLayer] Loaded ${records.length} satellites`);
      } catch (err) {
        console.error("[SatelliteLayer] Failed to load TLEs:", err);
        setError(err instanceof Error ? err.message : "Failed to load TLEs");
      }
    })
  );

  // Create billboards when records change
  createEffect(() => {
    const records = satelliteState.records;
    const texture = satelliteTexture();
    if (!records.length || !texture) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    console.log(`[SatelliteLayer] Creating ${records.length} billboards`);

    // Clear existing billboards
    clear();
    satellitePositions.clear();

    // Propagate and create billboards
    const positions = propagateAll(records, new Date());

    for (const { record, cartesian } of positions) {
      add({
        id: record.noradId,
        position: cartesian,
        image: texture,
        scale: BILLBOARD_SIZE_NORMAL / 32, // Scale relative to texture size
        color: record.color,
        show: !satelliteState.hiddenCategories.has(record.category),
        data: record,
      });
      satellitePositions.set(record.noradId, cartesian);
    }

    // Start position update interval
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(() => {
      updatePositions();
    }, POSITION_UPDATE_INTERVAL_MS);
  });

  // Update billboard visibility when hidden categories change
  createEffect(() => {
    const hiddenCategories = satelliteState.hiddenCategories;
    const records = satelliteState.records;

    for (const record of records) {
      const visible = !hiddenCategories.has(record.category);
      update(record.noradId, { show: visible });
    }

    // Deselect if selected satellite's category is now hidden
    const currentSelected = selectedNoradId();
    if (currentSelected) {
      const record = getSatelliteByNoradId(currentSelected);
      if (record && hiddenCategories.has(record.category)) {
        deselectSatellite();
      }
    }
  });

  /**
   * Update all satellite positions
   */
  function updatePositions() {
    const records = satelliteState.records;
    if (!records.length) return;

    const positions = propagateAll(records, new Date());

    for (const { record, cartesian } of positions) {
      update(record.noradId, { position: cartesian });
      satellitePositions.set(record.noradId, cartesian);
    }
  }

  /**
   * Select a satellite by NORAD ID
   */
  function selectSatellite(noradId: string) {
    // Deselect previous if any
    deselectSatellite();

    const record = getSatelliteByNoradId(noradId);
    if (!record) return;

    setSelectedNoradId(noradId);

    // Update billboard size
    update(noradId, { scale: BILLBOARD_SIZE_SELECTED / 32 });

    // Compute velocity
    const now = new Date();
    const result = satellite.propagate(record.satrec, now);
    let velocityKmS = 0;
    if (result?.velocity && typeof result.velocity !== "boolean") {
      const { x, y, z } = result.velocity;
      velocityKmS = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    }

    // Get position
    const position = satellitePositions.get(noradId);
    let lat = 0, lng = 0, alt = 0;
    if (position) {
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      lat = Cesium.Math.toDegrees(cartographic.latitude);
      lng = Cesium.Math.toDegrees(cartographic.longitude);
      alt = cartographic.height;
    }

    // Update selection store
    const selectionData: SatelliteData = {
      noradId: record.noradId,
      name: record.name,
      category: record.category,
      position: { lat, lng, alt },
      velocity: velocityKmS ? { x: velocityKmS, y: 0, z: 0 } : undefined,
      tle: { line1: record.line1, line2: record.line2 },
    };
    selectEntity("satellite", noradId, selectionData);

    // Create orbital path
    const v = viewer();
    if (v && !v.isDestroyed()) {
      const path = computeOrbitalPath(record);
      if (path.length > 1) {
        orbitalPathEntity = v.entities.add({
          polyline: {
            positions: path,
            width: 1.5,
            material: new Cesium.ColorMaterialProperty(record.color.withAlpha(0.5)),
            arcType: Cesium.ArcType.NONE,
          },
        });
      }
    }

    console.log(`[SatelliteLayer] Selected satellite: ${record.name} (${noradId})`);
  }

  /**
   * Deselect current satellite
   */
  function deselectSatellite() {
    const current = selectedNoradId();
    if (current) {
      // Reset billboard size
      update(current, { scale: BILLBOARD_SIZE_NORMAL / 32 });
      setSelectedNoradId(null);
    }

    // Remove orbital path
    const v = viewer();
    if (orbitalPathEntity && v && !v.isDestroyed()) {
      v.entities.remove(orbitalPathEntity);
      orbitalPathEntity = null;
    }

    // Stop follow mode
    if (isFollowing()) {
      stopFollow();
      unfollowSatellite();
    }

    // Clear selection store if it was a satellite
    if (selection.type === "satellite") {
      clearSelection();
    }
  }

  /**
   * Start following the selected satellite
   */
  function startFollowMode() {
    const noradId = selectedNoradId();
    if (!noradId) return;

    followSatellite(noradId);

    track(
      () => satellitePositions.get(noradId) ?? null,
      {
        heading: 0,
        pitch: -Math.PI / 4,
        range: FOLLOW_RANGE_METERS,
      }
    );

    console.log(`[SatelliteLayer] Following satellite: ${noradId}`);
  }

  // Setup click handler for satellite selection
  createEffect(
    on(ready, (isReady) => {
      if (!isReady) return;

      const v = viewer();
      if (!v || v.isDestroyed()) return;

      // Create screen space event handler
      screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

      screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
        const pickedObject = v.scene.pick(click.position);

        if (Cesium.defined(pickedObject) && pickedObject.id) {
          // Check if it's a billboard with a noradId
          const id = pickedObject.id;
          if (typeof id === "string" && getSatelliteByNoradId(id)) {
            selectSatellite(id);
            return;
          }
        }

        // Clicked on nothing - deselect
        if (selectedNoradId()) {
          deselectSatellite();
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Double-click to follow
      screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
        const pickedObject = v.scene.pick(click.position);

        if (Cesium.defined(pickedObject) && pickedObject.id) {
          const id = pickedObject.id;
          if (typeof id === "string" && getSatelliteByNoradId(id)) {
            if (selectedNoradId() !== id) {
              selectSatellite(id);
            }
            startFollowMode();
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    })
  );

  // React to external selection changes (e.g., from command bar)
  createEffect(() => {
    if (selection.type === "satellite" && selection.id && selection.id !== selectedNoradId()) {
      selectSatellite(selection.id);
    } else if (selection.type !== "satellite" && selectedNoradId()) {
      // Something else selected, deselect our satellite
      const current = selectedNoradId();
      if (current) {
        update(current, { scale: BILLBOARD_SIZE_NORMAL / 32 });
        setSelectedNoradId(null);
        
        // Remove orbital path
        const v = viewer();
        if (orbitalPathEntity && v && !v.isDestroyed()) {
          v.entities.remove(orbitalPathEntity);
          orbitalPathEntity = null;
        }

        if (isFollowing()) {
          stopFollow();
          unfollowSatellite();
        }
      }
    }
  });

  // React to follow state from store (e.g., from UI button)
  createEffect(() => {
    const followId = satelliteState.followingNoradId;
    if (followId && selectedNoradId() === followId && !isFollowing()) {
      startFollowMode();
    } else if (!followId && isFollowing()) {
      stopFollow();
    }
  });

  // Cleanup
  onCleanup(() => {
    console.log("[SatelliteLayer] Cleaning up");

    // Clear interval
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    // Remove orbital path
    const v = viewer();
    if (orbitalPathEntity && v && !v.isDestroyed()) {
      v.entities.remove(orbitalPathEntity);
      orbitalPathEntity = null;
    }

    // Destroy screen space handler
    if (screenSpaceHandler) {
      screenSpaceHandler.destroy();
      screenSpaceHandler = null;
    }

    // Stop follow mode
    if (isFollowing()) {
      stopFollow();
    }

    // Clear billboard collection (handled by createBillboardCollection cleanup)
    satellitePositions.clear();
  });

  // Layers don't render DOM - they add primitives to Cesium
  return null;
}

export default SatelliteLayer;
