/**
 * WorldView - Plane Layer (SolidJS)
 *
 * Renders planes from OpenSky Network using BillboardCollection.
 * Mirrors ShipLayer pattern for consistency.
 */

import { onCleanup, createEffect, on } from "solid-js";
import { useCesium } from "../../cesium/useCesium";
import { createBillboardCollection } from "../../cesium/createBillboardCollection";
import { useCamera } from "../../cesium/hooks/useCamera";
import { usePreRender } from "../../cesium/hooks/usePreRender";
import { useFollowMode } from "../../cesium/hooks/useFollowMode";
import { PROXY_ENDPOINTS } from "../../config";
import { selectEntity, clearSelection, type FlightData } from "../../stores/selection";
import { camera } from "../../stores/camera";
import {
  planeState,
  updatePlanes,
  updateTrail,
  clearTrailsExcept,
  setLoading,
  setError,
  setRateLimited,
  setLastBbox,
  selectPlane,
  followPlane,
  unfollowPlane,
  getPlaneByIcao24,
  clearPlanes,
} from "./store";
import {
  type PlaneRecord,
  type BBox,
  PLANE_UPDATE_INTERVAL,
  PLANE_RATE_LIMITED_INTERVAL,
  PLANE_RATE_LIMIT_RECOVERY_MS,
  MAX_TRAIL_POINTS,
  MAX_VISIBLE_PLANES,
  PLANE_FOLLOW_RANGE,
  PLANE_FOLLOW_PITCH,
  PLANE_LABEL_VISIBLE_DISTANCE,
  BILLBOARD_SCALE,
  BILLBOARD_SCALE_SELECTED,
  CAMERA_MOVE_DEBOUNCE_MS,
  VIEWPORT_FALLBACK_DEGREES,
} from "./types";
import { formatAltitude, getAirlineFromCallsign } from "./aircraftTypes";

declare const Cesium: typeof import("cesium");

// ==================== LAZY-INITIALIZED CACHES ====================

let planeIconCache: string | null = null;

function getPlaneIcon(): string {
  if (planeIconCache) return planeIconCache;

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(28, 28);
  ctx.lineTo(16, 22);
  ctx.lineTo(4, 28);
  ctx.closePath();
  ctx.fill();

  planeIconCache = canvas.toDataURL("image/png");
  return planeIconCache;
}

function getAltitudeColor(altitudeMeters: number): Cesium.Color {
  const feet = altitudeMeters * 3.28084;
  if (feet < 10000) return Cesium.Color.LIME;
  if (feet < 25000) return Cesium.Color.YELLOW;
  if (feet < 35000) return Cesium.Color.ORANGE;
  return Cesium.Color.CYAN;
}

function filterNearestPlanes(
  records: PlaneRecord[],
  cameraPosition: Cesium.Cartesian3,
  maxCount: number
): PlaneRecord[] {
  if (records.length <= maxCount) return records;

  const withDistance = records.map((record) => {
    const planePos = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);
    const distance = Cesium.Cartesian3.distance(cameraPosition, planePos);
    return { record, distance };
  });

  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, maxCount).map((item) => item.record);
}

function hasBboxChangedSignificantly(lastBbox: BBox | null, newBbox: BBox): boolean {
  if (!lastBbox) return true;

  const lastCenterLat = (lastBbox.north + lastBbox.south) / 2;
  const lastCenterLon = (lastBbox.east + lastBbox.west) / 2;
  const newCenterLat = (newBbox.north + newBbox.south) / 2;
  const newCenterLon = (newBbox.east + newBbox.west) / 2;

  const lastHeight = lastBbox.north - lastBbox.south;
  const lastWidth = lastBbox.east - lastBbox.west;
  const threshold = Math.min(lastHeight, lastWidth) * 0.25;

  return Math.abs(newCenterLat - lastCenterLat) > threshold || Math.abs(newCenterLon - lastCenterLon) > threshold;
}

function formatLabelText(record: PlaneRecord): string {
  const callsign = record.callsign || record.icao24;
  return `${callsign}\n${formatAltitude(record.altitude)}`;
}

interface PlanesApiResponse {
  planes: PlaneRecord[];
  count: number;
  rateLimited?: boolean;
  error?: string;
}

