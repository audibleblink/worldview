/**
 * WorldView - Performance Monitor (SolidJS)
 * FPS counter and performance warnings
 */

import { createSignal, onMount, onCleanup, useContext } from "solid-js";
import { CesiumContext } from "../cesium/CesiumProvider";

/** Performance monitoring configuration */
const PERF_CONFIG = {
  sampleInterval: 500,       // ms between FPS samples
  warnThreshold: 33,         // ms per frame (30 FPS)
  criticalThreshold: 50,     // ms per frame (20 FPS)
  averageWindow: 10,         // Number of samples for moving average
};

/** Performance status based on frame time */
type PerfStatus = "good" | "warn" | "critical";

/**
 * PerformanceMonitor component
 * Displays FPS counter with color-coded performance status
 */
export function PerformanceMonitor() {
  // Get Cesium context (may be null if not within CesiumProvider)
  const cesiumCtx = useContext(CesiumContext);
  
  // FPS display value
  const [fps, setFps] = createSignal(0);
  
  // Performance status
  const [status, setStatus] = createSignal<PerfStatus>("good");

  // Internal state for calculations
  let frameCount = 0;
  let lastFrameTime = 0;
  let fpsHistory: number[] = [];
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastWarnTime = 0;

  /** Handle post-render event to count frames */
  const handlePostRender = () => {
    frameCount++;
  };

  /** Sample FPS and update display */
  function sample(): void {
    const now = performance.now();
    const elapsed = now - lastFrameTime;

    if (elapsed === 0) return;

    const currentFps = (frameCount / elapsed) * 1000;
    frameCount = 0;
    lastFrameTime = now;

    // Add to history
    fpsHistory.push(currentFps);
    if (fpsHistory.length > PERF_CONFIG.averageWindow) {
      fpsHistory.shift();
    }

    // Calculate average
    const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    const frameTime = 1000 / avgFps;

    // Update display
    setFps(Math.round(avgFps));

    // Update status
    if (frameTime > PERF_CONFIG.criticalThreshold) {
      setStatus("critical");
    } else if (frameTime > PERF_CONFIG.warnThreshold) {
      setStatus("warn");
    } else {
      setStatus("good");
    }

    // Log warnings (throttled)
    const currentTime = Date.now();
    if (currentTime - lastWarnTime >= 1000) {
      if (frameTime > PERF_CONFIG.criticalThreshold) {
        console.warn(`[Performance] Critical: ${frameTime.toFixed(1)}ms/frame (${Math.round(1000 / frameTime)} FPS)`);
        lastWarnTime = currentTime;
      } else if (frameTime > PERF_CONFIG.warnThreshold) {
        console.warn(`[Performance] Warning: ${frameTime.toFixed(1)}ms/frame (${Math.round(1000 / frameTime)} FPS)`);
        lastWarnTime = currentTime;
      }
    }
  }

  onMount(() => {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) {
      console.warn("[PerformanceMonitor] No viewer available");
      return;
    }

    // Initialize timing
    lastFrameTime = performance.now();
    frameCount = 0;
    fpsHistory = [];

    // Hook into render loop
    viewer.scene.postRender.addEventListener(handlePostRender);

    // Start sampling
    intervalId = setInterval(sample, PERF_CONFIG.sampleInterval);

    console.log("[PerformanceMonitor] Enabled");

    onCleanup(() => {
      // Stop sampling
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }

      // Remove render hook
      viewer.scene.postRender.removeEventListener(handlePostRender);

      console.log("[PerformanceMonitor] Disabled");
    });
  });

  /** Get CSS class based on status */
  const statusClass = () => {
    switch (status()) {
      case "critical": return "fps-critical";
      case "warn": return "fps-warn";
      default: return "fps-good";
    }
  };

  return (
    <span id="fps-counter" class={`fps-counter ${statusClass()}`}>
      {fps()} FPS
    </span>
  );
}

export default PerformanceMonitor;
