/**
 * WorldView - Flight Info Panel (SolidJS)
 * Displays flight metadata when a flight is selected.
 * Port from src/ui/flight-info-panel.ts
 */

import { Show, createMemo, createSignal, createEffect, onCleanup } from "solid-js";
import { selection, type FlightData } from "../../stores/selection";
import { PROXY_ENDPOINTS } from "../../config";
import { formatAltitudeFeet, formatSpeedKnots, formatHeading } from "../formatters";
import { useEntityPanel } from "./useEntityPanel";

/** Format vertical rate (m/s → fpm with arrow indicator) */
function formatVerticalRate(verticalRateMS: number): string {
  const fpm = Math.round(verticalRateMS * 196.85);
  if (fpm > 0) return `↑ ${fpm} fpm`;
  if (fpm < 0) return `↓ ${Math.abs(fpm)} fpm`;
  return "— fpm";
}

/** Fetch flight route from FlightAware via proxy */
async function fetchFlightRoute(
  callsign: string,
): Promise<{ origin: string; destination: string } | null> {
  try {
    const response = await fetch(PROXY_ENDPOINTS.flightRoute(callsign));
    if (!response.ok) return null;
    const data = await response.json();
    return data.origin && data.destination
      ? { origin: data.origin, destination: data.destination }
      : null;
  } catch (error) {
    console.error("[FLIGHTS] Route lookup failed:", error);
    return null;
  }
}

/**
 * FlightInfo component
 * Displays flight metadata when a flight is selected
 */
export function FlightInfo() {
  const { isFollowing, handleFollow, handleClose } = useEntityPanel("flight");
  const [route, setRoute] = createSignal<string>("...");

  const data = createMemo(() => {
    if (selection.type !== "flight") return null;
    return selection.data as FlightData | null;
  });

  // Fetch route when flight data changes
  createEffect(() => {
    const flightData = data();
    if (!flightData) { setRoute("..."); return; }

    const callsign = flightData.callsign?.trim();
    if (!callsign) { setRoute("—"); return; }

    setRoute("...");
    let cancelled = false;
    fetchFlightRoute(callsign).then((result) => {
      if (cancelled) return;
      setRoute(
        result && result.origin !== "—" && result.destination !== "—"
          ? `${result.origin} → ${result.destination}`
          : "—",
      );
    });
    onCleanup(() => { cancelled = true; });
  });

  return (
    <Show when={data()}>
      {(flightData) => (
        <div class="flight-info-panel">
          <div class="sat-info-header">
            <span class="sat-info-title">FLIGHT SELECTED</span>
            <button class="sat-info-close" onClick={handleClose}>
              ✕
            </button>
          </div>
          <div class="sat-info-body">
            <div class="sat-info-row">
              <span class="sat-info-label">CALLSIGN</span>
              <Show
                when={flightData().callsign?.trim()}
                fallback={<span class="sat-info-value">—</span>}
              >
                <a
                  class="sat-info-value flight-info-link"
                  href={`https://www.flightaware.com/live/flight/${flightData().callsign.trim()}`}
                  target="_blank"
                  rel="noopener"
                >
                  {flightData().callsign.trim()}
                </a>
              </Show>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">ALTITUDE</span>
              <span class="sat-info-value">
                {flightData().position ? formatAltitudeFeet(flightData().position.alt) : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">SPEED</span>
              <span class="sat-info-value">{formatSpeedKnots(flightData().velocity)}</span>
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
            <div class="sat-info-row">
              <span class="sat-info-label">ORIGIN</span>
              <span class="sat-info-value">{flightData().originCountry || "—"}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">ROUTE</span>
              <span class="sat-info-value">{route()}</span>
            </div>
          </div>
          <div class="sat-info-footer">
            <button class="sat-info-follow-btn" onClick={handleFollow}>
              {isFollowing() ? "UNFOLLOW" : "FOLLOW"}
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}

export default FlightInfo;
