/**
 * WorldView - CCTV Panel
 * Displays live video feed when a CCTV camera is selected.
 * Uses HLS.js for HLS streams; falls back to MJPEG for image-only cameras.
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

  function startHls(url: string): void {
    if (!videoRef) return;
    if (Hls.isSupported()) {
      hlsInstance = new Hls({ lowLatencyMode: true });
      hlsInstance.loadSource(url);
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
      videoRef.src = url;
      videoRef.play().catch(console.error);
    } else {
      console.warn("[CCTVPanel] HLS not supported");
    }
  }

  createEffect(() => {
    const cameraId = groundState.centerStageCameraId;

    destroyHls();

    if (!cameraId || !videoRef) return;

    const camera = groundState.cctvCameras.find((c) => c.id === cameraId);
    if (!camera) return;

    const hlsMedia = camera.media.find((m) => m.type === "hls");

    if (hlsMedia) {
      // Check if this source uses token-gated HLS (needs proxy to resolve)
      const sourcePrefix = cameraId.split("-")[0];
      const tokenGatedSources = ["arkansas"];

      if (tokenGatedSources.includes(sourcePrefix ?? "")) {
        // Fetch a fresh signed URL from the proxy
        fetch(PROXY_ENDPOINTS.cctvHlsUrl(cameraId))
          .then((res) => res.json())
          .then((data: { url?: string }) => {
            if (data.url) {
              startHls(data.url);
            } else {
              console.warn("[CCTVPanel] No signed HLS URL returned for", cameraId);
            }
          })
          .catch((err) => console.error("[CCTVPanel] Failed to resolve HLS URL:", err));
      } else {
        startHls(hlsMedia.url);
      }
    } else {
      // Image-only camera: use MJPEG stream
      const streamUrl = PROXY_ENDPOINTS.cctvStream(cameraId);
      if (Hls.isSupported()) {
        // Can't use HLS.js for MJPEG — set src directly
        videoRef.src = streamUrl;
        videoRef.play().catch(console.error);
      } else {
        videoRef.src = streamUrl;
        videoRef.play().catch(console.error);
      }
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
