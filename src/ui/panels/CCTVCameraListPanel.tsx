/**
 * WorldView - CCTV Camera List Panel
 * Displays a scrollable list of CCTV cameras visible in the current viewport.
 * Always visible in the left bar regardless of ground layer toggle state.
 *
 * Fetching is handled entirely by useCCTVFetcher (mounted in CCTVLayer).
 * This component is a pure reader of groundState.
 */

import { createSignal, createMemo, onCleanup, For, Show } from "solid-js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { useCCTVFetcher } from "../../layers/ground/useCCTVFetcher";
import { PROXY_ENDPOINTS } from "../../config";

const THUMBNAIL_REFRESH_MS = 30_000;

/**
 * CCTVCameraListPanel - Shows cameras in the current viewport
 */
export function CCTVCameraListPanel() {
  // Single source of truth: owns the moveEnd listener and fetch logic
  useCCTVFetcher();

  const [thumbVersion, setThumbVersion] = createSignal(0);

  // Thumbnail refresh interval
  const refreshTimer = setInterval(() => {
    setThumbVersion((v) => v + 1);
  }, THUMBNAIL_REFRESH_MS);

  onCleanup(() => clearInterval(refreshTimer));

  // Sort so the projected (center-staged) camera appears first
  const sortedCameras = createMemo(() => {
    const cams = groundState.cctvCameras;
    const projectedId = groundState.centerStageCameraId;
    if (!projectedId) return cams;
    return [...cams].sort((a, b) => {
      return (a.id === projectedId ? 0 : 1) - (b.id === projectedId ? 0 : 1);
    });
  });

  function thumbnailUrl(cameraId: string): string {
    const _v = thumbVersion(); // reactive dependency
    return `${PROXY_ENDPOINTS.cctvThumbnail(cameraId)}?v=${_v}`;
  }

  return (
    <div class="cctv-list-panel panel-section">
      <div class="cctv-panel-header">
        <span class="cctv-panel-title">CCTV CAMERAS</span>
        <Show when={!groundState.cctvTooHigh && !groundState.cctvLoading && groundState.cctvCameras.length > 0}>
          <span class="cctv-panel-count">{groundState.cctvCameras.length}</span>
        </Show>
      </div>
      <div class="cctv-camera-list">
        <Show when={groundState.cctvTooHigh}>
          <div class="cctv-loading">ZOOM IN TO VIEW CAMERAS</div>
        </Show>
        <Show when={groundState.cctvLoading && !groundState.cctvTooHigh}>
          <div class="cctv-loading">SCANNING VIEWPORT...</div>
        </Show>
        <Show when={!groundState.cctvLoading && !groundState.cctvTooHigh && groundState.cctvCameras.length === 0}>
          <div class="cctv-empty">NO CAMERAS IN VIEWPORT</div>
        </Show>
        <Show when={!groundState.cctvLoading && !groundState.cctvTooHigh && groundState.cctvCameras.length > 0}>
          <For each={sortedCameras()}>
            {(camera) => (
              <div
                class={`cctv-item ${groundState.centerStageCameraId === camera.id ? "projected" : ""}`}
                onClick={() => setCenterStageCamera(camera.id)}
              >
                <div class="cctv-thumb-container">
                  <img
                    class="cctv-thumb"
                    src={thumbnailUrl(camera.id)}
                    alt={camera.name}
                    loading="lazy"
                  />
                  {camera.media.some((m) => m.type === "hls" || m.type === "mp4ts") ? (
                    <span class={`cctv-status ${camera.status === "live" ? "live" : "offline"}`}>
                      {camera.status === "live" ? "LIVE" : "OFFLINE"}
                    </span>
                  ) : (
                    <span class="cctv-status img">IMG</span>
                  )}
                </div>
                <div class="cctv-info">
                  <div class="cctv-name">{camera.name}</div>
                  <Show when={camera.roadway}>
                    <div class="cctv-roadway">
                      {camera.roadway}{camera.direction ? ` · ${camera.direction}` : ""}
                    </div>
                  </Show>
                  <div class="cctv-coords">
                    {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

export default CCTVCameraListPanel;
