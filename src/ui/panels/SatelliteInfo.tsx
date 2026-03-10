/**
 * WorldView - Satellite Info Panel (SolidJS)
 * Displays satellite metadata when a satellite is selected.
 * Port from src/ui/sat-info-panel.ts
 */

import { Show, createMemo } from "solid-js";
import { selection, clearSelection, type SatelliteData } from "../../stores/selection";
import { setFollowTarget, camera, setFreeCamera } from "../../stores/camera";

/**
 * Format velocity for display (km/s)
 */
function formatVelocity(velocity?: { x: number; y: number; z: number }): string {
  if (!velocity) return "—";
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
  return `${speed.toFixed(3)} KM/S`;
}

/**
 * Format altitude for display
 */
function formatAltitude(alt: number): string {
  if (alt >= 1000) {
    return `${(alt / 1000).toFixed(0)} km`;
  }
  return `${alt.toFixed(0)} m`;
}

/**
 * Format coordinates for display
 */
function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/**
 * SatelliteInfo component
 * Displays satellite metadata when a satellite is selected
 */
export function SatelliteInfo() {
  // Memoize satellite data extraction
  const data = createMemo(() => {
    if (selection.type !== "satellite") return null;
    return selection.data as SatelliteData | null;
  });

  // Check if currently following this satellite
  const isFollowing = createMemo(() => {
    return (
      camera.mode === "follow" &&
      camera.target?.type === "satellite" &&
      camera.target?.id === selection.id
    );
  });

  const handleFollow = () => {
    if (isFollowing()) {
      setFreeCamera();
    } else if (selection.id) {
      setFollowTarget("satellite", selection.id);
    }
  };

  const handleClose = () => {
    // Stop following if we were following this satellite
    if (isFollowing()) {
      setFreeCamera();
    }
    clearSelection();
  };

  return (
    <Show when={data()}>
      {(satData) => (
        <div class="sat-info-panel">
          <div class="sat-info-header">
            <span class="sat-info-title">SAT SELECTED</span>
            <button class="sat-info-close" onClick={handleClose}>
              ✕
            </button>
          </div>
          <div class="sat-info-body">
            <div class="sat-info-row">
              <span class="sat-info-label">NAME</span>
              <span class="sat-info-value">{satData().name || "—"}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">NORAD</span>
              <Show
                when={satData().noradId}
                fallback={<span class="sat-info-value">—</span>}
              >
                <a
                  class="sat-info-value sat-info-link"
                  href={`https://www.satcat.com/sats/${satData().noradId}`}
                  target="_blank"
                  rel="noopener"
                >
                  {satData().noradId}
                </a>
              </Show>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">VEL</span>
              <span class="sat-info-value">{formatVelocity(satData().velocity)}</span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">ALT</span>
              <span class="sat-info-value">
                {satData().position ? formatAltitude(satData().position.alt) : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">POS</span>
              <span class="sat-info-value">
                {satData().position
                  ? formatCoordinates(satData().position.lat, satData().position.lng)
                  : "—"}
              </span>
            </div>
            <div class="sat-info-row">
              <span class="sat-info-label">CAT</span>
              <span class="sat-info-value">
                {satData().category?.toUpperCase() || "—"}
              </span>
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

export default SatelliteInfo;
