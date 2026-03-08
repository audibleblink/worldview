/**
 * Performance Monitor
 * Tracks FPS and warns on performance issues
 */

type Viewer = import("cesium").Viewer;

/** Performance monitoring configuration */
const PERF_CONFIG = {
  sampleInterval: 500,       // ms between FPS samples
  warnThreshold: 33,         // ms per frame (30 FPS)
  criticalThreshold: 50,     // ms per frame (20 FPS)
  averageWindow: 10,         // Number of samples for moving average
};

export interface PerformanceStats {
  fps: number;
  frameTime: number;
  isHealthy: boolean;
}

/**
 * Performance Monitor - Tracks FPS and warns on performance issues
 */
export class PerformanceMonitor {
  private viewer: Viewer;
  private isEnabled = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsHistory: number[] = [];
  private intervalId: number | null = null;
  private lastWarnTime = 0;

  constructor(viewer: Viewer) {
    this.viewer = viewer;

    // Auto-enable in debug mode (check URL param)
    if (typeof window !== "undefined" && window.location.search.includes("debug=1")) {
      this.enable();
    }
  }

  /** Enable performance monitoring */
  enable(): void {
    if (this.isEnabled) return;
    this.isEnabled = true;

    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsHistory = [];

    // Show FPS counter
    const counter = document.getElementById("fps-counter");
    if (counter) counter.classList.remove("hidden");

    // Start sampling
    this.intervalId = window.setInterval(() => this.sample(), PERF_CONFIG.sampleInterval);

    // Hook into render loop for frame counting
    this.viewer.scene.postRender.addEventListener(this.onRender);

    console.log("[PerformanceMonitor] Enabled");
  }

  /** Disable performance monitoring */
  disable(): void {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    // Hide FPS counter
    const counter = document.getElementById("fps-counter");
    if (counter) counter.classList.add("hidden");

    // Stop sampling
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Remove render hook
    this.viewer.scene.postRender.removeEventListener(this.onRender);

    console.log("[PerformanceMonitor] Disabled");
  }

  /** Toggle monitoring */
  toggle(): boolean {
    if (this.isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.isEnabled;
  }

  /** Check if monitoring is enabled */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /** Called after each render */
  private onRender = (): void => {
    this.frameCount++;
  };

  /** Sample FPS and update display */
  private sample(): void {
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed === 0) return;

    const fps = (this.frameCount / elapsed) * 1000;
    this.frameCount = 0;
    this.lastFrameTime = now;

    // Add to history
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > PERF_CONFIG.averageWindow) {
      this.fpsHistory.shift();
    }

    // Calculate average
    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    const frameTime = 1000 / avgFps;

    // Update display
    this.updateDisplay(avgFps, frameTime);

    // Check for performance issues
    this.checkPerformance(frameTime);
  }

  /** Update the FPS counter display */
  private updateDisplay(fps: number, frameTime: number): void {
    const counter = document.getElementById("fps-counter");
    if (!counter) return;

    counter.textContent = `${Math.round(fps)} FPS`;

    // Color-code based on performance
    counter.classList.remove("fps-good", "fps-warn", "fps-critical");

    if (frameTime > PERF_CONFIG.criticalThreshold) {
      counter.classList.add("fps-critical");
    } else if (frameTime > PERF_CONFIG.warnThreshold) {
      counter.classList.add("fps-warn");
    } else {
      counter.classList.add("fps-good");
    }
  }

  /** Check performance and log warnings */
  private checkPerformance(frameTime: number): void {
    const now = Date.now();

    // Don't spam warnings - max once per second
    if (now - this.lastWarnTime < 1000) return;

    if (frameTime > PERF_CONFIG.criticalThreshold) {
      console.warn(`[Performance] Critical: ${frameTime.toFixed(1)}ms/frame (${Math.round(1000 / frameTime)} FPS)`);
      this.lastWarnTime = now;
    } else if (frameTime > PERF_CONFIG.warnThreshold) {
      console.warn(`[Performance] Warning: ${frameTime.toFixed(1)}ms/frame (${Math.round(1000 / frameTime)} FPS)`);
      this.lastWarnTime = now;
    }
  }

  /** Get current stats */
  getStats(): PerformanceStats {
    if (this.fpsHistory.length === 0) {
      return { fps: 0, frameTime: 0, isHealthy: true };
    }

    const fps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    const frameTime = 1000 / fps;

    return {
      fps: Math.round(fps),
      frameTime,
      isHealthy: frameTime <= PERF_CONFIG.warnThreshold,
    };
  }
}
