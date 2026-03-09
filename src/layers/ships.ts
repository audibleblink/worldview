/**
 * ShipLayer - Real-time ship tracking via AISStream
 * Renders ships as billboards on the globe with type-specific icons and colors
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");

import { lookAtTarget, unlockCamera, getViewportBBox, getCameraCenter, type BBox } from "../camera.ts";
import { logError, logInfo, logWarn } from "../errors.ts";
import type { ShipRecord } from "../proxy/aisstream.ts";

// Re-export ShipRecord for consumers
export type { ShipRecord };

// Constants
const SHIP_UPDATE_INTERVAL = 8_000;       // 8 seconds between polls
const SHIP_RATE_LIMITED_INTERVAL = 15_000; // 15 seconds when rate limited
const SHIP_RATE_LIMIT_RECOVERY_MS = 60_000; // 60 seconds before resuming normal polling
const SHIP_INTERP_CAP = 60;               // seconds max dead-reckoning
const SHIP_FOLLOW_RANGE = 10_000;         // meters
const SHIP_FOLLOW_PITCH = -30;            // degrees
const SHIP_LABEL_VISIBLE_DISTANCE = 150_000; // meters - labels hidden beyond this
const SHIP_INTERP_SKIP_FRAMES = 2;        // interpolate every N frames
const MAX_INTERP_SHIPS = 60;              // max ships to interpolate per frame
const MAX_VISIBLE_SHIPS = 100;
const VIEWPORT_FALLBACK_DEGREES = 20;     // fallback bbox size when viewport unavailable

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

// Lazy-initialized Cesium colors (Cesium is a browser global)
let shipColorsCache: Record<string, Cesium.Color> | null = null;

function getShipColors(): Record<string, Cesium.Color> {
  if (!shipColorsCache) {
    shipColorsCache = {
      cargo: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.cargo),
      tanker: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.tanker),
      passenger: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.passenger),
      fishing: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.fishing),
      other: Cesium.Color.fromCssColorString(SHIP_COLOR_HEX.other),
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
  // Create an off-screen canvas
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;

  // Draw ship silhouette based on type
  ctx.beginPath();
  
  switch (type) {
    case "cargo":
      // Container ship - rectangular with pointed bow
      ctx.moveTo(16, 2);   // Bow (top point)
      ctx.lineTo(26, 12);  // Starboard bow
      ctx.lineTo(26, 28);  // Starboard stern
      ctx.lineTo(6, 28);   // Port stern
      ctx.lineTo(6, 12);   // Port bow
      ctx.closePath();
      ctx.fill();
      // Bridge
      ctx.fillRect(10, 20, 12, 6);
      break;

    case "tanker":
      // Tanker - longer, bulkier
      ctx.moveTo(16, 2);   // Bow
      ctx.lineTo(24, 8);   // Starboard bow
      ctx.lineTo(26, 14);
      ctx.lineTo(26, 28);  // Starboard stern
      ctx.lineTo(6, 28);   // Port stern
      ctx.lineTo(6, 14);
      ctx.lineTo(8, 8);    // Port bow
      ctx.closePath();
      ctx.fill();
      // Tanks (circles)
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
      ctx.moveTo(16, 2);   // Bow
      ctx.lineTo(22, 8);   // Starboard bow
      ctx.lineTo(24, 14);
      ctx.lineTo(24, 26);  // Starboard stern
      ctx.lineTo(8, 26);   // Port stern
      ctx.lineTo(8, 14);
      ctx.lineTo(10, 8);   // Port bow
      ctx.closePath();
      ctx.fill();
      // Superstructure decks
      ctx.fillRect(10, 10, 12, 4);
      ctx.fillRect(11, 15, 10, 3);
      ctx.fillRect(12, 19, 8, 3);
      break;

    case "fishing":
      // Fishing vessel - smaller, with equipment
      ctx.moveTo(16, 4);   // Bow
      ctx.lineTo(22, 12);  // Starboard bow
      ctx.lineTo(22, 26);  // Starboard stern
      ctx.lineTo(10, 26);  // Port stern
      ctx.lineTo(10, 12);  // Port bow
      ctx.closePath();
      ctx.fill();
      // Fishing crane/boom
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
      ctx.moveTo(16, 4);   // Bow
      ctx.lineTo(22, 10);  // Starboard bow
      ctx.lineTo(22, 26);  // Starboard stern
      ctx.lineTo(10, 26);  // Port stern
      ctx.lineTo(10, 10);  // Port bow
      ctx.closePath();
      ctx.fill();
      break;
  }

  return canvas.toDataURL("image/png");
}

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

  // Calculate distance from camera to each ship
  const withDistance = records.map((record) => {
    const shipPos = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      0 // Ships are at sea level
    );
    const distance = Cesium.Cartesian3.distance(cameraPosition, shipPos);
    return { record, distance };
  });

  // Sort by distance and take the nearest N
  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, maxCount).map((item) => item.record);
}

/** Response from /ships endpoint with connection status */
interface ShipsApiResponse {
  ships: ShipRecord[];
  count: number;
  truncated: boolean;
  totalInBbox: number;
  connected: boolean;
  error?: string;
}

