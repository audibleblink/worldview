/**
 * WorldView - Flight Layer
 *
 * Renders live flights on the globe with:
 * - OpenSky Network data fetching + polling
 * - 3D aircraft models via Entity API
 * - Dead-reckoning position interpolation
 * - Frustum culling for performance
 * - Selection handling
 * - Follow mode via useFollowMode hook
 */

import { onMount, onCleanup, createEffect, createSignal, on } from "solid-js";
import { useCesium } from "../../cesium/useCesium";
import { usePreRender } from "../../cesium/hooks/usePreRender";
import { useFollowMode } from "../../cesium/hooks/useFollowMode";
import { PROXY_ENDPOINTS, LOCAL_ASSETS } from "../../config";
import { selectEntity, clearSelection, type FlightData } from "../../stores/selection";
import {
  flightState,
  setFlights,
  selectFlight,
  followFlight,
  unfollowFlight,
  clearFlights,
  type FlightRecord,
} from "./store";

declare const Cesium: typeof import("cesium");

// Constants
const FLIGHT_UPDATE_INTERVAL = 10_000; // 10 seconds
const FLIGHT_INTERP_CAP = 30; // Max seconds to dead-reckon
const FLIGHT_INTERP_SKIP_FRAMES = 2; // Interpolate every N frames
const FLIGHT_LABEL_VISIBLE_DISTANCE = 200_000; // meters
const MAX_VISIBLE_FLIGHTS = 50;

// 3D Model settings
const MODEL_SCALE = 50;
const MODEL_SCALE_SELECTED = 75;
const MODEL_MIN_PIXEL_SIZE = 64;

// Conversion constants
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG = 111_320;

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

/**
 * Parse OpenSky state vector array into FlightRecord
 */
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
 * Compute orientation quaternion from heading and pitch
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
 */
