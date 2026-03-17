/**
 * WorldView - CCTV Camera List Panel
 * Displays a scrollable list of CCTV cameras visible in the current viewport.
 * Always visible in the left bar regardless of ground layer toggle state.
 */

import { createSignal, createMemo, onCleanup, For, Show } from "solid-js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { useCCTVFetcher } from "../../layers/ground/useCCTVFetcher";
import { PROXY_ENDPOINTS } from "../../config";

const THUMBNAIL_REFRESH_MS = 30_000;

export function CCTVCameraListPanel() {
  useCCTVFetcher();

  const [thumbVersion, setThumbVersion] = createSignal(0);
  const refreshTimer = setInterval(() => setThumbVersion((v) => v + 1), THUMBNAIL_REFRESH_MS);
  onCleanup(() => clearInterval(refreshTimer));

  // Sort selected camera to top of list
  const sortedCameras = createMemo(() => {
    const cams = groundState.cctvCameras;
    const selectedId = groundState.centerStageCameraId;
    if (!selectedId) return cams;
    return [...cams].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0));
  });

  const thumbnailUrl = (id: string) => `${PROXY_ENDPOINTS.cctvThumbnail(id)}?v=${thumbVersion()}`;

  // Determine display state for camera list
  const listState = createMemo(() => {
    if (groundState.cctvTooHigh) return "tooHigh";
    if (groundState.cctvLoading) return "loading";
    if (groundState.cctvCameras.length === 0) return "empty";
    return "ready";
  });

  const hasVideo = (cam: typeof groundState.cctvCameras[0]) =>
    cam.media.some((m) => m.type === "hls" || m.type === "mp4ts");

  return (
    <div class="cctv-list-panel panel-section">
      <div class="cctv-panel-header">
        <span class="cctv-panel-title">CCTV CAMERAS</span>
        <Show when={listState() === "ready"}>
          <span class="cctv-panel-count">{groundState.cctvCameras.length}</span>
        </Show>
      </div>
      <div class="cctv-camera-list">
        <Show when={listState() === "tooHigh"}>
          <div class="cctv-loading">ZOOM IN TO VIEW CAMERAS</div>
        </Show>
        <Show when={listState() === "loading"}>
          <div class="cctv-loading">SCANNING VIEWPORT...</div>
        </Show>
        <Show when={listState() === "empty"}>
          <div class="cctv-empty">NO CAMERAS IN VIEWPORT</div>
        </Show>
        <Show when={listState() === "ready"}>
          <For each={sortedCameras()}>
            {(cam) => (
              <div
                class={`cctv-item ${groundState.centerStageCameraId === cam.id ? "projected" : ""}`}
                onClick={() => setCenterStageCamera(cam.id)}
              >
                <div class="cctv-thumb-container">
                  <img class="cctv-thumb" src={thumbnailUrl(cam.id)} alt={cam.name} loading="lazy" />
                  <span class={`cctv-status ${hasVideo(cam) ? (cam.status === "live" ? "live" : "offline") : "img"}`}>
                    {hasVideo(cam) ? (cam.status === "live" ? "LIVE" : "OFFLINE") : "IMG"}
                  </span>
                </div>
                <div class="cctv-info">
                  <div class="cctv-name">{cam.name}</div>
                  <Show when={cam.roadway}>
                    <div class="cctv-roadway">
                      {cam.roadway}{cam.direction ? ` · ${cam.direction}` : ""}
                    </div>
                  </Show>
                  <div class="cctv-coords">{cam.latitude.toFixed(4)}, {cam.longitude.toFixed(4)}</div>
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
