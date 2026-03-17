/**
 * WorldView - Performance Monitor (SolidJS)
 * FPS counter and performance warnings
 */

import { createSignal, onMount, onCleanup, useContext } from "solid-js";
import { CesiumContext } from "../cesium/CesiumProvider";

const PERF_CONFIG = {
  sampleInterval: 500,    // ms between FPS samples
  warnThreshold: 33,      // ms per frame (30 FPS)
  criticalThreshold: 50,  // ms per frame (20 FPS)
  averageWindow: 10,      // samples for moving average
};

type PerfStatus = "good" | "warn" | "critical";
const STATUS_CLASSES: Record<PerfStatus, string> = {
  good: "fps-good",
  warn: "fps-warn",
  critical: "fps-critical",
};

/** Displays FPS counter with color-coded performance status */
export function PerformanceMonitor() {
  const cesiumCtx = useContext(CesiumContext);
  const [fps, setFps] = createSignal(0);
  const [status, setStatus] = createSignal<PerfStatus>("good");

  let frameCount = 0;
  let lastFrameTime = 0;
  let fpsHistory: number[] = [];
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastWarnTime = 0;

  const handlePostRender = () => { frameCount++; };

  function sample(): void {
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    if (elapsed === 0) return;

    const currentFps = (frameCount / elapsed) * 1000;
    frameCount = 0;
    lastFrameTime = now;

    fpsHistory.push(currentFps);
    if (fpsHistory.length > PERF_CONFIG.averageWindow) fpsHistory.shift();

    const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    const frameTime = 1000 / avgFps;

    setFps(Math.round(avgFps));

    const newStatus: PerfStatus =
      frameTime > PERF_CONFIG.criticalThreshold ? "critical" :
      frameTime > PERF_CONFIG.warnThreshold ? "warn" : "good";
    setStatus(newStatus);

    // Log performance warnings (throttled to 1/sec)
    if (newStatus !== "good" && Date.now() - lastWarnTime >= 1000) {
      console.warn(`[Performance] ${newStatus === "critical" ? "Critical" : "Warning"}: ${frameTime.toFixed(1)}ms/frame (${Math.round(avgFps)} FPS)`);
      lastWarnTime = Date.now();
    }
  }

  onMount(() => {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) {
      console.warn("[PerformanceMonitor] No viewer available");
      return;
    }

    lastFrameTime = performance.now();
    frameCount = 0;
    fpsHistory = [];

    viewer.scene.postRender.addEventListener(handlePostRender);
    intervalId = setInterval(sample, PERF_CONFIG.sampleInterval);
    console.log("[PerformanceMonitor] Enabled");

    onCleanup(() => {
      if (intervalId) clearInterval(intervalId);
      viewer.scene.postRender.removeEventListener(handlePostRender);
      console.log("[PerformanceMonitor] Disabled");
    });
  });

  return (
    <span id="fps-counter" class={`fps-counter ${STATUS_CLASSES[status()]}`}>
      {fps()} FPS
    </span>
  );
}

export default PerformanceMonitor;