function estimatePitch(verticalRate: number, velocity: number): number {
  if (velocity < 10) return 0; // Avoid division issues at low speeds
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

/**
 * Format a flight record into a label string
 */
function formatLabelText(record: FlightRecord): string {
  const callsign = record.callsign.trim() || record.icao24.toUpperCase();
  const altFt = Math.round(record.altitude * 3.28084).toLocaleString();
  const heading = Math.round(record.heading);
  return `${callsign} | ${altFt}ft | ${heading}°`;
}

/**
 * Convert FlightRecord to FlightData for selection store
 */
function toFlightData(record: FlightRecord): FlightData {
  return {
    icao24: record.icao24,
    callsign: record.callsign,
    originCountry: "", // Not available from OpenSky states
    position: {
      lat: record.latitude,
      lng: record.longitude,
      alt: record.altitude,
    },
    velocity: record.velocity,
    heading: record.heading,
    verticalRate: record.verticalRate,
    onGround: record.onGround,
  };
}

/**
 * FlightLayer - Renders live flights on the globe
 */
export function FlightLayer() {
  const { viewer, ready } = useCesium();
  const { isFollowing, track, stop: stopFollow } = useFollowMode();

  // Entity and position tracking
  const entityMap = new Map<string, Cesium.Entity>();
  const positionPropertyMap = new Map<string, Cesium.ConstantPositionProperty>();
  const orientationPropertyMap = new Map<string, Cesium.ConstantProperty>();
  const interpolatedPositions = new Map<string, Cesium.Cartesian3>();

  // Frame counter for interpolation skip
  let interpFrameCount = 0;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let screenSpaceHandler: Cesium.ScreenSpaceEventHandler | null = null;

  /**
   * Fetch flights from proxy server
   */
  async function fetchFlights(): Promise<{ records: FlightRecord[]; total: number }> {
    const response = await fetch(PROXY_ENDPOINTS.flights);
    if (!response.ok) {
      throw new Error(`Failed to fetch flights: ${response.status}`);
    }

    const data = await response.json();
    if (!data.states || !Array.isArray(data.states)) {
      return { records: [], total: 0 };
    }

    const records: FlightRecord[] = [];
    for (const state of data.states) {
      const record = parseOpenSkyState(state);
      if (record) {
        records.push(record);
      }
    }

    return { records, total: data.states.length };
  }

  /**
   * Add an entity with 3D model and label for an aircraft
   */
  function addEntity(record: FlightRecord, v: Cesium.Viewer): void {
    const position = Cesium.Cartesian3.fromDegrees(
      record.longitude,
      record.latitude,
      record.altitude
    );

    const pitch = estimatePitch(record.verticalRate, record.velocity);
    const orientation = computeOrientation(position, record.heading, pitch);

    // Create position property and store for efficient updates
    const positionProperty = new Cesium.ConstantPositionProperty(position);
    const orientationProperty = new Cesium.ConstantProperty(orientation);

    const entity = v.entities.add({
      id: record.icao24,
      name: record.callsign || record.icao24,
      position: positionProperty,
      orientation: orientationProperty,
      model: {
        uri: LOCAL_ASSETS.aircraftModel,
        scale: MODEL_SCALE,
        minimumPixelSize: MODEL_MIN_PIXEL_SIZE,
        maximumScale: MODEL_SCALE * 2,
        silhouetteColor: Cesium.Color.CYAN,
        silhouetteSize: 1.0,
      },
      label: {
        text: formatLabelText(record),
        font: "bold 15px Courier New",
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 200000, 0.7),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          FLIGHT_LABEL_VISIBLE_DISTANCE
        ),
      },
    });

    entityMap.set(record.icao24, entity);
    positionPropertyMap.set(record.icao24, positionProperty);
    orientationPropertyMap.set(record.icao24, orientationProperty);
    interpolatedPositions.set(record.icao24, position);
  }

  /**
   * Update an existing entity position (using setValue - Blocklist #1)
   */
  function updateEntityPosition(
    icao24: string,
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): void {
    const positionProperty = positionPropertyMap.get(icao24);
    const orientationProperty = orientationPropertyMap.get(icao24);

    if (positionProperty && orientationProperty) {
      // CRITICAL: Use setValue() to mutate existing property - never allocate new (Blocklist #1)
      positionProperty.setValue(position);
      orientationProperty.setValue(orientation);
    }

    interpolatedPositions.set(icao24, position);
  }

  /**
   * Update entity label text
   */
  function updateEntityLabel(entity: Cesium.Entity, record: FlightRecord): void {
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(formatLabelText(record));
    }
  }

  /**
   * Highlight selected entity
   */
  function highlightEntity(icao24: string, selected: boolean): void {
    const entity = entityMap.get(icao24);
    if (entity?.model) {
      entity.model.scale = new Cesium.ConstantProperty(
        selected ? MODEL_SCALE_SELECTED : MODEL_SCALE
      );
      entity.model.silhouetteColor = new Cesium.ConstantProperty(
        selected ? Cesium.Color.YELLOW : Cesium.Color.CYAN
      );
      entity.model.silhouetteSize = new Cesium.ConstantProperty(selected ? 2.0 : 1.0);
    }
  }

  /**
   * Remove an entity
   */
  function removeEntity(icao24: string, v: Cesium.Viewer): void {
    const entity = entityMap.get(icao24);
    if (entity) {
      v.entities.remove(entity);
      entityMap.delete(icao24);
      positionPropertyMap.delete(icao24);
      orientationPropertyMap.delete(icao24);
      interpolatedPositions.delete(icao24);
    }
  }

  /**
   * Refresh flight data from server
   */
  async function refreshFlights(v: Cesium.Viewer): Promise<void> {
    try {
      const { records: allRecords, total } = await fetchFlights();

      // Filter to nearest flights only
      const records = filterNearestFlights(
        allRecords,
        v.camera.positionWC,
        MAX_VISIBLE_FLIGHTS
      );

      const currentIcaos = new Set(records.map((r) => r.icao24));

      // Update store
      setFlights(records, total);

      // Update or add entities
      for (const record of records) {
        const existingEntity = entityMap.get(record.icao24);
        if (existingEntity) {
          // Update existing entity
          const position = Cesium.Cartesian3.fromDegrees(
            record.longitude,
            record.latitude,
            record.altitude
          );
          const pitch = estimatePitch(record.verticalRate, record.velocity);
          const orientation = computeOrientation(position, record.heading, pitch);

          updateEntityPosition(record.icao24, position, orientation);
          updateEntityLabel(existingEntity, record);
        } else {
          // Add new entity
          addEntity(record, v);
        }
      }

      // Remove entities for aircraft no longer in nearest set
      for (const [icao24] of entityMap) {
        if (!currentIcaos.has(icao24)) {
          // If this was selected, clear selection
          if (flightState.selectedIcao24 === icao24) {
            selectFlight(null);
            clearSelection();
          }
          // If following, stop
          if (flightState.followingIcao24 === icao24) {
            unfollowFlight();
            stopFollow();
          }
          removeEntity(icao24, v);
        }
      }

      console.log(`[FlightLayer] Refreshed: ${entityMap.size}/${total} flights`);
    } catch (error) {
      console.error("[FlightLayer] Refresh error:", error);
    }
  }

  /**
   * Handle flight selection
   */
  function handleSelection(icao24: string): void {
    const previousIcao24 = flightState.selectedIcao24;

    // Unhighlight previous selection
    if (previousIcao24) {
      highlightEntity(previousIcao24, false);
    }

    // Update selection
    selectFlight(icao24);
    highlightEntity(icao24, true);

    // Get flight record and update selection store
    const record = flightState.flights.get(icao24);
    if (record) {
      selectEntity("flight", icao24, toFlightData(record));
    }
  }

  /**
   * Get current interpolated position for follow mode
   */
  function getCurrentPosition(): Cesium.Cartesian3 | null {
    const icao24 = flightState.followingIcao24;
    if (!icao24) return null;
    return interpolatedPositions.get(icao24) ?? null;
  }

  /**
   * Start following the selected flight
   */
  function startFollowingFlight(icao24: string): void {
    followFlight(icao24);

    // Use the follow mode hook with ground-level targeting
    track(getCurrentPosition, {
      heading: 0,
      pitch: Cesium.Math.toRadians(-45),
      range: 50_000, // 50km initial range
      useGroundLevel: true,
    });
  }

  // Dead-reckoning interpolation using usePreRender
  usePreRender((scene) => {
    if (!ready()) return;

    // Skip frames for efficiency
    interpFrameCount++;
    if (interpFrameCount < FLIGHT_INTERP_SKIP_FRAMES) return;
    interpFrameCount = 0;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const now = Date.now();
    const cullingVolume = scene.camera.frustum.computeCullingVolume(
      scene.camera.positionWC,
      scene.camera.directionWC,
      scene.camera.upWC
    );

    // Iterate over all flights in store
    for (const [icao24, record] of flightState.flights) {
      // Skip if no entity
      if (!entityMap.has(icao24)) continue;

      // Calculate elapsed time since last update, capped
      let elapsed = (now - record.lastUpdate) / 1000;
      if (elapsed > FLIGHT_INTERP_CAP) {
        elapsed = FLIGHT_INTERP_CAP;
      }

      // Dead-reckoning along great circle (flat approximation for short intervals)
      const distM = record.velocity * elapsed;
      const headingRad = record.heading * DEG_TO_RAD;
      const cosLat = Math.cos(record.latitude * DEG_TO_RAD);
      const newLat = record.latitude + (distM * Math.cos(headingRad)) / METERS_PER_DEG;
      const newLon =
        record.longitude + (distM * Math.sin(headingRad)) / (METERS_PER_DEG * cosLat);

      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, record.altitude);

      // Frustum culling: skip position updates for off-screen flights
      // But always update followed/selected flights
      const isImportant =
        icao24 === flightState.selectedIcao24 || icao24 === flightState.followingIcao24;

      if (!isImportant) {
        const visibility = cullingVolume.computeVisibility(
          new Cesium.BoundingSphere(pos, 1000)
        );
        if (visibility === Cesium.Intersect.OUTSIDE) {
          // Still update stored position for when it comes back into view
          interpolatedPositions.set(icao24, pos);
          continue;
        }
      }

      // Update entity position and orientation
      const pitch = estimatePitch(record.verticalRate, record.velocity);
      const orientation = computeOrientation(pos, record.heading, pitch);

      updateEntityPosition(icao24, pos, orientation);
    }
  });

  // Mount lifecycle
  onMount(() => {
    console.log("[FlightLayer] mounted");
  });

  // Setup when viewer is ready
  createEffect(
    on(ready, async (isReady) => {
      if (!isReady) return;

      const v = viewer();
      if (!v || v.isDestroyed()) return;

      console.log("[FlightLayer] Initializing...");

      // Initial fetch
      await refreshFlights(v);

      // Start polling interval
      updateInterval = setInterval(() => {
        const currentViewer = viewer();
        if (currentViewer && !currentViewer.isDestroyed()) {
          refreshFlights(currentViewer);
        }
      }, FLIGHT_UPDATE_INTERVAL);

      // Setup click handler for selection
      screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      screenSpaceHandler.setInputAction(
        (click: { position: Cesium.Cartesian2 }) => {
          const picked = v.scene.pick(click.position);

          if (Cesium.defined(picked) && picked.id && picked.id instanceof Cesium.Entity) {
            const icao24 = picked.id.id;

            // Check if this entity belongs to us
            if (entityMap.has(icao24)) {
              handleSelection(icao24);
            }
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );

      // Setup double-click for follow mode
      screenSpaceHandler.setInputAction(
        (click: { position: Cesium.Cartesian2 }) => {
          const picked = v.scene.pick(click.position);

          if (Cesium.defined(picked) && picked.id && picked.id instanceof Cesium.Entity) {
            const icao24 = picked.id.id;

            if (entityMap.has(icao24)) {
              // Select first
              handleSelection(icao24);
              // Then follow
              startFollowingFlight(icao24);
            }
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );
    })
  );

  // Cleanup on unmount
  onCleanup(() => {
    console.log("[FlightLayer] unmounting...");

    // Stop follow mode
    if (isFollowing()) {
      stopFollow();
    }

    // Clear polling interval
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    // Destroy screen space handler
    if (screenSpaceHandler) {
      screenSpaceHandler.destroy();
      screenSpaceHandler = null;
    }

    // Remove all entities
    const v = viewer();
    if (v && !v.isDestroyed()) {
      for (const [icao24] of entityMap) {
        removeEntity(icao24, v);
      }
    }

    // Clear store
    clearFlights();

    console.log("[FlightLayer] unmounted");
  });

  // Layers don't render DOM - they add entities to Cesium
  return null;
}

export default FlightLayer;
