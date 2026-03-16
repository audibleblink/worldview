/**
 * WorldView - CCTV Camera List Panel
 * Displays a scrollable list of CCTV cameras visible in the current viewport.
 * Always visible in the left bar regardless of ground layer toggle state.
 */

import { createSignal, createEffect, createMemo, on, onCleanup, For, Show } from "solid-js";
import { useCesium } from "../../cesium/useCesium";
import { groundState, setCameras, setCenterStageCamera } from "../../layers/ground/store";
import { PROXY_ENDPOINTS } from "../../config";
import type { Camera, BBox } from "../../layers/ground/types";

declare const Cesium: typeof import("cesium");

const THUMBNAIL_REFRESH_MS = 30_000;
const VIEWPORT_DEBOUNCE_MS = 800;
const MAX_ALTITUDE_KM = 2000;

/**
 * CCTVCameraListPanel - Shows cameras in the current viewport
 */
export function CCTVCameraListPanel() {
  const { viewer, ready } = useCesium();
  const [cameras, setCamerasLocal] = createSignal<Camera[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [tooHigh, setTooHigh] = createSignal(false);
  const [thumbVersion, setThumbVersion] = createSignal(0);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Get the current camera altitude in km
   */
  function getAltitudeKm(): number {
    const v = viewer();
    if (!v || v.isDestroyed()) return Infinity;
    const cartographic = v.camera.positionCartographic;
    return cartographic.height / 1000;
  }

  /**
   * Get viewport bounding box from Cesium camera.
   * Uses camera.computeViewRectangle so it works even when globe.show = false.
   */
  function getViewportBbox(): BBox | null {
    const v = viewer();
    if (!v || v.isDestroyed()) return null;

    const rect = v.camera.computeViewRectangle(v.scene.globe.ellipsoid);
    if (!rect) return null;

    return {
      south: Cesium.Math.toDegrees(rect.south),
      north: Cesium.Math.toDegrees(rect.north),
      west: Cesium.Math.toDegrees(rect.west),
      east: Cesium.Math.toDegrees(rect.east),
    };
  }

  /**
   * Fetch cameras from the CCTV API for the current viewport
   */
  async function fetchCameras(): Promise<void> {
    const altKm = getAltitudeKm();
    if (altKm > MAX_ALTITUDE_KM) {
      setTooHigh(true);
      setCamerasLocal([]);
      setCameras([]);
      setLoading(false);
      return;
    }

    setTooHigh(false);
    setLoading(true);

    const bbox = getViewportBbox();
    if (!bbox) {
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
      });

      const response = await fetch(`${PROXY_ENDPOINTS.cctvCameras}?${params}`);

      if (!response.ok) {
        console.error(`[CCTVCameraList] Failed to fetch cameras: ${response.status}`);
        setLoading(false);
        return;
      }

      const data: Camera[] = await response.json();
      setCamerasLocal(data);
      setCameras(data);
      console.log(`[CCTVCameraList] Fetched ${data.length} cameras`);
    } catch (error) {
      console.error("[CCTVCameraList] Error fetching cameras:", error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Debounced viewport change handler
   */
  function handleViewportChange(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchCameras();
    }, VIEWPORT_DEBOUNCE_MS);
  }

  // Setup camera movement listener when viewer is ready
  createEffect(() => {
    if (!ready()) return;

    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Listen for camera movement
    v.camera.moveEnd.addEventListener(handleViewportChange);

    // Initial fetch
    fetchCameras();

    onCleanup(() => {
      if (!v.isDestroyed()) {
        v.camera.moveEnd.removeEventListener(handleViewportChange);
      }
    });
  });

  // Setup thumbnail refresh interval
  createEffect(() => {
    if (!ready()) return;

    refreshTimer = setInterval(() => {
      setThumbVersion((v) => v + 1);
    }, THUMBNAIL_REFRESH_MS);

    onCleanup(() => {
      if (refreshTimer) clearInterval(refreshTimer);
    });
  });

  // Cleanup debounce timer
  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // Sort cameras so projected (center-staged) cameras appear first
  const sortedCameras = createMemo(() => {
    const cams = cameras();
    const projectedId = groundState.centerStageCameraId;
    if (!projectedId) return cams;

    return [...cams].sort((a, b) => {
      const aProjected = a.id === projectedId ? 0 : 1;
      const bProjected = b.id === projectedId ? 0 : 1;
      return aProjected - bProjected;
    });
  });

  /**
   * Build thumbnail URL with cache-busting version
   */
  function thumbnailUrl(cameraId: string): string {
    const _v = thumbVersion(); // reactive dependency
    return `${PROXY_ENDPOINTS.cctvThumbnail(cameraId)}?v=${_v}`;
  }

  return (
    <div class="cctv-list-panel panel-section">
      <div class="cctv-panel-header">
        <span class="cctv-panel-title">CCTV CAMERAS</span>
        <Show when={!tooHigh() && !loading() && cameras().length > 0}>
          <span class="cctv-panel-count">{cameras().length}</span>
        </Show>
      </div>
      <div class="cctv-camera-list">
        <Show when={tooHigh()}>
          <div class="cctv-loading">ZOOM IN TO VIEW CAMERAS</div>
        </Show>
        <Show when={loading() && !tooHigh()}>
          <div class="cctv-loading">SCANNING VIEWPORT...</div>
        </Show>
        <Show when={!loading() && !tooHigh() && cameras().length === 0}>
          <div class="cctv-empty">NO CAMERAS IN VIEWPORT</div>
        </Show>
        <Show when={!loading() && !tooHigh() && cameras().length > 0}>
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
                  <span class={`cctv-status ${camera.status === "live" ? "live" : "offline"}`}>
                    {camera.status === "live" ? "LIVE" : "OFFLINE"}
                  </span>
                </div>
                <div class="cctv-info">
                  <div class="cctv-name">{camera.name}</div>
                  <Show when={camera.roadway}>
                    <div class="cctv-roadway">
                      {camera.roadway}{camera.direction ? ` \u00B7 ${camera.direction}` : ""}
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
