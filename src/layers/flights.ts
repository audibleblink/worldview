/**
 * FlightLayer - Real-time aircraft tracking via OpenSky Network
 * Renders aircraft as 3D models on the globe
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");

import { lookAtTarget, unlockCamera } from "../camera.ts";
import { logError } from "../errors.ts";

// Constants
const FLIGHT_UPDATE_INTERVAL = 10_000;
const FLIGHT_INTERP_CAP = 30;       // seconds max dead-reckoning
const FLIGHT_FOLLOW_RANGE = 50_000; // meters
const FLIGHT_FOLLOW_PITCH = -30;    // degrees
const FLIGHT_LABEL_VISIBLE_DISTANCE = 200_000; // meters - labels hidden beyond this
const FLIGHT_INTERP_SKIP_FRAMES = 2; // interpolate every N frames (1 = every frame, 2 = every other)

// 3D Model settings
const AIRCRAFT_MODEL_URL = "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb";
const MODEL_SCALE = 50;            // Scale factor for the model
const MODEL_SCALE_SELECTED = 75;   // Scale factor when selected
const MODEL_MIN_PIXEL_SIZE = 64;   // Minimum pixel size to remain clickable at distance
const MAX_VISIBLE_FLIGHTS = 50;    // Only render the N nearest flights to camera

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
 * Compute orientation quaternion from heading, pitch, and roll
 * @param position - Cartesian3 position of the aircraft
 * @param heading - Heading in degrees (0 = North, 90 = East)
 * @param pitch - Pitch in degrees (positive = nose up) - derived from vertical rate
 * @param roll - Roll in degrees (positive = right wing down) - default 0
 */
function computeOrientation(
  position: Cesium.Cartesian3,
  heading: number,
  pitch: number = 0,
  roll: number = 0
): Cesium.Quaternion {
  // The Cesium Air model's nose points along +X axis by default
  // Cesium heading 0 = North (+Y in local ENU frame)
  // We need to rotate the model 90° to align +X (model nose) with +Y (North)
  // Then apply the flight heading on top of that
  const adjustedHeading = heading - 90;
  
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(adjustedHeading),
    Cesium.Math.toRadians(pitch),
    Cesium.Math.toRadians(roll)
  );
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
}

/**
 * Estimate pitch angle from vertical rate and velocity
 * Simple approximation: pitch = arctan(verticalRate / horizontalVelocity)
 */
function estimatePitch(verticalRate: number, velocity: number): number {
  if (velocity < 10) return 0; // Avoid division issues at low speeds
  // verticalRate is in m/s, velocity is horizontal ground speed in m/s
  const pitchRad = Math.atan2(verticalRate, velocity);
  return Cesium.Math.toDegrees(pitchRad);
}

/**
 * Filter flight records to only the N nearest to the camera
 */
function filterNearestFlights(
  records: FlightRecord[],
  cameraPosition: Cesium.Cartesian3,
  maxCount: number
): FlightRecord[] {
  if (records.length <= maxCount) return records;

  // Calculate distance from camera to each flight
  const withDistance = records.map((record) => {
    const flightPos = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );
    const distance = Cesium.Cartesian3.distance(cameraPosition, flightPos);
    return { record, distance };
  });

  // Sort by distance and take the nearest N
  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, maxCount).map((item) => item.record);
}

