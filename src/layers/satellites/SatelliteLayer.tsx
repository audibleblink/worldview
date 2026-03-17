/**
 * Satellite Layer - Renders satellites with TLE/SGP4 propagation
 */

import { onMount, onCleanup, createEffect, on, createSignal } from "solid-js";
import * as satellite from "satellite.js";
import { useCesium } from "../../cesium/useCesium";
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
  CATEGORY_TO_GROUPS,
  CATEGORY_COLORS,
  BILLBOARD_SIZE_NORMAL,
  BILLBOARD_SIZE_SELECTED,
  POSITION_UPDATE_INTERVAL_MS,
  FOLLOW_RANGE_METERS,
} from "./types";

declare const Cesium: typeof import("cesium");

// Position cache for follow mode and selection
const satellitePositions = new Map<string, Cesium.Cartesian3>();

/** Parse TLE text into satellite records */
function parseTLEText(text: string, category: SatelliteCategory): SatelliteRecord[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const records: SatelliteRecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, line1, line2] = [lines[i]!, lines[i + 1]!, lines[i + 2]!];
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec.error !== 0) continue;

    const noradId = line1.substring(2, 7).trim();
    const color = Cesium.Color.fromCssColorString(CATEGORY_COLORS[category]);
    records.push({ name, noradId, line1, line2, category, satrec, color });
  }
  return records;
}

/** Fetch TLEs for a category from the proxy */
async function fetchTLEs(category: SatelliteCategory): Promise<SatelliteRecord[]> {
  const records: SatelliteRecord[] = [];
  for (const group of CATEGORY_TO_GROUPS[category]) {
    const res = await fetch(PROXY_ENDPOINTS.tle(group));
    if (!res.ok) {
      console.error(`[SatelliteLayer] TLE fetch failed for "${group}": ${res.status}`);
      continue;
    }
    records.push(...parseTLEText(await res.text(), category));
  }
  return records;
}

/** Load all TLE categories in parallel */
async function loadAllTLEs(): Promise<SatelliteRecord[]> {
  const categories: SatelliteCategory[] = ["stations", "military", "starlink", "gnss", "research"];
  return (await Promise.all(categories.map(fetchTLEs))).flat();
}

/** Propagate satellites to current positions */
function propagateAll(records: SatelliteRecord[], date: Date) {
  const gmst = satellite.gstime(date);
  return records.flatMap((record) => {
    const result = satellite.propagate(record.satrec, date);
    if (!result?.position || typeof result.position === "boolean") return [];

    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    const cartesian = Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000);

    let velocityKmS: number | undefined;
    if (result.velocity && typeof result.velocity !== "boolean") {
      const { x, y, z } = result.velocity;
      velocityKmS = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    }
    return [{ record, cartesian, velocityKmS }];
  });
}

/** Compute 24-hour orbital path (2-minute steps) */
function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  const positions: Cesium.Cartesian3[] = [];
  const now = Date.now();

  for (let i = 0; i <= 720; i++) {
    const t = new Date(now + i * 2 * 60_000);
    const result = satellite.propagate(record.satrec, t);
    if (!result?.position || typeof result.position === "boolean") continue;

    const gmst = satellite.gstime(t);
    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    positions.push(Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000));
  }
  return positions;
}

/** Create satellite sprite texture (body with solar panels) */
function createSatelliteTexture(): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const c = 16; // center

  // Glow
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, 16);
  gradient.addColorStop(0, "rgba(255,255,255,0.4)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  // Body and panels
  ctx.fillStyle = "#fff";
  ctx.fillRect(c - 3, c - 4, 6, 8);  // body
  ctx.fillRect(c - 14, c - 3, 10, 6); // left panel
  ctx.fillRect(c + 4, c - 3, 10, 6);  // right panel

  // Panel grid lines
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(c - 9, c - 3); ctx.lineTo(c - 9, c + 3);
  ctx.moveTo(c - 14, c); ctx.lineTo(c - 4, c);
  ctx.moveTo(c + 9, c - 3); ctx.lineTo(c + 9, c + 3);
  ctx.moveTo(c + 4, c); ctx.lineTo(c + 14, c);
  ctx.stroke();

  return canvas.toDataURL();
}

