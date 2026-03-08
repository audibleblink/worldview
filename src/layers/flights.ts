/**
 * FlightLayer - Real-time aircraft tracking via OpenSky Network
 * Renders aircraft as rotated billboard icons on the globe
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");

import { lookAtTarget, unlockCamera } from "../camera.ts";

// Constants
const FLIGHT_UPDATE_INTERVAL = 10_000;
const FLIGHT_ICON_SIZE = 14;
const FLIGHT_ICON_SIZE_SELECTED = 24;
const FLIGHT_INTERP_CAP = 30;       // seconds max dead-reckoning
const FLIGHT_FOLLOW_RANGE = 50_000; // meters
const FLIGHT_FOLLOW_PITCH = -30;    // degrees

export interface FlightRecord {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  lastUpdate: number;
}

export interface FlightMetadata {
  typecode: string;
  model: string;
  registration: string;
}

/**
 * OpenSky states array indices:
 * 0  = icao24
 * 1  = callsign
 * 5  = longitude
 * 6  = latitude
 * 7  = baro_altitude
 * 8  = on_ground
 * 9  = velocity
 * 10 = true_track (heading)
 * 11 = vertical_rate
 */
function parseOpenSkyState(state: unknown[]): FlightRecord | null {
  const icao24 = state[0] as string | null;
  const callsign = state[1] as string | null;
  const longitude = state[5] as number | null;
  const latitude = state[6] as number | null;
  const baroAltitude = state[7] as number | null;
  const onGround = state[8] as boolean;
  const velocity = state[9] as number | null;
  const trueTrack = state[10] as number | null;
  const verticalRate = state[11] as number | null;

  // Filter out records with missing critical data
  if (!icao24 || longitude === null || latitude === null) {
    return null;
  }

  // Filter out aircraft on ground
  if (onGround === true) {
    return null;
  }

  return {
    icao24: icao24,
    callsign: callsign?.trim() ?? "",
    longitude: longitude,
    latitude: latitude,
    altitude: baroAltitude ?? 0, // Use 0 if altitude is null
    velocity: velocity ?? 0,
    heading: trueTrack ?? 0,
    verticalRate: verticalRate ?? 0,
    onGround: onGround,
    lastUpdate: Date.now(),
  };
}

/**
 * Fetch flights from proxy server
 */
