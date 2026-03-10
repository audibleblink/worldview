/**
 * WorldView - CCTV Panel
 * Displays live video feed when a CCTV camera is selected.
 * Uses HLS.js for stream playback via importmap.
 */

import { createEffect, onCleanup, Show } from "solid-js";
import Hls from "hls.js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { PROXY_ENDPOINTS } from "../../config";

/**
 * CCTVPanel - Video overlay for selected CCTV camera
 */
export function CCTVPanel() {
  let videoRef: HTMLVideoElement | undefined;
  let hlsInstance: Hls | null = null;

  function destroyHls(): void {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  createEffect(() => {
    const cameraId = groundState.centerStageCameraId;

    // Cleanup previous stream
    destroyHls();

    if (!cameraId || !videoRef) return;

    const streamUrl = PROXY_ENDPOINTS.cctvStream(cameraId);

    if (Hls.isSupported()) {
      hlsInstance = new Hls();
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(videoRef);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef?.play().catch(console.error);
      });
      hlsInstance.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean }) => {
        if (data.fatal) {
          console.error("[CCTVPanel] HLS fatal error:", data);
        }
      });
    } else if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      videoRef.src = streamUrl;
      videoRef.play().catch(console.error);
    } else {
      console.warn("[CCTVPanel] HLS not supported, showing thumbnail only");
    }
  });

  onCleanup(() => {
    destroyHls();
  });

  return (
    <Show when={groundState.centerStageCameraId}>
      {(cameraId) => (
        <div class="cctv-panel">
          <div class="cctv-panel-header">
            <span class="cctv-panel-title">
              CCTV: {groundState.cctvCameras.find((c) => c.id === cameraId())?.name ?? cameraId()}
            </span>
            <button
              class="cctv-panel-close"
              onClick={() => setCenterStageCamera(null)}
            >
              ✕
            </button>
          </div>
          <div class="cctv-panel-content">
            <video
              ref={videoRef}
              class="cctv-video"
              controls
              muted
              autoplay
              poster={PROXY_ENDPOINTS.cctvThumbnail(cameraId())}
            />
          </div>
        </div>
      )}
    </Show>
  );
}

export default CCTVPanel;
