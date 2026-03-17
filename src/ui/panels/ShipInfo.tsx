/**
 * WorldView - Ship Info Panel (SolidJS)
 * Displays ship metadata when a ship is selected.
 * Port from src/ui/ship-info-panel.ts
 */

import { Show, createMemo } from "solid-js";
import { selection, type ShipData } from "../../stores/selection";
import { formatCoordinates, formatSpeedKn, formatHeading } from "../formatters";
import { useEntityPanel } from "./useEntityPanel";

/** Converts AIS ship type code to display text */
function shipTypeToDisplayText(shipType: number): string {
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
 * ShipInfo component
 * Displays ship metadata when a ship is selected
 */
export function ShipInfo() {
  const { isFollowing, handleFollow, handleClose } = useEntityPanel("ship");

  const data = createMemo(() => {
    if (selection.type !== "ship") return null;
    return selection.data as ShipData | null;
  });

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
                  ? formatCoordinates(shipData().position.lat, shipData().position.lng)
                  : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">SPEED</span>
              <span class="sat-info-value">{formatSpeedKn(shipData().speed)}</span>
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