export function PlaneLayer() {
  const { viewer, ready } = useCesium();
  const { state: cameraState, getViewportBBox } = useCamera();
  const { track, stop: stopFollow } = useFollowMode();

  const billboardApi = createBillboardCollection();

  let labelCollection: Cesium.LabelCollection | null = null;
  const labelMap = new Map<string, Cesium.Label>();

  let trailPrimitives: Cesium.PrimitiveCollection | null = null;
  const trailPolylines = new Map<string, Cesium.Primitive>();

  const interpolatedPositions = new Map<string, Cesium.Cartesian3>();

  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let rateLimitRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  let cameraMoveRemove: (() => void) | null = null;

  function getBoundingBox(): BBox {
    const viewportBbox = getViewportBBox();
    if (viewportBbox) return viewportBbox;

    const center = cameraState().center;
    if (center) {
      return {
        west: center.lon - VIEWPORT_FALLBACK_DEGREES,
        east: center.lon + VIEWPORT_FALLBACK_DEGREES,
        south: center.lat - VIEWPORT_FALLBACK_DEGREES,
        north: center.lat + VIEWPORT_FALLBACK_DEGREES,
      };
    }

    return { west: -180, east: 180, south: -90, north: 90 };
  }

  async function fetchPlanes(bbox: BBox): Promise<PlanesApiResponse> {
    const url = PROXY_ENDPOINTS.planes({
      minLat: bbox.south,
      maxLat: bbox.north,
      minLon: bbox.west,
      maxLon: bbox.east,
    });

    const response = await fetch(url);
    const data = await response.json();

    if (response.status === 429) {
      return { planes: [], count: 0, rateLimited: true, error: data.error };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch planes: ${response.status}`);
    }

    const now = Date.now();
    const planes = (data.planes ?? []).map((p: PlaneRecord) => ({ ...p, timestamp: now }));
    return { planes, count: data.count ?? 0 };
  }

  function getCurrentPollingInterval(): number {
    return planeState.isRateLimited ? PLANE_RATE_LIMITED_INTERVAL : PLANE_UPDATE_INTERVAL;
  }

  function handleRateLimit(): void {
    if (!planeState.isRateLimited) {
      setRateLimited(true);
      restartPolling();
      if (rateLimitRecoveryTimeout) clearTimeout(rateLimitRecoveryTimeout);
      rateLimitRecoveryTimeout = setTimeout(() => {
        setRateLimited(false);
        restartPolling();
      }, PLANE_RATE_LIMIT_RECOVERY_MS);
    }
  }

  function restartPolling(): void {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => refreshPlanes(), getCurrentPollingInterval());
  }

  function initLabelCollection(): void {
    const v = viewer();
    if (!v || v.isDestroyed() || labelCollection) return;
    labelCollection = new Cesium.LabelCollection({ scene: v.scene });
    v.scene.primitives.add(labelCollection);
  }

  function initTrailCollection(): void {
    const v = viewer();
    if (!v || v.isDestroyed() || trailPrimitives) return;
    trailPrimitives = new Cesium.PrimitiveCollection();
    v.scene.primitives.add(trailPrimitives);
  }

  function addPlane(record: PlaneRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);
    const color = getAltitudeColor(record.altitude);

    // Get the local "up" vector at this position for proper 3D rotation
    const alignedAxis = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());

    billboardApi.add({
      id: record.icao24,
      position,
      image: getPlaneIcon(),
      scale: BILLBOARD_SCALE,
      color,
      rotation: -Cesium.Math.toRadians(record.heading),
      alignedAxis,
      data: { icao24: record.icao24, type: "plane" },
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    if (labelCollection) {
      const label = labelCollection.add({
        position,
        text: formatLabelText(record),
        font: "bold 12px Courier New",
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 200000, 0.5),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, PLANE_LABEL_VISIBLE_DISTANCE),
      });
      labelMap.set(record.icao24, label);
    }

    interpolatedPositions.set(record.icao24, position);
    updateTrail(record.icao24, position, MAX_TRAIL_POINTS);
  }

  function updatePlaneVisual(record: PlaneRecord): void {
    const position = Cesium.Cartesian3.fromDegrees(record.longitude, record.latitude, record.altitude);
    const color = getAltitudeColor(record.altitude);

    // Update aligned axis for proper 3D rotation as position changes
    const alignedAxis = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());

    billboardApi.update(record.icao24, {
      position,
      rotation: -Cesium.Math.toRadians(record.heading),
      alignedAxis,
      color,
    });

    const label = labelMap.get(record.icao24);
    if (label) {
      label.position = position;
      label.text = formatLabelText(record);
      label.fillColor = color;
    }

    interpolatedPositions.set(record.icao24, position);
    updateTrail(record.icao24, position, MAX_TRAIL_POINTS);
  }

  function removePlane(icao24: string): void {
    billboardApi.remove(icao24);

    const label = labelMap.get(icao24);
    if (label && labelCollection) {
      labelCollection.remove(label);
      labelMap.delete(icao24);
    }

    interpolatedPositions.delete(icao24);

    const trail = trailPolylines.get(icao24);
    if (trail && trailPrimitives) {
      trailPrimitives.remove(trail);
      trailPolylines.delete(icao24);
    }
  }

  function highlightPlane(icao24: string | null, previousIcao24: string | null): void {
    if (previousIcao24) {
      const prevRecord = getPlaneByIcao24(previousIcao24);
      if (prevRecord) {
        const color = getAltitudeColor(prevRecord.altitude);
        billboardApi.update(previousIcao24, { scale: BILLBOARD_SCALE, color });
        const label = labelMap.get(previousIcao24);
        if (label) label.fillColor = color;
      }
    }

    if (icao24) {
      billboardApi.update(icao24, { scale: BILLBOARD_SCALE_SELECTED, color: Cesium.Color.WHITE });
      const label = labelMap.get(icao24);
      if (label) label.fillColor = Cesium.Color.WHITE;
    }
  }

  async function refreshPlanes(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    try {
      const bbox = getBoundingBox();
      const response = await fetchPlanes(bbox);

      if (response.rateLimited) {
        handleRateLimit();
        return;
      }

      const records = filterNearestPlanes(response.planes, v.camera.positionWC, MAX_VISIBLE_PLANES);
      const currentIcao24s = new Set(records.map((r) => r.icao24));

      for (const record of records) {
        if (planeState.planes.has(record.icao24)) {
          updatePlaneVisual(record);
        } else {
          addPlane(record);
        }
      }

      for (const icao24 of planeState.planes.keys()) {
        if (!currentIcao24s.has(icao24) && icao24 !== planeState.followingIcao24) {
          removePlane(icao24);
        }
      }

      clearTrailsExcept(planeState.followingIcao24);
      updatePlanes(records, currentIcao24s);
      setLastBbox(bbox);
    } catch (error) {
      console.error("[PlaneLayer] Refresh error:", error);
      if (planeState.planes.size === 0) setError("Failed to load planes");
    }
  }

  function onCameraMove(): void {
    if (cameraMoveDebounce) clearTimeout(cameraMoveDebounce);
    cameraMoveDebounce = setTimeout(() => {
      const newBbox = getBoundingBox();
      if (hasBboxChangedSignificantly(planeState.lastBbox, newBbox)) refreshPlanes();
    }, CAMERA_MOVE_DEBOUNCE_MS);
  }

  function setupClickHandler(): (() => void) | null {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);
      const id = pickedObject?.id;
      if (typeof id === "string" && getPlaneByIcao24(id)) {
        handlePlaneSelection(id);
        return;
      }
      if (planeState.selectedIcao24) handlePlaneDeselection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = v.scene.pick(click.position);
      const id = pickedObject?.id;
      if (typeof id === "string" && getPlaneByIcao24(id)) {
        handlePlaneSelection(id);
        startFollowMode();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
    };
  }

  function handlePlaneSelection(icao24: string): void {
    const previousIcao24 = planeState.selectedIcao24;
    if (previousIcao24 === icao24) {
      handlePlaneDeselection();
      return;
    }

    const record = getPlaneByIcao24(icao24);
    if (!record) return;

    selectPlane(icao24);
    highlightPlane(icao24, previousIcao24);

    const flightData: FlightData = {
      icao24: record.icao24,
      callsign: record.callsign || record.icao24,
      originCountry: getAirlineFromCallsign(record.callsign) ?? "Unknown",
      position: { lat: record.latitude, lng: record.longitude, alt: record.altitude },
      velocity: record.velocity,
      heading: record.heading,
      verticalRate: record.verticalRate,
      onGround: record.onGround,
    };
    selectEntity("flight", icao24, flightData);
  }

  function handlePlaneDeselection(): void {
    const previousIcao24 = planeState.selectedIcao24;
    if (planeState.followingIcao24 === previousIcao24) stopFollowMode();
    highlightPlane(null, previousIcao24);
    selectPlane(null);
    clearSelection();
  }

  function startFollowMode(): void {
    const icao24 = planeState.selectedIcao24;
    if (!icao24) return;

    followPlane(icao24);
    track(
      () => interpolatedPositions.get(icao24) ?? null,
      {
        heading: 0,
        pitch: Cesium.Math.toRadians(PLANE_FOLLOW_PITCH),
        range: PLANE_FOLLOW_RANGE,
        useGroundLevel: false,
      }
    );
  }

  function stopFollowMode(): void {
    stopFollow();
    unfollowPlane();
  }

  // Dead-reckoning interpolation: animate planes between polls
  usePreRender(() => {
    const now = Date.now();

    // Interpolate each plane's position based on velocity and heading
    for (const [icao24, record] of planeState.planes) {
      // Calculate time elapsed since last server update (in seconds)
      const elapsedSec = (now - record.timestamp) / 1000;
      
      // Skip if no movement data or on ground
      if (record.velocity <= 0 || record.onGround || elapsedSec <= 0) {
        continue;
      }

      // Use 80% of actual velocity for smoother, more conservative interpolation
      // This undershoots rather than overshoots, avoiding the snap-back effect
      const interpolationSpeed = record.velocity * 0.8;

      // Distance traveled in meters
      const distanceM = interpolationSpeed * elapsedSec;

      // Convert heading to radians (heading is clockwise from north)
      const headingRad = Cesium.Math.toRadians(record.heading);

      // Get current position as cartographic
      const startCarto = Cesium.Cartographic.fromDegrees(
        record.longitude,
        record.latitude,
        record.altitude
      );

      // Calculate new position using simple spherical projection
      // Earth radius ~6371km
      const earthRadius = 6371000;
      const angularDistance = distanceM / earthRadius;

      const lat1 = startCarto.latitude;
      const lon1 = startCarto.longitude;

      // Spherical law of cosines for destination point
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(headingRad)
      );
      const lon2 = lon1 + Math.atan2(
        Math.sin(headingRad) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
      );

      // Account for vertical rate (altitude change) - also at 80% speed
      const altitudeChange = record.verticalRate * elapsedSec * 0.8;
      const newAltitude = Math.max(0, record.altitude + altitudeChange);

      // Create interpolated position
      const interpolatedPos = Cesium.Cartesian3.fromRadians(lon2, lat2, newAltitude);

      // Update the stored interpolated position (used by follow mode)
      interpolatedPositions.set(icao24, interpolatedPos);

      // Update billboard position
      billboardApi.update(icao24, { position: interpolatedPos });

      // Update label position
      const label = labelMap.get(icao24);
      if (label) {
        label.position = interpolatedPos;
      }
    }

    // Update trail polylines
    for (const [icao24, positions] of planeState.trails) {
      if (positions.length < 2) continue;

      const existing = trailPolylines.get(icao24);
      if (existing && trailPrimitives) trailPrimitives.remove(existing);

      if (trailPrimitives) {
        const polyline = new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.PolylineGeometry({ positions, width: 2 }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.CYAN.withAlpha(0.5)),
            },
          }),
          appearance: new Cesium.PolylineColorAppearance(),
        });
        trailPrimitives.add(polyline);
        trailPolylines.set(icao24, polyline);
      }
    }
  });

  createEffect(
    on(ready, async (isReady) => {
      if (isReady) await initialize();
    })
  );

  // React to camera store follow target changes (from UI Follow button)
  createEffect(() => {
    const target = camera.target;
    const mode = camera.mode;

    if (mode === "follow" && target?.type === "flight") {
      const icao24 = target.id;
      // Only start if not already following this plane
      if (planeState.followingIcao24 !== icao24) {
        // Select the plane if not selected
        if (planeState.selectedIcao24 !== icao24) {
          const record = getPlaneByIcao24(icao24);
          if (record) {
            handlePlaneSelection(icao24);
          }
        }
        // Start follow mode
        if (planeState.selectedIcao24 === icao24 || getPlaneByIcao24(icao24)) {
          followPlane(icao24);
          track(
            () => interpolatedPositions.get(icao24) ?? null,
            {
              heading: 0,
              pitch: Cesium.Math.toRadians(PLANE_FOLLOW_PITCH),
              range: PLANE_FOLLOW_RANGE,
              useGroundLevel: false,
            }
          );
        }
      }
    } else if (mode === "free" && planeState.followingIcao24) {
      // Camera switched to free mode - stop following
      stopFollowMode();
    }
  });

  async function initialize(): Promise<void> {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    initLabelCollection();
    initTrailCollection();

    const removeClickHandler = setupClickHandler();
    const cameraMoveListener = v.camera.moveEnd.addEventListener(() => onCameraMove());
    cameraMoveRemove = () => cameraMoveListener();

    setLoading(true);
    try {
      await refreshPlanes();
    } catch (error) {
      console.error("[PlaneLayer] Initial fetch failed:", error);
      setError("Failed to load planes");
    }

    updateInterval = setInterval(() => refreshPlanes(), getCurrentPollingInterval());
    onCleanup(() => removeClickHandler?.());
  }

  onCleanup(() => {
    if (planeState.followingIcao24) stopFollowMode();
    if (updateInterval) clearInterval(updateInterval);
    if (rateLimitRecoveryTimeout) clearTimeout(rateLimitRecoveryTimeout);
    if (cameraMoveDebounce) clearTimeout(cameraMoveDebounce);
    if (cameraMoveRemove) cameraMoveRemove();

    const v = viewer();
    if (v && !v.isDestroyed()) {
      if (labelCollection) v.scene.primitives.remove(labelCollection);
      if (trailPrimitives) v.scene.primitives.remove(trailPrimitives);
    }
    labelCollection = null;
    trailPrimitives = null;
    labelMap.clear();
    trailPolylines.clear();
    interpolatedPositions.clear();
    clearPlanes();
  });

  return null;
}

export default PlaneLayer;