export async function fetchFlights(): Promise<FlightRecord[]> {
  const response = await fetch("http://localhost:3001/flights");
  if (!response.ok) {
    throw new Error(`Failed to fetch flights: ${response.status}`);
  }

  const data = await response.json();
  if (!data.states || !Array.isArray(data.states)) {
    return [];
  }

  const records: FlightRecord[] = [];
  for (const state of data.states) {
    const record = parseOpenSkyState(state);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Fetch aircraft metadata from proxy server
 */
export async function fetchAircraftMeta(icao24: string): Promise<FlightMetadata | null> {
  try {
    const response = await fetch(`http://localhost:3001/aircraft-meta/${icao24}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return {
      typecode: data.typecode ?? "",
      model: data.model ?? "",
      registration: data.registration ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Creates a 32x32 aircraft silhouette texture (top-down view)
 * Returns a data URL for use as billboard image
 * Rendered in white for color tinting
 */
export function createAircraftTexture(): string {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const centerX = size / 2;
  const centerY = size / 2;

  // Draw subtle glow behind
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff";

  // Fuselage (pointed nose at top, pointing up)
  ctx.beginPath();
  ctx.moveTo(centerX, 3);           // Nose
  ctx.lineTo(centerX + 2, 8);       // Right side of nose
  ctx.lineTo(centerX + 2, 24);      // Right fuselage
  ctx.lineTo(centerX + 1, 28);      // Right tail
  ctx.lineTo(centerX - 1, 28);      // Left tail
  ctx.lineTo(centerX - 2, 24);      // Left fuselage
  ctx.lineTo(centerX - 2, 8);       // Left side of nose
  ctx.closePath();
  ctx.fill();

  // Main wings (swept back)
  ctx.beginPath();
  ctx.moveTo(centerX, 12);          // Wing root front
  ctx.lineTo(centerX + 13, 18);     // Right wingtip
  ctx.lineTo(centerX + 12, 20);     // Right wing trailing edge
  ctx.lineTo(centerX, 16);          // Wing root back
  ctx.lineTo(centerX - 12, 20);     // Left wing trailing edge
  ctx.lineTo(centerX - 13, 18);     // Left wingtip
  ctx.closePath();
  ctx.fill();

  // Tail wings (horizontal stabilizer)
  ctx.beginPath();
  ctx.moveTo(centerX, 24);          // Tail root front
  ctx.lineTo(centerX + 6, 26);      // Right tail tip
  ctx.lineTo(centerX + 5, 28);      // Right tail back
  ctx.lineTo(centerX, 26);          // Tail root back
  ctx.lineTo(centerX - 5, 28);      // Left tail back
  ctx.lineTo(centerX - 6, 26);      // Left tail tip
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL();
}

export class FlightLayer {
  private viewer: Cesium.Viewer;
  private billboards: Cesium.BillboardCollection | null = null;
  private billboardMap: Map<string, Cesium.Billboard> = new Map();
  private recordMap: Map<string, FlightRecord> = new Map();
  private interpolatedPositions: Map<string, Cesium.Cartesian3> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private onCountUpdate: ((n: number | null) => void) | null = null;
  private selectedIcao24: string | null = null;
  private aircraftTexture: string | null = null;
  private externalDeselectCallback: (() => void) | null = null;
  private following: boolean = false;
  private interpTickRemove: (() => void) | null = null;
  private followTickRemove: (() => void) | null = null;

  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
  }

  /**
   * Show the flight layer - fetch data and render billboards
   */
  async show(): Promise<void> {
    // Create aircraft texture (once, shared by all billboards)
    if (!this.aircraftTexture) {
      this.aircraftTexture = createAircraftTexture();
    }

    // Fetch initial flight data
    const records = await fetchFlights();

    // Create billboard collection
    this.billboards = new Cesium.BillboardCollection({ scene: this.viewer.scene });
    this.viewer.scene.primitives.add(this.billboards);

    // Add billboard for each aircraft
    for (const record of records) {
      this.addBillboard(record);
    }

    // Start polling for updates
    this.updateInterval = setInterval(() => this.refreshFlights(), FLIGHT_UPDATE_INTERVAL);

    // Register preRender listener for position interpolation
    const interpListener = this.viewer.scene.preRender.addEventListener(() => {
      this.interpolatePositions();
    });
    this.interpTickRemove = () => interpListener();

    // Notify count
    this.onCountUpdate?.(this.billboardMap.size);
  }

  /**
   * Hide the flight layer - remove all billboards and stop polling
   */
  hide(): void {
    // Stop follow mode if active
    this.stopFollow();

    // Clear polling interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Remove interpolation preRender listener
    if (this.interpTickRemove) {
      this.interpTickRemove();
      this.interpTickRemove = null;
    }

    // Remove billboard collection from scene
    if (this.billboards) {
      this.viewer.scene.primitives.remove(this.billboards);
      this.billboards = null;
    }

    // Clear maps
    this.billboardMap.clear();
    this.recordMap.clear();
    this.interpolatedPositions.clear();
    this.selectedIcao24 = null;

    // Notify count cleared
    this.onCountUpdate?.(null);
  }

  /**
   * Refresh flight data from server
   */
  async refreshFlights(): Promise<void> {
    try {
      const records = await fetchFlights();
      const currentIcaos = new Set(records.map((r) => r.icao24));

      // Update or add billboards
      for (const record of records) {
        const existingBillboard = this.billboardMap.get(record.icao24);
        if (existingBillboard) {
          // Update existing billboard
          existingBillboard.position = Cesium.Cartesian3.fromDegrees(
            record.longitude,
            record.latitude,
            record.altitude
          );
          existingBillboard.rotation = -Cesium.Math.toRadians(record.heading);
          // Update stored record
          this.recordMap.set(record.icao24, record);
        } else {
          // Add new billboard
          this.addBillboard(record);
        }
      }

      // Remove billboards for aircraft no longer in response
      for (const icao24 of this.billboardMap.keys()) {
        if (!currentIcaos.has(icao24)) {
          const billboard = this.billboardMap.get(icao24);
          if (billboard && this.billboards) {
            this.billboards.remove(billboard);
          }
          this.billboardMap.delete(icao24);
          this.recordMap.delete(icao24);
        }
      }

      // Notify count
      this.onCountUpdate?.(this.billboardMap.size);
    } catch (error) {
      console.error("[FLIGHTS] Refresh error:", error);
    }
  }

  /**
   * Add a billboard for an aircraft
   */
  private addBillboard(record: FlightRecord): void {
    if (!this.billboards || !this.aircraftTexture) return;

    const billboard = this.billboards.add({
      position: Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude),
      image: this.aircraftTexture,
      width: FLIGHT_ICON_SIZE,
      height: FLIGHT_ICON_SIZE,
      color: Cesium.Color.CYAN,
      rotation: -Cesium.Math.toRadians(record.heading),
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      id: record.icao24,
    });

    this.billboardMap.set(record.icao24, billboard);
    this.recordMap.set(record.icao24, record);
  }

  /**
   * Get a flight record by icao24
   */
  getRecord(icao24: string): FlightRecord | undefined {
    return this.recordMap.get(icao24);
  }

  /**
   * Check if an icao24 belongs to this layer
   */
  hasIcao(icao24: string): boolean {
    return this.recordMap.has(icao24);
  }

  /**
   * Select a flight - resize billboard and notify callback
   */
  selectFlight(icao24: string, onSelect: (record: FlightRecord) => void): void {
    // Deselect any currently selected flight first
    this.deselectFlight();

    const record = this.recordMap.get(icao24);
    if (!record) return;

    this.selectedIcao24 = icao24;

    // Resize billboard to selected size
    const billboard = this.billboardMap.get(icao24);
    if (billboard) {
      billboard.width = FLIGHT_ICON_SIZE_SELECTED;
      billboard.height = FLIGHT_ICON_SIZE_SELECTED;
    }

    onSelect(record);
  }

  /**
   * Deselect the current flight - restore billboard size
   */
  deselectFlight(onDeselect?: () => void): void {
    if (this.selectedIcao24) {
      const billboard = this.billboardMap.get(this.selectedIcao24);
      if (billboard) {
        billboard.width = FLIGHT_ICON_SIZE;
        billboard.height = FLIGHT_ICON_SIZE;
      }
      this.selectedIcao24 = null;
    }

    onDeselect?.();
  }

  /**
   * Get the currently selected icao24
   */
  getSelectedIcao24(): string | null {
    return this.selectedIcao24;
  }

  /**
   * Get the billboard collection
   */
  getBillboardCollection(): Cesium.BillboardCollection | null {
    return this.billboards;
  }

  /**
   * Set an external callback to be invoked when a flight is deselected
   * (e.g., when the layer is hidden or aircraft disappears from feed)
   */
  setExternalDeselectCallback(cb: () => void): void {
    this.externalDeselectCallback = cb;
  }

  /**
   * Interpolate positions for all tracked flights using dead-reckoning.
   * Called each frame via preRender listener.
   */
  private interpolatePositions(): void {
    const now = Date.now();

    for (const [icao24, record] of this.recordMap) {
      const billboard = this.billboardMap.get(icao24);
      if (!billboard) continue;

      // Calculate elapsed time since last update, capped at FLIGHT_INTERP_CAP seconds
      let elapsed = (now - record.lastUpdate) / 1000;
      if (elapsed > FLIGHT_INTERP_CAP) {
        elapsed = FLIGHT_INTERP_CAP;
      }

      // Dead-reckoning along great circle (flat approximation sufficient for short intervals)
      const distM = record.velocity * elapsed;
      const headingRad = Cesium.Math.toRadians(record.heading);
      const newLat = record.latitude + (distM * Math.cos(headingRad)) / 111_320;
      const newLon = record.longitude + (distM * Math.sin(headingRad)) / (111_320 * Math.cos(Cesium.Math.toRadians(record.latitude)));

      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, record.altitude);
      billboard.position = pos;
      this.interpolatedPositions.set(icao24, pos);
    }
  }

  /**
   * Get the current interpolated position of a flight.
   * Used by follow mode to track aircraft smoothly.
   */
  getCurrentPosition(icao24: string): Cesium.Cartesian3 | undefined {
    return this.interpolatedPositions.get(icao24);
  }

  /**
   * Start following the currently selected flight.
   * Registers a preRender listener that updates camera each frame.
   * Maintains current camera altitude - only follows horizontally.
   */
  startFollow(): void {
    if (!this.selectedIcao24) return;

    // Remove any existing follow listener
    if (this.followTickRemove) {
      this.followTickRemove();
      this.followTickRemove = null;
    }

    this.following = true;
    
    // Capture current camera height to maintain during follow
    const cameraCartographic = this.viewer.camera.positionCartographic;
    const followHeight = cameraCartographic.height;
    
    console.log("[FLIGHTS] Follow mode started for", this.selectedIcao24, "at height", followHeight);

    const followListener = this.viewer.scene.preRender.addEventListener(() => {
      if (!this.following || !this.selectedIcao24) return;

      const pos = this.getCurrentPosition(this.selectedIcao24);
      if (pos) {
        // Get plane's lon/lat but use our locked camera height
        const planeCartographic = Cesium.Cartographic.fromCartesian(pos);
        const targetAtCameraHeight = Cesium.Cartesian3.fromRadians(
          planeCartographic.longitude,
          planeCartographic.latitude,
          0 // Ground level - camera will be positioned above this
        );
        
        lookAtTarget(this.viewer, targetAtCameraHeight, {
          range: followHeight,
          pitch: Cesium.Math.toRadians(-90), // Look straight down
        });
      }
    });
    this.followTickRemove = () => followListener();
  }

  /**
   * Stop following the currently selected flight.
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
    console.log("[FLIGHTS] Follow mode stopped");
  }

  /**
   * Check if currently in follow mode
   */
  isFollowing(): boolean {
    return this.following;
  }
}
