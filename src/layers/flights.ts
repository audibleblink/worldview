/**
 * FlightLayer - Real-time aircraft tracking via OpenSky Network
 * Renders aircraft as rotated billboard icons on the globe
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");

import { lookAtTarget, unlockCamera } from "../camera.ts";
import { logError } from "../errors.ts";

// Constants
const FLIGHT_UPDATE_INTERVAL = 10_000;
const FLIGHT_ICON_SIZE = 28;
const FLIGHT_ICON_SIZE_SELECTED = 40;
const FLIGHT_INTERP_CAP = 30;       // seconds max dead-reckoning
const FLIGHT_FOLLOW_RANGE = 50_000; // meters
const FLIGHT_FOLLOW_PITCH = -30;    // degrees
const FLIGHT_LABEL_VISIBLE_DISTANCE = 200_000; // meters - labels hidden beyond this

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

/** OpenSky state array index constants */
const OPENSKY = {
  ICAO24: 0,
  CALLSIGN: 1,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
} as const;

function parseOpenSkyState(state: unknown[]): FlightRecord | null {
  const icao24 = state[OPENSKY.ICAO24] as string | null;
  const longitude = state[OPENSKY.LONGITUDE] as number | null;
  const latitude = state[OPENSKY.LATITUDE] as number | null;
  const onGround = state[OPENSKY.ON_GROUND] as boolean;

  // Filter out records with missing critical data or on ground
  if (!icao24 || longitude === null || latitude === null || onGround) {
    return null;
  }

  return {
    icao24,
    callsign: (state[OPENSKY.CALLSIGN] as string | null)?.trim() ?? "",
    longitude,
    latitude,
    altitude: (state[OPENSKY.BARO_ALTITUDE] as number | null) ?? 0,
    velocity: (state[OPENSKY.VELOCITY] as number | null) ?? 0,
    heading: (state[OPENSKY.TRUE_TRACK] as number | null) ?? 0,
    verticalRate: (state[OPENSKY.VERTICAL_RATE] as number | null) ?? 0,
    onGround,
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
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      typecode: data.typecode ?? "",
      model: data.model ?? "",
      registration: data.registration ?? "",
    };
  } catch (error) {
    logError("FLIGHTS", `Failed to fetch metadata for ${icao24}`, error);
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
  private labels: Cesium.LabelCollection | null = null;
  private billboardMap: Map<string, Cesium.Billboard> = new Map();
  private labelMap: Map<string, Cesium.Label> = new Map();
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

    // Create label collection for callsign/altitude/heading labels
    this.labels = new Cesium.LabelCollection({ scene: this.viewer.scene });
    this.viewer.scene.primitives.add(this.labels);

    // Add billboard and label for each aircraft
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

    // Remove label collection from scene
    if (this.labels) {
      this.viewer.scene.primitives.remove(this.labels);
      this.labels = null;
    }

    // Clear maps
    this.billboardMap.clear();
    this.labelMap.clear();
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

      // Update or add billboards and labels
      for (const record of records) {
        const existingBillboard = this.billboardMap.get(record.icao24);
        if (existingBillboard) {
          // Update existing billboard
          const position = Cesium.Cartesian3.fromDegrees(
            record.longitude,
            record.latitude,
            record.altitude
          );
          existingBillboard.position = position;
          existingBillboard.rotation = -Cesium.Math.toRadians(record.heading);
          
          // Update existing label
          const existingLabel = this.labelMap.get(record.icao24);
          if (existingLabel) {
            existingLabel.position = position;
            existingLabel.text = this.formatLabelText(record);
          }
          
          // Update stored record
          this.recordMap.set(record.icao24, record);
        } else {
          // Add new billboard and label
          this.addBillboard(record);
        }
      }

      // Remove billboards and labels for aircraft no longer in response
      for (const [icao24, billboard] of this.billboardMap) {
        if (!currentIcaos.has(icao24)) {
          this.billboards?.remove(billboard);
          this.billboardMap.delete(icao24);
          
          const label = this.labelMap.get(icao24);
          if (label) {
            this.labels?.remove(label);
            this.labelMap.delete(icao24);
          }
          
          this.recordMap.delete(icao24);
        }
      }

      // Notify count
      this.onCountUpdate?.(this.billboardMap.size);
    } catch (error) {
      logError("FLIGHTS", "Refresh error", error);
    }
  }

  /**
   * Format a flight record into a label string
   */
  private formatLabelText(record: FlightRecord): string {
    const callsign = record.callsign.trim() || record.icao24.toUpperCase();
    const altFt = Math.round(record.altitude * 3.28084).toLocaleString();
    const heading = Math.round(record.heading);
    return `${callsign} | ${altFt}ft | ${heading}°`;
  }

  /**
   * Add a billboard and label for an aircraft
   */
  private addBillboard(record: FlightRecord): void {
    if (!this.billboards || !this.aircraftTexture) return;

    const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);

    // Add billboard with zoom-responsive scaling
    const billboard = this.billboards.add({
      position,
      image: this.aircraftTexture,
      width: FLIGHT_ICON_SIZE,
      height: FLIGHT_ICON_SIZE,
      color: Cesium.Color.CYAN,
      rotation: -Cesium.Math.toRadians(record.heading),
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      id: record.icao24,
      scaleByDistance: new Cesium.NearFarScalar(5000, 1.2, 500000, 0.6),
    });

    this.billboardMap.set(record.icao24, billboard);
    this.recordMap.set(record.icao24, record);

    // Add label with callsign | altitude | heading (above the plane)
    if (this.labels) {
      const label = this.labels.add({
        position,
        text: this.formatLabelText(record),
        font: "bold 15px Courier New",
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 200000, 0.7),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, FLIGHT_LABEL_VISIBLE_DISTANCE),
        id: `label-${record.icao24}`,
      });
      this.labelMap.set(record.icao24, label);
    }
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

      // Update label position to match
      const label = this.labelMap.get(icao24);
      if (label) {
        label.position = pos;
      }
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
   * User can orbit around the target (change heading/pitch/range) but cannot pan away.
   */
  startFollow(): void {
    if (!this.selectedIcao24) return;

    // Remove any existing follow listener
    if (this.followTickRemove) {
      this.followTickRemove();
      this.followTickRemove = null;
    }

    this.following = true;
    
    // Capture initial camera state
    const cameraCartographic = this.viewer.camera.positionCartographic;
    const initialRange = cameraCartographic.height;
    
    console.log("[FLIGHTS] Follow mode started for", this.selectedIcao24, "at range", initialRange);

    // Store HPR values - these are what we pass to lookAt
    let heading = 0;
    let pitch = Cesium.Math.toRadians(-45);
    let range = initialRange;
    
    // Track where we positioned camera last frame to detect user input
    let lastCamPos: Cesium.Cartesian3 | null = null;

    const followListener = this.viewer.scene.preRender.addEventListener(() => {
      if (!this.following || !this.selectedIcao24) return;

      const pos = this.getCurrentPosition(this.selectedIcao24);
      if (pos) {
        // Get plane's lon/lat but use ground level as target
        const planeCartographic = Cesium.Cartographic.fromCartesian(pos);
        const target = Cesium.Cartesian3.fromRadians(
          planeCartographic.longitude,
          planeCartographic.latitude,
          0 // Ground level - camera will be positioned above this
        );

        const camera = this.viewer.camera;

        // Check if user moved the camera since last frame
        if (lastCamPos !== null) {
          const actualPos = camera.positionWC;
          const userMoved = !Cesium.Cartesian3.equalsEpsilon(actualPos, lastCamPos, 0, 1.0);
          
          if (userMoved) {
            // User orbited - camera.heading/pitch are now updated by ScreenSpaceCameraController
            // These ARE the correct values relative to the current lookAt reference frame
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

  /**
   * Get the callsign of the currently followed flight
   */
  getFollowedCallsign(): string | null {
    if (!this.following || !this.selectedIcao24) return null;
    const record = this.recordMap.get(this.selectedIcao24);
    return record?.callsign || null;
  }

  /**
   * Find a flight by callsign (exact match)
   * @param callsign - The callsign to search for (e.g., "UAL123")
   * @returns The flight record if found, null otherwise
   */
  findByCallsign(callsign: string): FlightRecord | null {
    const searchCallsign = callsign.toUpperCase().trim();
    for (const record of this.recordMap.values()) {
      if (record.callsign.toUpperCase().trim() === searchCallsign) {
        return record;
      }
    }
    return null;
  }
}
