/**
 * WorldView - CCTV Panel
 * Displays live video feed when a CCTV camera is selected.
 * Uses HLS.js for HLS streams; displays an <img> for image-only cameras.
 */

import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import Hls from "hls.js";
import { groundState, setCenterStageCamera } from "../../layers/ground/store";
import { PROXY_ENDPOINTS } from "../../config";
import { useCesium } from "../../cesium/useCesium";

declare const Cesium: typeof import("cesium");

/** HLS sources that require token-gated relay (CORS-blocked if fetched directly) */
const TOKEN_GATED_SOURCES = ["arkansas"];

export function CCTVPanel() {
  const { viewer, ready } = useCesium();
  let videoRef: HTMLVideoElement | undefined;
  let hlsInstance: Hls | null = null;

  const [isVideo, setIsVideo] = createSignal(false);
  const [imageSrc, setImageSrc] = createSignal("");

  // Memoize camera lookup to avoid repeated finds
  const selectedCamera = createMemo(() => {
    const id = groundState.centerStageCameraId;
    return id ? groundState.cctvCameras.find((c) => c.id === id) : null;
  });

  function destroyHls(): void {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  }

  function startHls(url: string): void {
    if (!videoRef) return;

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ lowLatencyMode: true });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoRef);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => videoRef?.play().catch(console.error));
      hlsInstance.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
        if (data.fatal) console.error("[CCTVPanel] HLS fatal error:", data);
      });
    } else if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
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

    const camera = untrack(() => selectedCamera());
    if (!camera) return;

    const hlsMedia = camera.media.find((m) => m.type === "hls");
    if (hlsMedia) {
      setIsVideo(true);
      const sourcePrefix = cameraId.split("-")[0] ?? "";
      const hlsUrl = TOKEN_GATED_SOURCES.includes(sourcePrefix)
        ? PROXY_ENDPOINTS.cctvHlsRelay(cameraId)
        : hlsMedia.url;
      // Defer HLS init to next microtask so the <video> element renders first
      queueMicrotask(() => startHls(hlsUrl));
    } else {
      setImageSrc(PROXY_ENDPOINTS.cctvThumbnail(cameraId));
    }
  });

  // Pan viewport to center on the selected camera (keep current altitude)
  createEffect(() => {
    if (!groundState.centerStageCameraId || !ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const cam = untrack(() => selectedCamera());
    if (!cam) return;

    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, v.camera.positionCartographic.height),
      duration: 1.5,
    });
  });

  onCleanup(destroyHls);

  return (
    <Show when={selectedCamera()}>
      {(camera) => (
        <div class="cctv-panel">
          <div class="cctv-panel-header">
            <span class="cctv-panel-title">CCTV: {camera().name}</span>
            <button class="cctv-panel-close" onClick={() => setCenterStageCamera(null)}>✕</button>
          </div>
          <div class="cctv-panel-content">
            <Show
              when={isVideo()}
              fallback={<img src={imageSrc()} class="cctv-image" alt={camera().name} />}
            >
              <video
                ref={videoRef}
                class="cctv-video"
                controls
                muted
                autoplay
                poster={PROXY_ENDPOINTS.cctvThumbnail(camera().id)}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
}

export default CCTVPanel;
