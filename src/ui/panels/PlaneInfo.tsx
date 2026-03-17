/**
 * WorldView - Plane Info Panel (SolidJS)
 * Displays plane/flight metadata when a plane is selected.
 */

import { Show, createMemo } from "solid-js";
import { selection, type FlightData } from "../../stores/selection";
import { formatCoordinates } from "../formatters";
import { useEntityPanel } from "./useEntityPanel";
import {
  formatAltitude,
  formatSpeed,
  formatHeading,
  formatVerticalRate,
  getAirlineFromCallsign,
} from "../../layers/planes/aircraftTypes";

/**
 * PlaneInfo component
 * Displays plane metadata when a plane is selected
 */
export function PlaneInfo() {
  const { isFollowing, handleFollow, handleClose } = useEntityPanel("flight");

  const data = createMemo(() => {
    if (selection.type !== "flight") return null;
    return selection.data as FlightData | null;
  });

  const airline = createMemo(() => {
    const d = data();
    if (!d) return null;
    return getAirlineFromCallsign(d.callsign);
  });

  return (
    <Show when={data()}>
      {(flightData) => (
        <div class="ship-info-panel plane-info-panel">
          <div class="sat-info-header plane-info-header">
            <span class="sat-info-title plane-info-title">
              {flightData().callsign || flightData().icao24}
            </span>
            <button class="sat-info-close" onClick={handleClose}>
              ✕
            </button>
          </div>
          <div class="sat-info-body">
            <Show when={airline()}>
              <div class="sat-info-row">
                <span class="sat-info-label">AIRLINE</span>
                <span class="sat-info-value">{airline()}</span>
              </div>
            </Show>
            <div class="sat-info-row">
              <span class="sat-info-label">ICAO24</span>
              <span class="sat-info-value">{flightData().icao24.toUpperCase()}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">POSITION</span>
              <span class="sat-info-value">
                {flightData().position
                  ? formatCoordinates(flightData().position.lat, flightData().position.lng)
                  : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">ALTITUDE</span>
              <span class="sat-info-value">
                {formatAltitude(flightData().position?.alt ?? 0)}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">SPEED</span>
              <span class="sat-info-value">{formatSpeed(flightData().velocity)}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">HEADING</span>
              <span class="sat-info-value">{formatHeading(flightData().heading)}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">V/S</span>
              <span class="sat-info-value">
                {formatVerticalRate(flightData().verticalRate)}
              </span>
            </div>
            <Show when={flightData().onGround}>
              <div class="sat-info-row">
                <span class="sat-info-label">STATUS</span>
                <span class="sat-info-value">On Ground</span>
              </div>
            </Show>
          </div>
          <div class="sat-info-footer plane-info-footer">
            <button class="sat-info-follow-btn" onClick={handleFollow}>
              {isFollowing() ? "UNFOLLOW" : "FOLLOW"}
            </button>
            <a
              class="ship-info-external-link"
              href={`https://www.flightradar24.com/${flightData().callsign || flightData().icao24}`}
              target="_blank"
              rel="noopener"
            >
              View on FlightRadar24 ↗
            </a>
          </div>
        </div>
      )}
    </Show>
  );
}

export default PlaneInfo;
