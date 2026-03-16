/**
 * WorldView - CCTV Fetcher Hook
 * Single source of truth for viewport-based CCTV camera fetching.
 * Mount this once (in CCTVLayer) — CCTVCameraListPanel reads from the store.
 */

import { createEffect, onCleanup } from "solid-js";
import { useCesium } from "../../cesium/useCesium.ts";
import { setCameras, setCctvLoading, setCctvTooHigh } from "./store.ts";
import { PROXY_ENDPOINTS } from "../../config.ts";
import type { Camera, BBox } from "./types.ts";

declare const Cesium: typeof import("cesium");

const VIEWPORT_DEBOUNCE_MS = 800;
const MAX_ALTITUDE_KM = 2000;

export function useCCTVFetcher() {
  const { viewer, ready } = useCesium();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function getAltitudeKm(): number {
    const v = viewer();
    if (!v || v.isDestroyed()) return Infinity;
    return v.camera.positionCartographic.height / 1000;
  }

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

  async function fetchCameras(): Promise<void> {
    const altKm = getAltitudeKm();
    if (altKm > MAX_ALTITUDE_KM) {
      setCctvTooHigh(true);
      setCameras([]);
      setCctvLoading(false);
      return;
    }

    setCctvTooHigh(false);
    setCctvLoading(true);

    const bbox = getViewportBbox();
    if (!bbox) {
      setCctvLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
      });
      const response = await fetch(`${PROXY_ENDPOINTS.cctvCameras}?${params}`);
      if (!response.ok) {
        console.error(`[CCTVFetcher] Failed: ${response.status}`);
        return;
      }
      const data: Camera[] = await response.json();
      setCameras(data);
      console.log(`[CCTVFetcher] Fetched ${data.length} cameras`);
    } catch (error) {
      console.error("[CCTVFetcher] Error:", error);
    } finally {
      setCctvLoading(false);
    }
  }

  function handleMoveEnd(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchCameras, VIEWPORT_DEBOUNCE_MS);
  }

  createEffect(() => {
    if (!ready()) return;
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    v.camera.moveEnd.addEventListener(handleMoveEnd);
    fetchCameras();

    onCleanup(() => {
      if (!v.isDestroyed()) v.camera.moveEnd.removeEventListener(handleMoveEnd);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  });
}