/**
 * Fetch ships from proxy server
 * Returns response with ships array and metadata
 * Throws error on network failure; returns empty array with connected=false on API errors
 */
export async function fetchShips(bbox?: BBox): Promise<ShipsApiResponse> {
  let url = "http://localhost:3001/ships";
  
  if (bbox) {
    const params = new URLSearchParams({
      minLat: String(bbox.south),
      maxLat: String(bbox.north),
      minLon: String(bbox.west),
      maxLon: String(bbox.east),
    });
    url += `?${params}`;
  }

  const response = await fetch(url);
  const data = await response.json();

  // For 503 errors, return the response (contains connected: false)
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

export class ShipLayer {
  private viewer: Cesium.Viewer;
  private entityMap: Map<string, Cesium.Entity> = new Map();
  private recordMap: Map<string, ShipRecord> = new Map();
  private interpolatedPositions: Map<string, Cesium.Cartesian3> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private onCountUpdate: ((n: number | null) => void) | null = null;
  private onError: (() => void) | null = null;
  private selectedMmsi: string | null = null;
  private externalDeselectCallback: (() => void) | null = null;
  private following: boolean = false;
  private interpFrameCount: number = 0;
  private interpTickRemove: (() => void) | null = null;
  private followTickRemove: (() => void) | null = null;
  private isRateLimited: boolean = false;
  private rateLimitRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastConnected: boolean = true;

  constructor(
    viewer: Cesium.Viewer, 
    onCountUpdate?: (n: number | null) => void,
    onError?: () => void
  ) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
    this.onError = onError ?? null;
  }

  /**
   * Get bounding box from camera viewport with fallback
   */
  private getBoundingBox(): BBox {
    // Try to get viewport bbox using computeViewRectangle
    const viewRect = this.viewer.camera.computeViewRectangle();
    
    if (viewRect) {
      return {
        west: Cesium.Math.toDegrees(viewRect.west),
        south: Cesium.Math.toDegrees(viewRect.south),
        east: Cesium.Math.toDegrees(viewRect.east),
        north: Cesium.Math.toDegrees(viewRect.north),
      };
    }

    // Try to get viewport bbox using pickEllipsoid corners
    const viewportBbox = getViewportBBox(this.viewer);
    
    if (viewportBbox) {
      return viewportBbox;
    }

    // Fallback: camera center + 20 degrees (as per Phase 5 spec)
    const center = getCameraCenter(this.viewer);
    if (center) {
      logWarn("SHIPS", `Viewport unavailable, using camera center fallback (${center.lat.toFixed(2)}°, ${center.lon.toFixed(2)}°)`);
      return {
        west: center.lon - VIEWPORT_FALLBACK_DEGREES,
        east: center.lon + VIEWPORT_FALLBACK_DEGREES,
        south: center.lat - VIEWPORT_FALLBACK_DEGREES,
        north: center.lat + VIEWPORT_FALLBACK_DEGREES,
      };
    }

    // Ultimate fallback: global bbox
    logWarn("SHIPS", "No camera center available, using global bbox");
    return {
      west: -180,
      east: 180,
      south: -90,
      north: 90,
    };
  }

  /**
   * Get the current polling interval based on rate limit status
   */
  private getCurrentPollingInterval(): number {
    return this.isRateLimited ? SHIP_RATE_LIMITED_INTERVAL : SHIP_UPDATE_INTERVAL;
  }

  /**
   * Handle rate limit detection and recovery
   */
  private handleRateLimit(): void {
    if (!this.isRateLimited) {
      this.isRateLimited = true;
      logWarn("SHIPS", "Rate limited - using cached data");
      
      // Reschedule polling at slower rate
      this.restartPolling();

      // Schedule recovery after 60 seconds
      if (this.rateLimitRecoveryTimeout) {
        clearTimeout(this.rateLimitRecoveryTimeout);
      }
      this.rateLimitRecoveryTimeout = setTimeout(() => {
        this.isRateLimited = false;
        logInfo("SHIPS", "Resuming normal polling frequency");
        this.restartPolling();
      }, SHIP_RATE_LIMIT_RECOVERY_MS);
    }
  }

  /**
   * Restart the polling interval with current rate
   */
  private restartPolling(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.updateInterval = setInterval(
      () => this.refreshShips(),
      this.getCurrentPollingInterval()
    );
  }

  /**
   * Show the ship layer - fetch data and render billboard entities
   */
  async show(): Promise<void> {
    logInfo("SHIPS", "Layer active");

    // Get bounding box for query
    const bbox = this.getBoundingBox();

    // Fetch initial ship data
    const response = await fetchShips(bbox);
    
    // Check for connection/auth errors
    if (!response.connected) {
      if (response.error) {
        logError("SHIPS", response.error);
      }
      this.onError?.();
      throw new Error(response.error || "Ship tracking unavailable");
    }
    
    this.lastConnected = response.connected;

    // Filter to nearest ships only
    const records = filterNearestShips(
      response.ships,
      this.viewer.camera.positionWC,
      MAX_VISIBLE_SHIPS
    );

    // Add entity for each ship
    for (const record of records) {
      this.addEntity(record);
    }

    // Start polling for updates
    this.updateInterval = setInterval(
      () => this.refreshShips(),
      this.getCurrentPollingInterval()
    );

    // Register preRender listener for position interpolation
    const interpListener = this.viewer.scene.preRender.addEventListener(() => {
      this.interpolatePositions();
    });
    this.interpTickRemove = () => interpListener();

    // Notify count
    this.onCountUpdate?.(this.entityMap.size);
  }

  /**
   * Hide the ship layer - remove all entities and stop polling
   */
  hide(): void {
    logInfo("SHIPS", "Layer disabled");

    // Stop follow mode if active
    this.stopFollow();

    // Clear polling interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear rate limit recovery timeout
    if (this.rateLimitRecoveryTimeout) {
      clearTimeout(this.rateLimitRecoveryTimeout);
      this.rateLimitRecoveryTimeout = null;
    }
    this.isRateLimited = false;

    // Remove interpolation preRender listener
    if (this.interpTickRemove) {
      this.interpTickRemove();
      this.interpTickRemove = null;
    }

    // Remove all entities from viewer
    for (const entity of this.entityMap.values()) {
      this.viewer.entities.remove(entity);
    }

    // Clear maps
    this.entityMap.clear();
    this.recordMap.clear();
    this.interpolatedPositions.clear();
    this.selectedMmsi = null;

    // Notify count cleared
    this.onCountUpdate?.(null);
  }

  /**
   * Refresh ship data from server
   */
  async refreshShips(): Promise<void> {
    try {
      // Get bounding box for query
      const bbox = this.getBoundingBox();

      const response = await fetchShips(bbox);

      // Check for rate limiting (503 with existing cached data)
      if (!response.connected && this.entityMap.size > 0) {
        this.handleRateLimit();
        // Continue using cached data - don't clear entities
        return;
      }

      // Check for connection errors when we have no data
      if (!response.connected && this.entityMap.size === 0) {
        logError("SHIPS", response.error || "Connection lost");
        this.onError?.();
        return;
      }

      // Track connection state changes
      if (!this.lastConnected && response.connected) {
        logInfo("SHIPS", "Connection restored");
      }
      this.lastConnected = response.connected;

      // Filter to nearest ships only
      const records = filterNearestShips(
        response.ships,
        this.viewer.camera.positionWC,
        MAX_VISIBLE_SHIPS
      );
      const currentMmsis = new Set(records.map((r) => r.mmsi));

      // Update or add entities
      for (const record of records) {
        const existingEntity = this.entityMap.get(record.mmsi);
        if (existingEntity) {
          // Update existing entity position and rotation
          const position = Cesium.Cartesian3.fromDegrees(
            record.longitude,
            record.latitude,
            0
          );

          const heading = getEffectiveHeading(record);

          existingEntity.position = new Cesium.ConstantPositionProperty(position);

          // Update billboard rotation
          if (existingEntity.billboard) {
            existingEntity.billboard.rotation = new Cesium.ConstantProperty(
              -Cesium.Math.toRadians(heading)
            );
          }

          // Update label text
          if (existingEntity.label) {
            existingEntity.label.text = new Cesium.ConstantProperty(this.formatLabelText(record));
          }

          // Update stored record
          this.recordMap.set(record.mmsi, record);
        } else {
          // Add new entity
          this.addEntity(record);
        }
      }

      // Remove entities for ships no longer in nearest set
      for (const [mmsi, entity] of this.entityMap) {
        if (!currentMmsis.has(mmsi)) {
          this.viewer.entities.remove(entity);
          this.entityMap.delete(mmsi);
          this.recordMap.delete(mmsi);
          this.interpolatedPositions.delete(mmsi);
        }
      }

      // Notify count
      this.onCountUpdate?.(this.entityMap.size);
    } catch (error) {
      logError("SHIPS", "Refresh error", error);
      // On network error, keep using cached data
      if (this.entityMap.size > 0) {
        logWarn("SHIPS", "Using cached data due to network error");
      }
    }
  }

  /**
   * Format a ship record into a label string
   */
  private formatLabelText(record: ShipRecord): string {
    const name = record.name || record.mmsi;
    const speed = record.sog.toFixed(1);
    const course = Math.round(record.cog);
    return `${name}\n${speed} kn | ${course}°`;
  }

  /**
   * Add an entity with billboard and label for a ship
   */
  private addEntity(record: ShipRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      0
    );

    const heading = getEffectiveHeading(record);
    const colors = getShipColors();
    const icons = getShipIcons();
    const color = colors[record.shipTypeCategory] ?? colors.other;
    const iconUrl = icons[record.shipTypeCategory] ?? icons.other;

    // Create entity with billboard and label
    const entity = this.viewer.entities.add({
      id: `ship-${record.mmsi}`,
      name: record.name || record.mmsi,
      position,
      billboard: {
        image: iconUrl,
        scale: BILLBOARD_SCALE,
        color,
        rotation: -Cesium.Math.toRadians(heading), // Negative because Cesium rotates clockwise
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      },
      label: {
        text: this.formatLabelText(record),
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
      },
    });

    this.entityMap.set(record.mmsi, entity);
    this.recordMap.set(record.mmsi, record);
  }

  /**
   * Interpolate positions for tracked ships using dead-reckoning.
   * Called each frame via preRender listener, but skips frames for efficiency.
   */
  private interpolatePositions(): void {
    // Skip frames to reduce CPU load
    this.interpFrameCount++;
    if (this.interpFrameCount < SHIP_INTERP_SKIP_FRAMES) return;
    this.interpFrameCount = 0;

    const now = Date.now();
    let interpCount = 0;

    // Pre-compute constants outside loop
    const DEG_TO_RAD = Cesium.Math.RADIANS_PER_DEGREE;

    for (const [mmsi, record] of this.recordMap) {
      // Limit interpolation to MAX_INTERP_SHIPS for performance
      if (interpCount >= MAX_INTERP_SHIPS) break;

      const entity = this.entityMap.get(mmsi);
      if (!entity) continue;

      // Calculate elapsed time since last update, capped at SHIP_INTERP_CAP seconds
      let elapsedSec = (now - record.timestamp) / 1000;
      if (elapsedSec > SHIP_INTERP_CAP) {
        elapsedSec = SHIP_INTERP_CAP;
      }

      // Skip if no significant time has passed
      if (elapsedSec < 0.5) continue;

      // Dead-reckoning formula:
      // newLat = lat + (sog * time_delta * cos(cog)) / 60
      // newLon = lon + (sog * time_delta * sin(cog)) / (60 * cos(lat))
      // where sog is in knots, time_delta in hours
      const elapsedHours = elapsedSec / 3600;
      const cogRad = record.cog * DEG_TO_RAD;
      const latRad = record.latitude * DEG_TO_RAD;
      const cosLat = Math.cos(latRad);

      // 1 knot = 1 nautical mile per hour, 1 nm = 1 minute of latitude = 1/60 degree
      const newLat = record.latitude + (record.sog * elapsedHours * Math.cos(cogRad)) / 60;
      const newLon = record.longitude + (record.sog * elapsedHours * Math.sin(cogRad)) / (60 * cosLat);

      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, 0);

      // Update entity position
      entity.position = new Cesium.ConstantPositionProperty(pos);
      this.interpolatedPositions.set(mmsi, pos);

      interpCount++;
    }
  }

  /**
   * Get the current interpolated position of a ship.
   * Used by follow mode to track ship smoothly.
   */
  getCurrentPosition(mmsi: string): Cesium.Cartesian3 | undefined {
    return this.interpolatedPositions.get(mmsi);
  }

  /**
   * Check if an MMSI belongs to this layer
   */
  hasMMSI(mmsi: string): boolean {
    return this.recordMap.has(mmsi);
  }

  /**
   * Get a ship record by MMSI
   */
  getRecord(mmsi: string): ShipRecord | undefined {
    return this.recordMap.get(mmsi);
  }

  /**
   * Get an entity by MMSI
   */
  getEntity(mmsi: string): Cesium.Entity | undefined {
    return this.entityMap.get(mmsi);
  }

  /**
   * Check if the layer has any entities
   */
  hasEntities(): boolean {
    return this.entityMap.size > 0;
  }

  /**
   * Select a ship - highlight and notify callback
   */
  selectShip(mmsi: string, onSelect?: (record: ShipRecord) => void): void {
    // Deselect any currently selected ship first
    this.deselectShip();

    const record = this.recordMap.get(mmsi);
    if (!record) return;

    this.selectedMmsi = mmsi;

    // Highlight the selected entity
    const entity = this.entityMap.get(mmsi);
    if (entity?.billboard) {
      entity.billboard.scale = new Cesium.ConstantProperty(BILLBOARD_SCALE_SELECTED);
      entity.billboard.color = new Cesium.ConstantProperty(Cesium.Color.YELLOW);
    }
    if (entity?.label) {
      entity.label.fillColor = new Cesium.ConstantProperty(Cesium.Color.YELLOW);
    }

    onSelect?.(record);
  }

  /**
   * Deselect the current ship - restore appearance
   */
  deselectShip(onDeselect?: () => void): void {
    if (this.selectedMmsi) {
      const entity = this.entityMap.get(this.selectedMmsi);
      const record = this.recordMap.get(this.selectedMmsi);
      
      if (entity && record) {
        const colors = getShipColors();
        const color = colors[record.shipTypeCategory] ?? colors.other;
        
        if (entity.billboard) {
          entity.billboard.scale = new Cesium.ConstantProperty(BILLBOARD_SCALE);
          entity.billboard.color = new Cesium.ConstantProperty(color);
        }
        if (entity.label) {
          entity.label.fillColor = new Cesium.ConstantProperty(color);
        }
      }
      this.selectedMmsi = null;
    }

    onDeselect?.();
  }

  /**
   * Get the currently selected MMSI
   */
  getSelectedMmsi(): string | null {
    return this.selectedMmsi;
  }

  /**
   * Set an external callback to be invoked when a ship is deselected
   */
  setExternalDeselectCallback(cb: () => void): void {
    this.externalDeselectCallback = cb;
  }

  /**
   * Start following the currently selected ship.
   * Registers a preRender listener that updates camera each frame.
   */
  startFollow(): void {
    if (!this.selectedMmsi) return;

    // Remove any existing follow listener
    if (this.followTickRemove) {
      this.followTickRemove();
      this.followTickRemove = null;
    }

    this.following = true;

    // Capture initial camera state
    const cameraCartographic = this.viewer.camera.positionCartographic;
    const initialRange = cameraCartographic.height;

    logInfo("SHIPS", `Follow mode started for ${this.selectedMmsi}`);

    // Store HPR values - these are what we pass to lookAt
    let heading = 0;
    let pitch = Cesium.Math.toRadians(SHIP_FOLLOW_PITCH);
    let range = Math.min(initialRange, SHIP_FOLLOW_RANGE);

    // Track where we positioned camera last frame to detect user input
    let lastCamPos: Cesium.Cartesian3 | null = null;

    const followListener = this.viewer.scene.preRender.addEventListener(() => {
      if (!this.following || !this.selectedMmsi) return;

      const pos = this.getCurrentPosition(this.selectedMmsi);
      if (pos) {
        // Get ship's lon/lat but use sea level as target
        const shipCartographic = Cesium.Cartographic.fromCartesian(pos);
        const target = Cesium.Cartesian3.fromRadians(
          shipCartographic.longitude,
          shipCartographic.latitude,
          0 // Sea level
        );

        const camera = this.viewer.camera;

        // Check if user moved the camera since last frame
        if (lastCamPos !== null) {
          const actualPos = camera.positionWC;
          const userMoved = !Cesium.Cartesian3.equalsEpsilon(actualPos, lastCamPos, 0, 1.0);

          if (userMoved) {
            // User orbited - update heading/pitch/range from current camera state
            heading = camera.heading;
            pitch = camera.pitch;
            range = Cesium.Cartesian3.distance(actualPos, target);
          }
        }

        // Apply lookAt - this creates the reference frame that enables orbit controls
        camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));

        // Store where camera is now
        lastCamPos = Cesium.Cartesian3.clone(camera.positionWC);
      }
    });
    this.followTickRemove = () => followListener();
  }

  /**
   * Stop following the currently selected ship.
   * Removes preRender listener and unlocks camera.
   */
  stopFollow(): void {
    if (this.followTickRemove) {
      this.followTickRemove();
      this.followTickRemove = null;
    }

    if (this.following) {
      unlockCamera(this.viewer);
    }

    this.following = false;
    logInfo("SHIPS", "Follow mode stopped");
  }

  /**
   * Check if currently in follow mode
   */
  isFollowing(): boolean {
    return this.following;
  }

  /**
   * Get the name of the currently followed ship
   */
  getFollowedShipName(): string | null {
    if (!this.following || !this.selectedMmsi) return null;
    const record = this.recordMap.get(this.selectedMmsi);
    return record?.name || null;
  }

  /**
   * Find a ship by name (partial match)
   * @param name - The name to search for
   * @returns The ship record if found, null otherwise
   */
  findByName(name: string): ShipRecord | null {
    const searchName = name.toUpperCase().trim();
    for (const record of this.recordMap.values()) {
      if (record.name.toUpperCase().includes(searchName)) {
        return record;
      }
    }
    return null;
  }

  /**
   * Find a ship by MMSI (exact match)
   * @param mmsi - The MMSI to search for
   * @returns The ship record if found, null otherwise
   */
  findByMMSI(mmsi: string): ShipRecord | null {
    return this.recordMap.get(mmsi) ?? null;
  }
}
