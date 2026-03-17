/**
 * Flight Layer - Live aircraft with 3D models and dead-reckoning
 */

import { onCleanup, createEffect, on } from "solid-js";
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
const UPDATE_INTERVAL_MS = 10_000;
const INTERP_CAP_SEC = 30;
const INTERP_SKIP_FRAMES = 2;
const LABEL_VISIBLE_DISTANCE = 200_000;
const MAX_VISIBLE_FLIGHTS = 50;
const MODEL_SCALE = 50;
const MODEL_SCALE_SELECTED = 75;
const MODEL_MIN_PIXEL_SIZE = 64;
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG = 111_320;

interface ProxyFlightState {
  icao24: string;
  callsign: string | null;
  longitude: number;
  latitude: number;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean;
}

function parseProxyFlightState(state: ProxyFlightState): FlightRecord | null {
  const { icao24, longitude, latitude, onGround } = state;
  if (!icao24 || longitude === null || latitude === null || onGround) return null;

  return {
    icao24,
    callsign: state.callsign?.trim() ?? "",
    longitude,
    latitude,
    altitude: state.altitude ?? 0,
    velocity: state.velocity ?? 0,
    heading: state.heading ?? 0,
    verticalRate: state.verticalRate ?? 0,
    onGround,
    lastUpdate: Date.now(),
  };
}

/** Compute orientation quaternion from heading and pitch */
function computeOrientation(position: Cesium.Cartesian3, heading: number, pitch = 0): Cesium.Quaternion {
  // Adjust heading: model nose is +X, Cesium heading 0 = North (+Y)
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(heading - 90),
    Cesium.Math.toRadians(pitch),
    0
  );
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
}

/** Estimate pitch from vertical rate and velocity */
function estimatePitch(verticalRate: number, velocity: number): number {
  return velocity < 10 ? 0 : Cesium.Math.toDegrees(Math.atan2(verticalRate, velocity));
}

