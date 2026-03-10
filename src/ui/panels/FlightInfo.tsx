/**
 * WorldView - Flight Info Panel (SolidJS)
 * Displays flight metadata when a flight is selected.
 * Port from src/ui/flight-info-panel.ts
 */

import { Show, createMemo, createSignal, createEffect, onCleanup } from "solid-js";
import { selection, clearSelection, type FlightData } from "../../stores/selection";
import { setFollowTarget, camera, setFreeCamera } from "../../stores/camera";
import { PROXY_BASE_URL } from "../../config";

/**
 * Format vertical rate for display.
 * Converts m/s to fpm with arrow indicator.
 */
function formatVerticalRate(verticalRateMS: number): string {
  const fpm = Math.round(verticalRateMS * 196.85);
  if (fpm > 0) return `↑ ${fpm} fpm`;
  if (fpm < 0) return `↓ ${Math.abs(fpm)} fpm`;
  return "— fpm";
}

/**
 * Format altitude in feet
 */
function formatAltitude(altitudeM: number): string {
  const feet = Math.round(altitudeM * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

/**
 * Format speed in knots
 */
function formatSpeed(velocityMS: number): string {
  const knots = Math.round(velocityMS * 1.94384);
  return `${knots} kts`;
}

/**
 * Format heading in degrees
 */
function formatHeading(heading: number): string {
  return `${Math.round(heading)}°`;
}

/**
 * Fetch flight route from FlightAware via proxy.
 */
async function fetchFlightRoute(
  callsign: string
): Promise<{ origin: string; destination: string } | null> {
  if (!callsign.trim()) return null;

  try {
    const response = await fetch(
      `${PROXY_BASE_URL}/flight-route/${encodeURIComponent(callsign.trim())}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data.origin && data.destination) {
      return { origin: data.origin, destination: data.destination };
    }
    return null;
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
  const [route, setRoute] = createSignal<string>("...");

  // Memoize flight data extraction
  const data = createMemo(() => {
    if (selection.type !== "flight") return null;
    return selection.data as FlightData | null;
  });

  // Check if currently following this flight
  const isFollowing = createMemo(() => {
    return (
      camera.mode === "follow" &&
      camera.target?.type === "flight" &&
      camera.target?.id === selection.id
    );
  });

  // Fetch route when flight data changes
  createEffect(() => {
    const flightData = data();
    if (!flightData) {
      setRoute("...");
      return;
    }

    const callsign = flightData.callsign?.trim();
    if (!callsign) {
      setRoute("—");
      return;
    }

    // Reset route while loading
    setRoute("...");

    // Fetch route asynchronously
    let cancelled = false;
    fetchFlightRoute(callsign).then((result) => {
      if (cancelled) return;
      if (result && result.origin !== "—" && result.destination !== "—") {
        setRoute(`${result.origin} → ${result.destination}`);
      } else {
        setRoute("—");
      }
    });

    onCleanup(() => {
      cancelled = true;
    });
  });

  const handleFollow = () => {
    if (isFollowing()) {
      setFreeCamera();
    } else if (selection.id) {
      setFollowTarget("flight", selection.id);
    }
  };

  const handleClose = () => {
    // Stop following if we were following this flight
    if (isFollowing()) {
      setFreeCamera();
    }
    clearSelection();
  };

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
                {flightData().position ? formatAltitude(flightData().position.alt) : "—"}
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