export function SatelliteLayer() {
  const { viewer, ready } = useCesium();
  const { track, stop: stopFollow, isFollowing } = useFollowMode();
  const { add, update, clear } = createBillboardCollection();

  const [selectedNoradId, setSelectedNoradId] = createSignal<string | null>(null);
  const [satelliteTexture, setSatelliteTexture] = createSignal<string | null>(null);

  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let orbitalPathEntity: Cesium.Entity | null = null;
  let screenSpaceHandler: Cesium.ScreenSpaceEventHandler | null = null;

  onMount(() => setSatelliteTexture(createSatelliteTexture()));

  // Load TLEs when viewer is ready
  createEffect(on(ready, async (isReady) => {
    if (!isReady) return;
    setLoading(true);
    try {
      const records = await loadAllTLEs();
      setSatellites(records);
      console.log(`[SatelliteLayer] Loaded ${records.length} satellites`);
    } catch (err) {
      console.error("[SatelliteLayer] Failed to load TLEs:", err);
      setError(err instanceof Error ? err.message : "Failed to load TLEs");
    }
  }));

  // Create billboards when records change
  createEffect(() => {
    const records = satelliteState.records;
    const texture = satelliteTexture();
    if (!records.length || !texture) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    clear();
    satellitePositions.clear();

    for (const { record, cartesian } of propagateAll(records, new Date())) {
      add({
        id: record.noradId,
        position: cartesian,
        image: texture,
        scale: BILLBOARD_SIZE_NORMAL / 32,
        color: record.color,
        show: !satelliteState.hiddenCategories.has(record.category),
        data: record,
      });
      satellitePositions.set(record.noradId, cartesian);
    }

    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updatePositions, POSITION_UPDATE_INTERVAL_MS);
  });

  // Update billboard visibility when hidden categories change
  createEffect(() => {
    const { hiddenCategories, records } = satelliteState;
    for (const record of records) {
      update(record.noradId, { show: !hiddenCategories.has(record.category) });
    }
    // Deselect if selected satellite's category is now hidden
    const selected = selectedNoradId();
    if (selected) {
      const record = getSatelliteByNoradId(selected);
      if (record && hiddenCategories.has(record.category)) deselectSatellite();
    }
  });

  function updatePositions() {
    const { records } = satelliteState;
    if (!records.length) return;
    for (const { record, cartesian } of propagateAll(records, new Date())) {
      update(record.noradId, { position: cartesian });
      satellitePositions.set(record.noradId, cartesian);
    }
  }

  function selectSatellite(noradId: string) {
    deselectSatellite();

    const record = getSatelliteByNoradId(noradId);
    if (!record) return;

    setSelectedNoradId(noradId);
    update(noradId, { scale: BILLBOARD_SIZE_SELECTED / 32 });

    // Compute velocity
    const result = satellite.propagate(record.satrec, new Date());
    let velocityKmS = 0;
    if (result?.velocity && typeof result.velocity !== "boolean") {
      const { x, y, z } = result.velocity;
      velocityKmS = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    }

    // Get position
    const position = satellitePositions.get(noradId);
    const { lat, lng, alt } = position
      ? (() => {
          const c = Cesium.Cartographic.fromCartesian(position);
          return { lat: Cesium.Math.toDegrees(c.latitude), lng: Cesium.Math.toDegrees(c.longitude), alt: c.height };
        })()
      : { lat: 0, lng: 0, alt: 0 };

    selectEntity("satellite", noradId, {
      noradId: record.noradId,
      name: record.name,
      category: record.category,
      position: { lat, lng, alt },
      velocity: velocityKmS ? { x: velocityKmS, y: 0, z: 0 } : undefined,
      tle: { line1: record.line1, line2: record.line2 },
    } as SatelliteData);

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
  }

  function deselectSatellite() {
    const current = selectedNoradId();
    if (current) {
      update(current, { scale: BILLBOARD_SIZE_NORMAL / 32 });
      setSelectedNoradId(null);
    }

    const v = viewer();
    if (orbitalPathEntity && v && !v.isDestroyed()) {
      v.entities.remove(orbitalPathEntity);
      orbitalPathEntity = null;
    }

    if (isFollowing()) {
      stopFollow();
      unfollowSatellite();
    }

    if (selection.type === "satellite") clearSelection();
  }

  function startFollowMode() {
    const noradId = selectedNoradId();
    if (!noradId) return;

    const record = getSatelliteByNoradId(noradId);
    if (!record) return;

    // Ensure position cache is populated
    if (!satellitePositions.has(noradId)) {
      const positions = propagateAll([record], new Date());
      if (positions[0]) satellitePositions.set(noradId, positions[0].cartesian);
    }

    followSatellite(noradId);
    track(() => satellitePositions.get(noradId) ?? null, {
      heading: 0,
      pitch: -Math.PI / 4,
      range: FOLLOW_RANGE_METERS,
    });
  }

  // Setup click handler for satellite selection
  createEffect(on(ready, (isReady) => {
    if (!isReady) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = v.scene.pick(click.position);
      const id = picked?.id;
      if (typeof id === "string" && getSatelliteByNoradId(id)) {
        selectSatellite(id);
      } else if (selectedNoradId()) {
        deselectSatellite();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = v.scene.pick(click.position);
      const id = picked?.id;
      if (typeof id === "string" && getSatelliteByNoradId(id)) {
        if (selectedNoradId() !== id) selectSatellite(id);
        startFollowMode();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }));

  // React to external selection changes (e.g., from command bar)
  createEffect(() => {
    if (selection.type === "satellite" && selection.id && selection.id !== selectedNoradId()) {
      selectSatellite(selection.id);
    } else if (selection.type !== "satellite" && selectedNoradId()) {
      deselectSatellite();
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

  onCleanup(() => {
    if (updateInterval) clearInterval(updateInterval);

    const v = viewer();
    if (orbitalPathEntity && v && !v.isDestroyed()) {
      v.entities.remove(orbitalPathEntity);
    }

    if (screenSpaceHandler) screenSpaceHandler.destroy();
    if (isFollowing()) stopFollow();

    satellitePositions.clear();
  });

  return null;
}
