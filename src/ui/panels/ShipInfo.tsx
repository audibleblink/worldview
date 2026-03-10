/**
 * WorldView - Ship Info Panel (SolidJS)
 * Displays ship metadata when a ship is selected.
 * Port from src/ui/ship-info-panel.ts
 */

import { Show, createMemo } from "solid-js";
import { selection, clearSelection, type ShipData } from "../../stores/selection";
import { setFollowTarget, camera, setFreeCamera } from "../../stores/camera";

/**
 * Maps AIS navigation status code to human-readable string
 */
function navStatusToString(status: number): string {
  switch (status) {
    case 0:
      return "Under way using engine";
    case 1:
      return "At anchor";
    case 2:
      return "Not under command";
    case 3:
      return "Restricted maneuverability";
    case 4:
      return "Constrained by draught";
    case 5:
      return "Moored";
    case 6:
      return "Aground";
    case 7:
      return "Engaged in fishing";
    case 8:
      return "Under way sailing";
    case 14:
      return "AIS-SART active";
    default:
      return "Not defined";
  }
}

/**
 * Converts ship type code to display text
 */
function shipTypeToDisplayText(shipType: number): string {
  // Major AIS ship type categories
  if (shipType >= 70 && shipType <= 79) return "Cargo Vessel";
  if (shipType >= 80 && shipType <= 89) return "Tanker";
  if (shipType >= 60 && shipType <= 69) return "Passenger Vessel";
  if (shipType === 30) return "Fishing Vessel";
  if (shipType >= 31 && shipType <= 35) return "Towing/Dredging";
  if (shipType >= 40 && shipType <= 49) return "High Speed Craft";
  if (shipType >= 50 && shipType <= 59) return "Special Craft";
  return "Vessel";
}

/**
 * Formats latitude/longitude for display
 */
function formatPosition(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/**
 * Format speed in knots
 */
function formatSpeed(speed: number): string {
  return `${speed.toFixed(1)} kn`;
}

/**
 * Format heading in degrees
 */
function formatHeading(heading: number): string {
  // 511 means "not available" in AIS
  if (heading === 511) return "N/A";
  return `${heading}°`;
}

/**
 * ShipInfo component
 * Displays ship metadata when a ship is selected
 */
export function ShipInfo() {
  // Memoize ship data extraction
  const data = createMemo(() => {
    if (selection.type !== "ship") return null;
    return selection.data as ShipData | null;
  });

  // Check if currently following this ship
  const isFollowing = createMemo(() => {
    return (
      camera.mode === "follow" &&
      camera.target?.type === "ship" &&
      camera.target?.id === selection.id
    );
  });

  const handleFollow = () => {
    if (isFollowing()) {
      setFreeCamera();
    } else if (selection.id) {
      setFollowTarget("ship", selection.id);
    }
  };

  const handleClose = () => {
    // Stop following if we were following this ship
    if (isFollowing()) {
      setFreeCamera();
    }
    clearSelection();
  };

  return (
    <Show when={data()}>
      {(shipData) => (
        <div class="ship-info-panel">
          <div class="sat-info-header ship-info-header">
            <span class="sat-info-title ship-info-title">
              {shipData().name || shipData().mmsi}
            </span>
            <button class="sat-info-close" onClick={handleClose}>
              ✕
            </button>
          </div>
          <div class="sat-info-body">
            <div class="sat-info-row">
              <span class="sat-info-label">MMSI</span>
              <a
                class="sat-info-value ship-info-link"
                href={`https://myshiptracking.com/da/?mmsi=${shipData().mmsi}`}
                target="_blank"
                rel="noopener"
              >
                {shipData().mmsi}
              </a>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">TYPE</span>
              <span class="sat-info-value">
                {shipTypeToDisplayText(shipData().shipType)}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">POSITION</span>
              <span class="sat-info-value">
                {shipData().position
                  ? formatPosition(shipData().position.lat, shipData().position.lng)
                  : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">SPEED</span>
              <span class="sat-info-value">{formatSpeed(shipData().speed)}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">HEADING</span>
              <span class="sat-info-value">{formatHeading(shipData().heading)}</span>
            </div>
            <Show when={shipData().destination}>
              <div class="sat-info-row">
                <span class="sat-info-label">DEST</span>
                <span class="sat-info-value">{shipData().destination}</span>
              </div>
            </Show>
            <Show when={shipData().eta}>
              <div class="sat-info-row">
                <span class="sat-info-label">ETA</span>
                <span class="sat-info-value">{shipData().eta}</span>
              </div>
            </Show>
          </div>
          <div class="sat-info-footer ship-info-footer">
            <button class="sat-info-follow-btn" onClick={handleFollow}>
              {isFollowing() ? "UNFOLLOW" : "FOLLOW"}
            </button>
            <a
              class="ship-info-external-link"
              href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${shipData().mmsi}`}
              target="_blank"
              rel="noopener"
            >
              View on MarineTraffic ↗
            </a>
          </div>
        </div>
      )}
    </Show>
  );
}

export default ShipInfo;
