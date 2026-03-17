/**
 * WorldView - Satellite Info Panel (SolidJS)
 * Displays satellite metadata when a satellite is selected.
 * Port from src/ui/sat-info-panel.ts
 */

import { Show, createMemo } from "solid-js";
import { selection, type SatelliteData } from "../../stores/selection";
import { formatCoordinates } from "../formatters";
import { useEntityPanel } from "./useEntityPanel";

/** Format velocity magnitude for display (km/s) */
function formatVelocity(velocity?: { x: number; y: number; z: number }): string {
  if (!velocity) return "—";
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
  return `${speed.toFixed(3)} KM/S`;
}

/** Format orbital altitude (always km-scale) */
function formatOrbitalAltitude(alt: number): string {
  return alt >= 1000 ? `${(alt / 1000).toFixed(0)} km` : `${alt.toFixed(0)} m`;
}

/**
 * SatelliteInfo component
 * Displays satellite metadata when a satellite is selected
 */
export function SatelliteInfo() {
  const { isFollowing, handleFollow, handleClose } = useEntityPanel("satellite");

  const data = createMemo(() => {
    if (selection.type !== "satellite") return null;
    return selection.data as SatelliteData | null;
  });

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
                {satData().position ? formatOrbitalAltitude(satData().position.alt) : "—"}
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
