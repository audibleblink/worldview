/**
 * CCTV Fetcher Hook - Viewport-based camera fetching
 */

import { createEffect, onCleanup } from "solid-js";
import { useCesium } from "../../cesium/useCesium.ts";
import { setCameras, setCctvLoading, setCctvTooHigh } from "./store.ts";
import { PROXY_ENDPOINTS } from "../../config.ts";
import type { Camera, BBox } from "./types.ts";

declare const Cesium: typeof import("cesium");

const DEBOUNCE_MS = 800;
const MAX_ALTITUDE_KM = 2000;

export function useCCTVFetcher() {
  const { viewer, ready } = useCesium();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
    const v = viewer();
    const altKm = v && !v.isDestroyed() ? v.camera.positionCartographic.height / 1000 : Infinity;

    if (altKm > MAX_ALTITUDE_KM) {
      setCctvTooHigh(true);
      setCameras([]);
      setCctvLoading(false);
      return;
    }

    setCctvTooHigh(false);
    setCctvLoading(true);

    const bbox = getViewportBbox();
    if (!bbox) { setCctvLoading(false); return; }

    try {
      const params = new URLSearchParams({ bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}` });
      const response = await fetch(`${PROXY_ENDPOINTS.cctvCameras}?${params}`);
      if (response.ok) {
        setCameras(await response.json() as Camera[]);
      }
    } catch (error) {
      console.error("[CCTVFetcher] Error:", error);
    } finally {
      setCctvLoading(false);
    }
  }

  createEffect(() => {
    if (!ready()) return;
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    const handleMoveEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCameras, DEBOUNCE_MS);
    };

    v.camera.moveEnd.addEventListener(handleMoveEnd);
    fetchCameras();

    onCleanup(() => {
      if (!v.isDestroyed()) v.camera.moveEnd.removeEventListener(handleMoveEnd);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  });
}