/** Filter to N nearest flights to camera */
function filterNearestFlights(records: FlightRecord[], cameraPos: Cesium.Cartesian3, maxCount: number): FlightRecord[] {
  if (records.length <= maxCount) return records;

  return records
    .map((record) => ({
      record,
      distance: Cesium.Cartesian3.distance(cameraPos, Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxCount)
    .map((item) => item.record);
}

function formatLabelText(record: FlightRecord): string {
  const callsign = record.callsign.trim() || record.icao24.toUpperCase();
  return `${callsign} | ${Math.round(record.altitude * 3.28084).toLocaleString()}ft | ${Math.round(record.heading)}°`;
}

function toFlightData(record: FlightRecord): FlightData {
  return {
    icao24: record.icao24,
    callsign: record.callsign,
    originCountry: "",
    position: { lat: record.latitude, lng: record.longitude, alt: record.altitude },
    velocity: record.velocity,
    heading: record.heading,
    verticalRate: record.verticalRate,
    onGround: record.onGround,
  };
}

export function FlightLayer() {
  const { viewer, ready } = useCesium();
  const { isFollowing, track, stop: stopFollow } = useFollowMode();

  const entityMap = new Map<string, Cesium.Entity>();
  const positionPropertyMap = new Map<string, Cesium.ConstantPositionProperty>();
  const orientationPropertyMap = new Map<string, Cesium.ConstantProperty>();
  const interpolatedPositions = new Map<string, Cesium.Cartesian3>();

  let interpFrameCount = 0;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let screenSpaceHandler: Cesium.ScreenSpaceEventHandler | null = null;

  async function fetchFlights(): Promise<{ records: FlightRecord[]; total: number }> {
    const response = await fetch(PROXY_ENDPOINTS.flights);
    if (!response.ok) throw new Error(`Failed to fetch flights: ${response.status}`);

    const data = await response.json();
    if (!data.states?.length) return { records: [], total: 0 };

    const records = data.states.map((s: ProxyFlightState) => parseProxyFlightState(s)).filter(Boolean) as FlightRecord[];
    return { records, total: data.states.length };
  }

  function addEntity(record: FlightRecord, v: Cesium.Viewer): void {
    const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);
    const pitch = estimatePitch(record.verticalRate, record.velocity);
    const orientation = computeOrientation(position, record.heading, pitch);

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
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, LABEL_VISIBLE_DISTANCE),
      },
    });

    entityMap.set(record.icao24, entity);
    positionPropertyMap.set(record.icao24, positionProperty);
    orientationPropertyMap.set(record.icao24, orientationProperty);
    interpolatedPositions.set(record.icao24, position);
  }

  function updateEntityPosition(icao24: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion): void {
    positionPropertyMap.get(icao24)?.setValue(position);
    orientationPropertyMap.get(icao24)?.setValue(orientation);
    interpolatedPositions.set(icao24, position);
  }

  function updateEntityLabel(entity: Cesium.Entity, record: FlightRecord): void {
    if (entity.label) entity.label.text = new Cesium.ConstantProperty(formatLabelText(record));
  }

  function highlightEntity(icao24: string, selected: boolean): void {
    const entity = entityMap.get(icao24);
    if (!entity?.model) return;
    entity.model.scale = new Cesium.ConstantProperty(selected ? MODEL_SCALE_SELECTED : MODEL_SCALE);
    entity.model.silhouetteColor = new Cesium.ConstantProperty(selected ? Cesium.Color.YELLOW : Cesium.Color.CYAN);
    entity.model.silhouetteSize = new Cesium.ConstantProperty(selected ? 2.0 : 1.0);
  }

  function removeEntity(icao24: string, v: Cesium.Viewer): void {
    const entity = entityMap.get(icao24);
    if (!entity) return;
    v.entities.remove(entity);
    entityMap.delete(icao24);
    positionPropertyMap.delete(icao24);
    orientationPropertyMap.delete(icao24);
    interpolatedPositions.delete(icao24);
  }

  async function refreshFlights(v: Cesium.Viewer): Promise<void> {
    try {
      const { records: allRecords, total } = await fetchFlights();
      const records = filterNearestFlights(allRecords, v.camera.positionWC, MAX_VISIBLE_FLIGHTS);
      const currentIcaos = new Set(records.map((r) => r.icao24));

      setFlights(records, total);

      for (const record of records) {
        const existing = entityMap.get(record.icao24);
        if (existing) {
          const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);
          updateEntityPosition(record.icao24, position, computeOrientation(position, record.heading, estimatePitch(record.verticalRate, record.velocity)));
          updateEntityLabel(existing, record);
        } else {
          addEntity(record, v);
        }
      }

      for (const [icao24] of entityMap) {
        if (!currentIcaos.has(icao24)) {
          if (flightState.selectedIcao24 === icao24) { selectFlight(null); clearSelection(); }
          if (flightState.followingIcao24 === icao24) { unfollowFlight(); stopFollow(); }
          removeEntity(icao24, v);
        }
      }
    } catch (error) {
      console.error("[FlightLayer] Refresh error:", error);
    }
  }

  function handleSelection(icao24: string): void {
    const prev = flightState.selectedIcao24;
    if (prev) highlightEntity(prev, false);

    selectFlight(icao24);
    highlightEntity(icao24, true);

    const record = flightState.flights.get(icao24);
    if (record) selectEntity("flight", icao24, toFlightData(record));
  }

  function getCurrentPosition(): Cesium.Cartesian3 | null {
    const icao24 = flightState.followingIcao24;
    return icao24 ? interpolatedPositions.get(icao24) ?? null : null;
  }

  function startFollowingFlight(icao24: string): void {
    followFlight(icao24);
    track(getCurrentPosition, { heading: 0, pitch: Cesium.Math.toRadians(-45), range: 50_000, useGroundLevel: true });
  }

  // Dead-reckoning interpolation
  usePreRender((scene) => {
    if (!ready()) return;
    if (++interpFrameCount < INTERP_SKIP_FRAMES) return;
    interpFrameCount = 0;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const now = Date.now();
    const cullingVolume = scene.camera.frustum.computeCullingVolume(scene.camera.positionWC, scene.camera.directionWC, scene.camera.upWC);

    for (const [icao24, record] of flightState.flights) {
      if (!entityMap.has(icao24)) continue;

      const elapsed = Math.min((now - record.lastUpdate) / 1000, INTERP_CAP_SEC);
      const distM = record.velocity * elapsed;
      const headingRad = record.heading * DEG_TO_RAD;
      const cosLat = Math.cos(record.latitude * DEG_TO_RAD);
      const newLat = record.latitude + (distM * Math.cos(headingRad)) / METERS_PER_DEG;
      const newLon = record.longitude + (distM * Math.sin(headingRad)) / (METERS_PER_DEG * cosLat);
      const pos = Cesium.Cartesian3.fromDegrees(newLon, newLat, record.altitude);

      const isImportant = icao24 === flightState.selectedIcao24 || icao24 === flightState.followingIcao24;
      if (!isImportant && cullingVolume.computeVisibility(new Cesium.BoundingSphere(pos, 1000)) === Cesium.Intersect.OUTSIDE) {
        interpolatedPositions.set(icao24, pos);
        continue;
      }

      updateEntityPosition(icao24, pos, computeOrientation(pos, record.heading, estimatePitch(record.verticalRate, record.velocity)));
    }
  });

  // Setup when viewer is ready
  createEffect(on(ready, async (isReady) => {
    if (!isReady) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    await refreshFlights(v);

    updateInterval = setInterval(() => {
      const current = viewer();
      if (current && !current.isDestroyed()) refreshFlights(current);
    }, UPDATE_INTERVAL_MS);

    screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = v.scene.pick(click.position);
      if (picked?.id instanceof Cesium.Entity && entityMap.has(picked.id.id)) {
        handleSelection(picked.id.id);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = v.scene.pick(click.position);
      if (picked?.id instanceof Cesium.Entity && entityMap.has(picked.id.id)) {
        handleSelection(picked.id.id);
        startFollowingFlight(picked.id.id);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }));

  onCleanup(() => {
    if (isFollowing()) stopFollow();
    if (updateInterval) clearInterval(updateInterval);
    if (screenSpaceHandler) screenSpaceHandler.destroy();

    const v = viewer();
    if (v && !v.isDestroyed()) {
      for (const [icao24] of entityMap) removeEntity(icao24, v);
    }

    clearFlights();
  });

  return null;
}
