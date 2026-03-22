/**
 * WorldView - Ship Layer (SolidJS)
 *
 * Phase 6 implementation: Full ship rendering with BillboardCollection.
 * 
 * Key improvements over old code:
 * - Uses BillboardCollection (1 draw call) instead of Entity API (200+ draw calls)
 * - Uses separate LabelCollection for ship names
 * - Interpolates ALL visible ships (old code capped at 60)
 * - Uses useFollowMode hook instead of copy-pasted listener
 * - Uses PROXY_BASE_URL from config.ts
 */

import { onCleanup, createEffect, createSignal, on } from "solid-js";
import { useCesium } from "../../cesium/useCesium";
import { createBillboardCollection } from "../../cesium/createBillboardCollection";
import { useCamera } from "../../cesium/hooks/useCamera";
import { usePreRender } from "../../cesium/hooks/usePreRender";
import { useFollowMode } from "../../cesium/hooks/useFollowMode";
import { PROXY_ENDPOINTS } from "../../config";
import { selectEntity, clearSelection, type ShipData } from "../../stores/selection";
import {
  shipState,
  setShips,
  updateShips,
  setLoading,
  setError,
  setConnected,
  setRateLimited,
  setLastBbox,
  selectShip,
  followShip,
  unfollowShip,
  getShipByMmsi,
  clearShips,
  type ShipRecord,
  type BBox,
} from "./store";

declare const Cesium: typeof import("cesium");

// ==================== CONSTANTS ====================

const SHIP_UPDATE_INTERVAL = 8_000;        // 8 seconds between polls
const SHIP_RATE_LIMITED_INTERVAL = 15_000; // 15 seconds when rate limited
const SHIP_RATE_LIMIT_RECOVERY_MS = 60_000; // 60 seconds before resuming normal polling
const SHIP_INTERP_CAP = 60;                // seconds max dead-reckoning
const SHIP_FOLLOW_RANGE = 10_000;          // meters
const SHIP_FOLLOW_PITCH = -30;             // degrees
const SHIP_LABEL_VISIBLE_DISTANCE = 150_000; // meters - labels hidden beyond this
const MAX_VISIBLE_SHIPS = 100;
const VIEWPORT_FALLBACK_DEGREES = 20;      // fallback bbox size when viewport unavailable
const CAMERA_MOVE_DEBOUNCE_MS = 1500;      // debounce camera movement

// Billboard settings
const BILLBOARD_SCALE = 0.5;
const BILLBOARD_SCALE_SELECTED = 0.75;

// Ship type color hex codes
const SHIP_COLOR_HEX: Record<string, string> = {
  cargo: "#3B82F6",     // Blue
  tanker: "#EF4444",    // Red
  passenger: "#22C55E", // Green
  fishing: "#F97316",   // Orange
  other: "#9CA3AF",     // Gray
};

// ==================== LAZY-INITIALIZED CACHES ====================

// Lazy-initialized Cesium colors (Cesium is a browser global)
let shipColorsCache: Record<string, Cesium.Color> | null = null;

function getShipColors(): Record<string, Cesium.Color> {
  if (!shipColorsCache) {
    shipColorsCache = {
      cargo: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.cargo!),
      tanker: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.tanker!),
      passenger: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.passenger!),
      fishing: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.fishing!),
      other: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.other!),
    };
  }
  return shipColorsCache;
}

// Lazy-initialized ship icons (uses document.createElement)
let shipIconsCache: Record<string, string> | null = null;

function getShipIcons(): Record<string, string> {
  if (!shipIconsCache) {
    shipIconsCache = {
      cargo: createShipIconDataUrl("cargo"),
      tanker: createShipIconDataUrl("tanker"),
      passenger: createShipIconDataUrl("passenger"),
      fishing: createShipIconDataUrl("fishing"),
      other: createShipIconDataUrl("other"),
    };
  }
  return shipIconsCache;
}

/**
 * Create a simple ship icon as a data URL
 * Returns a 32x32 white ship silhouette
 */