export class FlightLayer {
  private viewer: Cesium.Viewer;
  private entityMap: Map<string, Cesium.Entity> = new Map();
  private recordMap: Map<string, FlightRecord> = new Map();
  private interpolatedPositions: Map<string, Cesium.Cartesian3> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private onCountUpdate: ((n: number | null) => void) | null = null;
  private selectedIcao24: string | null = null;
  private externalDeselectCallback: (() => void) | null = null;
  private following: boolean = false;
  private interpFrameCount: number = 0;
  private interpTickRemove: (() => void) | null = null;
  private followTickRemove: (() => void) | null = null;

  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
  }

  /**
   * Show the flight layer - fetch data and render 3D model entities
   */
  async show(): Promise<void> {
    // Fetch initial flight data
    const allRecords = await fetchFlights();
    
    // Filter to nearest flights only
    const records = filterNearestFlights(
      allRecords,
      this.viewer.camera.positionWC,
      MAX_VISIBLE_FLIGHTS
    );

    // Add entity for each aircraft
    for (const record of records) {
      this.addEntity(record);
    }

    // Start polling for updates
    this.updateInterval = setInterval(() => this.refreshFlights(), FLIGHT_UPDATE_INTERVAL);

    // Register preRender listener for position interpolation
    const interpListener = this.viewer.scene.preRender.addEventListener(() => {
      this.interpolatePositions();
    });
    this.interpTickRemove = () => interpListener();

    // Notify count
    this.onCountUpdate?.(this.entityMap.size);
  }

  /**
   * Hide the flight layer - remove all entities and stop polling
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

    // Remove all entities from viewer
    for (const entity of this.entityMap.values()) {
      this.viewer.entities.remove(entity);
    }

    // Clear maps
    this.entityMap.clear();
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
      const allRecords = await fetchFlights();
      
      // Filter to nearest flights only
      const records = filterNearestFlights(
        allRecords,
        this.viewer.camera.positionWC,
        MAX_VISIBLE_FLIGHTS
      );
      const currentIcaos = new Set(records.map((r) => r.icao24));

      // Update or add entities
      for (const record of records) {
        const existingEntity = this.entityMap.get(record.icao24);
        if (existingEntity) {
          // Update existing entity position and orientation
          const position = Cesium.Cartesian3.fromDegrees(
            record.longitude,
            record.latitude,
            record.altitude
          );
          
          const pitch = estimatePitch(record.verticalRate, record.velocity);
          const orientation = computeOrientation(position, record.heading, pitch);
          
          existingEntity.position = new Cesium.ConstantPositionProperty(position);
          existingEntity.orientation = new Cesium.ConstantProperty(orientation);
          
          // Update label text
          if (existingEntity.label) {
            existingEntity.label.text = new Cesium.ConstantProperty(this.formatLabelText(record));
          }
          
          // Update stored record
          this.recordMap.set(record.icao24, record);
        } else {
          // Add new entity
          this.addEntity(record);
        }
      }

      // Remove entities for aircraft no longer in nearest set
      for (const [icao24, entity] of this.entityMap) {
        if (!currentIcaos.has(icao24)) {
          this.viewer.entities.remove(entity);
          this.entityMap.delete(icao24);
          this.recordMap.delete(icao24);
        }
      }

      // Notify count
      this.onCountUpdate?.(this.entityMap.size);
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
   * Add an entity with 3D model and label for an aircraft
   */
  private addEntity(record: FlightRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );

    // Calculate pitch from vertical rate
    const pitch = estimatePitch(record.verticalRate, record.velocity);
    const orientation = computeOrientation(position, record.heading, pitch);

    // Create entity with 3D model and label
    const entity = this.viewer.entities.add({
      id: record.icao24,
      name: record.callsign || record.icao24,
      position,
      orientation,
      model: {
        uri: AIRCRAFT_MODEL_URL,
        scale: MODEL_SCALE,
        minimumPixelSize: MODEL_MIN_PIXEL_SIZE,
        maximumScale: MODEL_SCALE * 2,
        silhouetteColor: Cesium.Color.CYAN,
        silhouetteSize: 1.0,
      },
      label: {
        text: this.formatLabelText(record),
        font: "bold 15px Courier New",
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 200000, 0.7),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, FLIGHT_LABEL_VISIBLE_DISTANCE),
      },
    });

    this.entityMap.set(record.icao24, entity);
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
   * Select a flight - highlight model and notify callback
   */
  selectFlight(icao24: string, onSelect: (record: FlightRecord) => void): void {
    // Deselect any currently selected flight first
    this.deselectFlight();

    const record = this.recordMap.get(icao24);
    if (!record) return;

    this.selectedIcao24 = icao24;

    // Highlight the selected entity
    const entity = this.entityMap.get(icao24);
    if (entity?.model) {
      entity.model.scale = new Cesium.ConstantProperty(MODEL_SCALE_SELECTED);
      entity.model.silhouetteColor = new Cesium.ConstantProperty(Cesium.Color.YELLOW);
      entity.model.silhouetteSize = new Cesium.ConstantProperty(2.0);
    }

    onSelect(record);
  }

  /**
   * Deselect the current flight - restore model appearance
   */
  deselectFlight(onDeselect?: () => void): void {
    if (this.selectedIcao24) {
      const entity = this.entityMap.get(this.selectedIcao24);
      if (entity?.model) {
        entity.model.scale = new Cesium.ConstantProperty(MODEL_SCALE);
        entity.model.silhouetteColor = new Cesium.ConstantProperty(Cesium.Color.CYAN);
        entity.model.silhouetteSize = new Cesium.ConstantProperty(1.0);
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
   * Get an entity by icao24
   */
  getEntity(icao24: string): Cesium.Entity | undefined {
    return this.entityMap.get(icao24);
  }

  /**
   * Check if the layer has any entities
   */
  hasEntities(): boolean {
    return this.entityMap.size > 0;
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
   * Called each frame via preRender listener, but skips frames for efficiency.
   */
  private interpolatePositions(): void {
    // Skip frames to reduce CPU load (interpolation every N frames is visually smooth enough)
    this.interpFrameCount++;
    if (this.interpFrameCount < FLIGHT_INTERP_SKIP_FRAMES) return;
    this.interpFrameCount = 0;

    const now = Date.now();
    const cullingVolume = this.viewer.camera.frustum.computeCullingVolume(
      this.viewer.camera.positionWC,
      this.viewer.camera.directionWC,
      this.viewer.camera.upWC
    );

    // Pre-compute constants outside loop
    const DEG_TO_RAD = Cesium.Math.RADIANS_PER_DEGREE;
    const METERS_PER_DEG = 111_320;

    for (const [icao24, record] of this.recordMap) {
      const entity = this.entityMap.get(icao24);
      if (!entity) continue;

      // Calculate elapsed time since last update, capped at FLIGHT_INTERP_CAP seconds
      let elapsed = (now - record.lastUpdate) / 1000;
      if (elapsed > FLIGHT_INTERP_CAP) {
        elapsed = FLIGHT_INTERP_CAP;
      }

      // Dead-reckoning along great circle (flat approximation sufficient for short intervals)
      const distM = record.velocity * elapsed;
      const headingRad = record.heading * DEG_TO_RAD;
      const cosLat = Math.cos(record.latitude * DEG_TO_RAD);
      const newLat = record.latitude + (distM * Math.cos(headingRad)) / METERS_PER_DEG;
      const newLon = record.longitude + (distM * Math.sin(headingRad)) / (METERS_PER_DEG * cosLat);

      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, record.altitude);
      
      // Frustum culling: skip position updates for off-screen flights (except followed flight)
      if (icao24 !== this.selectedIcao24) {
        const visibility = cullingVolume.computeVisibility(new Cesium.BoundingSphere(pos, 1000));
        if (visibility === Cesium.Intersect.OUTSIDE) {
          // Still update the stored position for when it comes back into view
          this.interpolatedPositions.set(icao24, pos);
          continue;
        }
      }

      // Update entity position and orientation
      const pitch = estimatePitch(record.verticalRate, record.velocity);
      const orientation = computeOrientation(pos, record.heading, pitch);
      
      entity.position = new Cesium.ConstantPositionProperty(pos);
      entity.orientation = new Cesium.ConstantProperty(orientation);
      
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
