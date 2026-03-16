/**
 * WorldView - CCTV Panel
 * Displays live video feed when a CCTV camera is selected.
 * Uses HLS.js for HLS streams; displays an <img> for image-only cameras.
 */

import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import Hls from "hls.js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { PROXY_ENDPOINTS } from "../../config";
import { useCesium } from "../../cesium/useCesium";

declare const Cesium: typeof import("cesium");

/**
 * CCTVPanel - Video/image overlay for selected CCTV camera
 */
export function CCTVPanel() {
  const { viewer, ready } = useCesium();
  let videoRef: HTMLVideoElement | undefined;
  let hlsInstance: Hls | null = null;

  // Whether the selected camera is video (true) or image-only (false)
  const [isVideo, setIsVideo] = createSignal(false);
  // Image src for image-only cameras
  const [imageSrc, setImageSrc] = createSignal("");

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
    setIsVideo(false);
    setImageSrc("");

    if (!cameraId) return;

    const camera = untrack(() => groundState.cctvCameras.find((c) => c.id === cameraId));
    if (!camera) return;

    const hlsMedia = camera.media.find((m) => m.type === "hls");

    if (hlsMedia) {
      // Video camera — use the <video> player
      setIsVideo(true);

      // Check if this source uses token-gated HLS (CORS-blocked if fetched directly)
      const sourcePrefix = cameraId.split("-")[0];
      const tokenGatedSources = ["arkansas"];

      if (tokenGatedSources.includes(sourcePrefix ?? "")) {
        // Use the server-side relay — fetches signed URL and proxies manifest + segments
        startHls(PROXY_ENDPOINTS.cctvHlsRelay(cameraId));
      } else {
        startHls(hlsMedia.url);
      }
    } else {
      // Image-only camera — display the thumbnail directly as an <img>
      setIsVideo(false);
      setImageSrc(PROXY_ENDPOINTS.cctvThumbnail(cameraId));
    }
  });

  // Pan viewport to center on the selected camera (keep current altitude)
  createEffect(() => {
    const cameraId = groundState.centerStageCameraId;
    if (!cameraId || !ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const camera = untrack(() => groundState.cctvCameras.find((c) => c.id === cameraId));
    if (!camera) return;

    const currentHeight = v.camera.positionCartographic.height;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        camera.longitude,
        camera.latitude,
        currentHeight
      ),
      duration: 1.5,
    });
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
            <Show
              when={isVideo()}
              fallback={
                <img
                  src={imageSrc()}
                  class="cctv-image"
                  alt={groundState.cctvCameras.find((c) => c.id === cameraId())?.name ?? cameraId()}
                />
              }
            >
              <video
                ref={videoRef}
                class="cctv-video"
                controls
                muted
                autoplay
                poster={PROXY_ENDPOINTS.cctvThumbnail(cameraId())}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
}

export default CCTVPanel;