function createShipIconDataUrl(type: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;

  ctx.beginPath();
  
  switch (type) {
    case "cargo":
      // Container ship - rectangular with pointed bow
      ctx.moveTo(16, 2);
      ctx.lineTo(26, 12);
      ctx.lineTo(26, 28);
      ctx.lineTo(6, 28);
      ctx.lineTo(6, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(10, 20, 12, 6);
      break;

    case "tanker":
      // Tanker - longer, bulkier
      ctx.moveTo(16, 2);
      ctx.lineTo(24, 8);
      ctx.lineTo(26, 14);
      ctx.lineTo(26, 28);
      ctx.lineTo(6, 28);
      ctx.lineTo(6, 14);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#CCCCCC";
      ctx.beginPath();
      ctx.arc(16, 12, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(16, 20, 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "passenger":
      // Cruise ship - elegant with multiple decks
      ctx.moveTo(16, 2);
      ctx.lineTo(22, 8);
      ctx.lineTo(24, 14);
      ctx.lineTo(24, 26);
      ctx.lineTo(8, 26);
      ctx.lineTo(8, 14);
      ctx.lineTo(10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(10, 10, 12, 4);
      ctx.fillRect(11, 15, 10, 3);
      ctx.fillRect(12, 19, 8, 3);
      break;

    case "fishing":
      // Fishing vessel - smaller, with equipment
      ctx.moveTo(16, 4);
      ctx.lineTo(22, 12);
      ctx.lineTo(22, 26);
      ctx.lineTo(10, 26);
      ctx.lineTo(10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, 14);
      ctx.lineTo(24, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, 14);
      ctx.lineTo(8, 8);
      ctx.stroke();
      break;

    default:
      // Generic ship
      ctx.moveTo(16, 4);
      ctx.lineTo(22, 10);
      ctx.lineTo(22, 26);
      ctx.lineTo(10, 26);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.fill();
      break;
  }

  return canvas.toDataURL("image/png");
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get effective heading for a ship
 * Uses trueHeading if available (not 511), otherwise falls back to cog
 */
function getEffectiveHeading(record: ShipRecord): number {
  return record.trueHeading === 511 ? record.cog : record.trueHeading;
}

/**
 * Filter ship records to only the N nearest to the camera
 */
function filterNearestShips(
  records: ShipRecord[],
  cameraPosition: Cesium.Cartesian3,
  maxCount: number
): ShipRecord[] {
  if (records.length <= maxCount) return records;

  const withDistance = records.map((record) => {
    const shipPos = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      0
    );
    const distance = Cesium.Cartesian3.distance(cameraPosition, shipPos);
    return { record, distance };
  });

  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, maxCount).map((item) => item.record);
}

/**
 * Check if the bounding box has changed significantly
 */
function hasBboxChangedSignificantly(lastBbox: BBox | null, newBbox: BBox): boolean {
  if (!lastBbox) return true;

  const lastCenterLat = (lastBbox.north + lastBbox.south) / 2;
  const lastCenterLon = (lastBbox.east + lastBbox.west) / 2;
  const newCenterLat = (newBbox.north + newBbox.south) / 2;
  const newCenterLon = (newBbox.east + newBbox.west) / 2;

  const lastHeight = lastBbox.north - lastBbox.south;
  const lastWidth = lastBbox.east - lastBbox.west;
  const threshold = Math.min(lastHeight, lastWidth) * 0.25;

  const latDiff = Math.abs(newCenterLat - lastCenterLat);
  const lonDiff = Math.abs(newCenterLon - lastCenterLon);

  return latDiff > threshold || lonDiff > threshold;
}

/**
 * Format a ship record into a label string
 */
function formatLabelText(record: ShipRecord): string {
  const name = record.name || record.mmsi;
  const speed = record.sog.toFixed(1);
  const course = Math.round(record.cog);
  return `${name}\n${speed} kn | ${course}°`;
}

/** Response from /ships endpoint */
interface ShipsApiResponse {
  ships: ShipRecord[];
  count: number;
  truncated: boolean;
  totalInBbox: number;
  connected: boolean;
  error?: string;
}

// ==================== SHIP LAYER COMPONENT ====================

/**
 * ShipLayer - Renders ships on the globe using BillboardCollection
 * 
 * This is a major improvement over the old Entity-based implementation:
 * - Single draw call for all ships (vs 200+ draw calls)
 * - Interpolates ALL visible ships (vs only 60)
 * - Uses shared useFollowMode hook
 */
export function ShipLayer() {
  const { viewer, ready } = useCesium();
  const { state: cameraState, getViewportBBox } = useCamera();
  const { isFollowing, track, stop: stopFollow } = useFollowMode();
  
  // Billboard and label collections
  const billboardApi = createBillboardCollection();
  
  // Label collection needs manual management (no existing hook)
  let labelCollection: Cesium.LabelCollection | null = null;
  const labelMap = new Map<string, Cesium.Label>();
  
  // Interpolated positions for smooth animation
  const interpolatedPositions = new Map<string, Cesium.Cartesian3>();
  
  // Polling interval
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let rateLimitRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveRemove: (() => void) | null = null;
  
  // Frame counter for interpolation skip
  let interpFrameCount = 0;
  const INTERP_SKIP_FRAMES = 2;

  /**
   * Get bounding box from camera viewport with fallback
   */
  function getBoundingBox(): BBox {
    const viewportBbox = getViewportBBox();
    
    if (viewportBbox) {
      return viewportBbox;
    }

    // Fallback: camera center + 20 degrees
    const center = cameraState().center;
    if (center) {
      console.warn("[ShipLayer] Viewport unavailable, using camera center fallback");
      return {
        west: center.lon - VIEWPORT_FALLBACK_DEGREES,
        east: center.lon + VIEWPORT_FALLBACK_DEGREES,
        south: center.lat - VIEWPORT_FALLBACK_DEGREES,
        north: center.lat + VIEWPORT_FALLBACK_DEGREES,
      };
    }

    // Ultimate fallback: global bbox
    console.warn("[ShipLayer] No camera center available, using global bbox");
    return {
      west: -180,
      east: 180,
      south: -90,
      north: 90,
    };
  }

  /**
   * Fetch ships from proxy server
   */
  async function fetchShips(bbox: BBox): Promise<ShipsApiResponse> {
    const url = PROXY_ENDPOINTS.ships({
      minLat: bbox.south,
      maxLat: bbox.north,
      minLon: bbox.west,
      maxLon: bbox.east,
    });

    const response = await fetch(url);
    const data = await response.json();

    if (response.status === 503) {
      return {
        ships: data.ships ?? [],
        count: data.count ?? 0,
        truncated: data.truncated ?? false,
        totalInBbox: data.totalInBbox ?? 0,
        connected: false,
        error: data.error,
      };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ships: ${response.status}`);
    }

    return {
      ships: data.ships ?? [],
      count: data.count ?? 0,
      truncated: data.truncated ?? false,
      totalInBbox: data.totalInBbox ?? 0,
      connected: data.connected ?? true,
    };
  }

  /**
   * Get current polling interval based on rate limit status
   */
  function getCurrentPollingInterval(): number {
    return shipState.isRateLimited ? SHIP_RATE_LIMITED_INTERVAL : SHIP_UPDATE_INTERVAL;
  }

  /**
   * Handle rate limit detection
   */
  function handleRateLimit(): void {
    if (!shipState.isRateLimited) {
      setRateLimited(true);
      console.warn("[ShipLayer] Rate limited - using cached data");
      
      restartPolling();

      if (rateLimitRecoveryTimeout) {
        clearTimeout(rateLimitRecoveryTimeout);
      }
      rateLimitRecoveryTimeout = setTimeout(() => {
        setRateLimited(false);
        console.info("[ShipLayer] Resuming normal polling frequency");
        restartPolling();
      }, SHIP_RATE_LIMIT_RECOVERY_MS);
    }
  }

  /**
   * Restart polling with current interval
   */
  function restartPolling(): void {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(() => refreshShips(), getCurrentPollingInterval());
  }

  /**
   * Create label collection
   */
  function initLabelCollection(): void {
    const v = viewer();
    if (!v || v.isDestroyed() || labelCollection) return;

    labelCollection = new Cesium.LabelCollection({
      scene: v.scene,
    });
    v.scene.primitives.add(labelCollection);
  }

  /**
   * Add a ship billboard and label
   */
  function addShip(record: ShipRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      0
    );
    
    const heading = getEffectiveHeading(record);
    const colors = getShipColors();
    const icons = getShipIcons();
    const color = colors[record.shipTypeCategory] ?? colors.other!;
    const iconUrl = icons[record.shipTypeCategory] ?? icons.other!;

    // Add billboard
    billboardApi.add({
      id: record.mmsi,
      position,
      image: iconUrl!,
      scale: BILLBOARD_SCALE,
      color,
      rotation: -Cesium.Math.toRadians(heading),
      data: { mmsi: record.mmsi, type: "ship" },
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    // Add label
    if (labelCollection) {
      const label = labelCollection.add({
        position,
        text: formatLabelText(record),
        font: "bold 13px Courier New",
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -25),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 150000, 0.6),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHIP_LABEL_VISIBLE_DISTANCE),
      });
      labelMap.set(record.mmsi, label);
    }

    // Initialize interpolated position
    interpolatedPositions.set(record.mmsi, position);
  }

  /**
   * Update a ship's billboard and label
   */
  function updateShip(record: ShipRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      0
    );
    
    const heading = getEffectiveHeading(record);
    const colors = getShipColors();
    const color = colors[record.shipTypeCategory] ?? colors.other;

    // Update billboard
    billboardApi.update(record.mmsi, {
      position,
      rotation: -Cesium.Math.toRadians(heading),
      color,
    });

    // Update label
    const label = labelMap.get(record.mmsi);
    if (label && color) {
      label.position = position;
      label.text = formatLabelText(record);
      label.fillColor = color;
    }
  }

  /**
   * Remove a ship's billboard and label
   */
  function removeShip(mmsi: string): void {
    billboardApi.remove(mmsi);
    
    const label = labelMap.get(mmsi);
    if (label && labelCollection) {
      labelCollection.remove(label);
      labelMap.delete(mmsi);
    }
    
    interpolatedPositions.delete(mmsi);
  }

  /**
   * Highlight selected ship
   */
  function highlightShip(mmsi: string | null, previousMmsi: string | null): void {
    // Restore previous selection
    if (previousMmsi) {
      const prevRecord = getShipByMmsi(previousMmsi);
      if (prevRecord) {
        const colors = getShipColors();
        const color = colors[prevRecord.shipTypeCategory] ?? colors.other!;
        billboardApi.update(previousMmsi, {
          scale: BILLBOARD_SCALE,
          color,
        });
        const label = labelMap.get(previousMmsi);
        if (label && color) {
          label.fillColor = color;
        }
      }
    }

    // Highlight new selection
    if (mmsi) {
      billboardApi.update(mmsi, {
        scale: BILLBOARD_SCALE_SELECTED,
        color: Cesium.Color.YELLOW,
      });
      const label = labelMap.get(mmsi);
      if (label) {
        label.fillColor = Cesium.Color.YELLOW;
      }
    }
  }

  /**
   * Refresh ships from server
   */
  async function refreshShips(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    try {
      const bbox = getBoundingBox();
      const response = await fetchShips(bbox);

      // Handle rate limiting
      if (!response.connected && shipState.ships.size > 0) {
        handleRateLimit();
        return;
      }

      // Handle connection errors with no data
      if (!response.connected && shipState.ships.size === 0) {
        setError(response.error || "Connection lost");
        return;
      }

      setConnected(response.connected);

      // Filter to nearest ships
      const records = filterNearestShips(
        response.ships,
        v.camera.positionWC,
        MAX_VISIBLE_SHIPS
      );
      
      const currentMmsis = new Set(records.map((r) => r.mmsi));

      // Update or add ships
      for (const record of records) {
        if (shipState.ships.has(record.mmsi)) {
          updateShip(record);
        } else {
          addShip(record);
        }
      }

      // Remove ships no longer in view
      for (const mmsi of shipState.ships.keys()) {
        if (!currentMmsis.has(mmsi)) {
          removeShip(mmsi);
        }
      }

      // Update store
      updateShips(records, currentMmsis);
      setLastBbox(bbox);

      console.info(`[ShipLayer] Updated ${records.length} ships`);
    } catch (error) {
      console.error("[ShipLayer] Refresh error:", error);
      if (shipState.ships.size > 0) {
        console.warn("[ShipLayer] Using cached data due to network error");
      }
    }
  }

  /**
   * Handle camera movement - debounce and refresh ships
   */
  function onCameraMove(): void {
    if (cameraMoveDebounce) {
      clearTimeout(cameraMoveDebounce);
    }

    cameraMoveDebounce = setTimeout(() => {
      const newBbox = getBoundingBox();
      
      if (hasBboxChangedSignificantly(shipState.lastBbox, newBbox)) {
        console.info("[ShipLayer] Viewport changed - refreshing ships");
        refreshShips();
      }
    }, CAMERA_MOVE_DEBOUNCE_MS);
  }

  /**
   * Handle click on ship billboard
   */
  function setupClickHandler(): (() => void) | null {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);
      
      // Cesium returns the billboard's id property directly as pickedObject.id
      const id = pickedObject?.id;
      if (typeof id === "string" && getShipByMmsi(id)) {
        handleShipSelection(id);
        return;
      }
      
      // Clicked empty space - deselect
      if (shipState.selectedMmsi) {
        handleShipDeselection();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }

  /**
   * Handle ship selection
   */
  function handleShipSelection(mmsi: string): void {
    const previousMmsi = shipState.selectedMmsi;
    
    if (previousMmsi === mmsi) {
      // Already selected - deselect
      handleShipDeselection();
      return;
    }

    const record = getShipByMmsi(mmsi);
    if (!record) return;

    // Update local store
    selectShip(mmsi);
    highlightShip(mmsi, previousMmsi);

    // Update selection store
    const shipData: ShipData = {
      mmsi: record.mmsi,
      name: record.name,
      shipType: record.shipType,
      position: {
        lat: record.latitude,
        lng: record.longitude,
      },
      heading: getEffectiveHeading(record),
      speed: record.sog,
    };
    selectEntity("ship", mmsi, shipData);
  }

  /**
   * Handle ship deselection
   */
  function handleShipDeselection(): void {
    const previousMmsi = shipState.selectedMmsi;
    
    // Stop following if we were following this ship
    if (shipState.followingMmsi === previousMmsi) {
      stopFollowMode();
    }

    highlightShip(null, previousMmsi);
    selectShip(null);
    clearSelection();
  }

  /**
   * Start following selected ship
   */
  function startFollowMode(): void {
    const mmsi = shipState.selectedMmsi;
    if (!mmsi) return;

    followShip(mmsi);

    track(
      () => interpolatedPositions.get(mmsi) ?? null,
      {
        heading: 0,
        pitch: Cesium.Math.toRadians(SHIP_FOLLOW_PITCH),
        range: SHIP_FOLLOW_RANGE,
        useGroundLevel: true, // Ships are at sea level
      }
    );

    console.info(`[ShipLayer] Follow mode started for ${mmsi}`);
  }

  /**
   * Stop following ship
   */
  function stopFollowMode(): void {
    stopFollow();
    unfollowShip();
    console.info("[ShipLayer] Follow mode stopped");
  }

  // Pre-render callback for interpolation
  // NOTE: Interpolates ALL ships, not just 60 like old code
  usePreRender(() => {
    // Skip frames to reduce CPU load
    interpFrameCount++;
    if (interpFrameCount < INTERP_SKIP_FRAMES) return;
    interpFrameCount = 0;

    const now = Date.now();
    const DEG_TO_RAD = Cesium.Math.RADIANS_PER_DEGREE;

    for (const [mmsi, record] of shipState.ships) {
      // Calculate elapsed time since last update
      let elapsedSec = (now - record.timestamp) / 1000;
      if (elapsedSec > SHIP_INTERP_CAP) {
        elapsedSec = SHIP_INTERP_CAP;
      }

      // Skip if no significant time has passed
      if (elapsedSec < 0.5) continue;

      // Dead-reckoning formula:
      // newLat = lat + (sog * time_delta * cos(cog)) / 60
      // newLon = lon + (sog * time_delta * sin(cog)) / (60 * cos(lat))
      const elapsedHours = elapsedSec / 3600;
      const cogRad = record.cog * DEG_TO_RAD;
      const latRad = record.latitude * DEG_TO_RAD;
      const cosLat = Math.cos(latRad);

      const newLat = record.latitude + (record.sog * elapsedHours * Math.cos(cogRad)) / 60;
      const newLon = record.longitude + (record.sog * elapsedHours * Math.sin(cogRad)) / (60 * cosLat);

      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, 0);

      // Update billboard position directly (efficient - no property allocation)
      const billboard = billboardApi.get(mmsi);
      if (billboard) {
        billboard.position = pos;
      }

      // Update label position
      const label = labelMap.get(mmsi);
      if (label) {
        label.position = pos;
      }

      // Store interpolated position for follow mode
      interpolatedPositions.set(mmsi, pos);
    }
  });

  // Initialize when viewer becomes ready
  createEffect(
    on(ready, async (isReady) => {
      if (isReady) {
        await initialize();
      }
    })
  );

  /**
   * Initialize the layer
   */
  async function initialize(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Initialize label collection
    initLabelCollection();

    // Setup click handler
    const removeClickHandler = setupClickHandler();

    // Setup camera movement listener
    const cameraMoveListener = v.camera.moveEnd.addEventListener(() => {
      onCameraMove();
    });
    cameraMoveRemove = () => cameraMoveListener();

    // Initial fetch
    setLoading(true);
    try {
      await refreshShips();
    } catch (error) {
      console.error("[ShipLayer] Initial fetch failed:", error);
      setError("Failed to load ships");
    }

    // Start polling
    updateInterval = setInterval(() => refreshShips(), getCurrentPollingInterval());

    // Store cleanup for click handler
    onCleanup(() => {
      removeClickHandler?.();
    });
  }

  // Cleanup on unmount
  onCleanup(() => {
    console.info("[ShipLayer] unmounted");

    // Stop follow mode
    if (shipState.followingMmsi) {
      stopFollowMode();
    }

    // Clear polling
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    // Clear rate limit timeout
    if (rateLimitRecoveryTimeout) {
      clearTimeout(rateLimitRecoveryTimeout);
      rateLimitRecoveryTimeout = null;
    }

    // Clear camera debounce
    if (cameraMoveDebounce) {
      clearTimeout(cameraMoveDebounce);
      cameraMoveDebounce = null;
    }

    // Remove camera listener
    if (cameraMoveRemove) {
      cameraMoveRemove();
      cameraMoveRemove = null;
    }

    // Remove label collection
    const v = viewer();
    if (v && !v.isDestroyed() && labelCollection) {
      v.scene.primitives.remove(labelCollection);
    }
    labelCollection = null;
    labelMap.clear();

    // Clear interpolated positions
    interpolatedPositions.clear();

    // Clear store
    clearShips();
  });

  // Export follow mode controls for external use
  (window as { shipLayerControls?: { startFollow: () => void; stopFollow: () => void } }).shipLayerControls = {
    startFollow: startFollowMode,
    stopFollow: stopFollowMode,
  };

  // Layers don't render DOM - they add billboards to Cesium
  return null;
}

export default ShipLayer;
