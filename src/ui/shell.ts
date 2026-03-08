/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

type Viewer = import("cesium").Viewer;
import { initLeftPanel, type LeftPanelOptions } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar, setMode, type ViewMode } from "./bottom-bar.ts";
import { CommandBar } from "./command-bar.ts";

// Performance monitoring state
let performanceMonitor: PerformanceMonitor | null = null;

// Command bar instance
let commandBar: CommandBar | null = null;

export function initShell(viewer: Viewer, leftPanelOptions?: LeftPanelOptions): void {
  console.log("Initializing UI shell...");

  if (!document.getElementById("app")) {
    console.error("App container not found");
    return;
  }

  updateTopBar();
  updateClassificationWatermark();

  initLeftPanel(viewer, leftPanelOptions);
  initRightPanel(viewer);
  initBottomBar(viewer);

  startClock();
  startTelemetry();
  initKeyboardShortcuts();
  
  // Initialize performance monitoring
  performanceMonitor = new PerformanceMonitor(viewer);

  // Initialize command bar
  commandBar = new CommandBar();
  commandBar.init();

  console.log("UI shell initialized");
}

const TOP_BAR_HTML = `
  <div class="top-bar-left">
    <div class="wordmark">WORLDVIEW</div>
    <div class="tagline">NO PLACE LEFT BEHIND</div>
  </div>
  <div class="top-bar-center">
    <span id="sat-tracking-counter" class="hidden">TRACKING: 0 SATS</span>
    <span id="flight-tracking-counter" class="hidden">TRACKING: 0 FLIGHTS</span>
    <span id="camera-tracking-counter" class="hidden">CAMERAS: 0</span>
  </div>
  <div class="top-bar-right">
    <span id="fps-counter" class="fps-counter hidden">-- FPS</span>
    <div class="mode-indicator">CRT</div>
    <div class="rec-section">
      <div class="rec-indicator">
        <span class="rec-dot"></span>
        <span>REC</span>
        <span id="live-clock">-------:--:--Z</span>
      </div>
      <div class="telemetry" id="telemetry">GRB: ----- PASS: DESC:---</div>
    </div>
  </div>
`;

function updateTopBar(): void {
  const topBar = document.querySelector(".top-bar");
  if (topBar) topBar.innerHTML = TOP_BAR_HTML;
}

function updateClassificationWatermark(): void {
  const watermark = document.querySelector(".classification-watermark") as HTMLElement | null;
  if (watermark) watermark.textContent = "TOP SECRET // SI-TK // NOFORN";
}

function formatUTCTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}

function startClock(): void {
  const tick = () => {
    const el = document.getElementById("live-clock");
    if (el) el.textContent = formatUTCTimestamp();
  };
  tick();
  setInterval(tick, 1000);
}

function startTelemetry(): void {
  const rand = (max: number, width: number) =>
    String(Math.floor(Math.random() * max)).padStart(width, "0");

  const tick = () => {
    const el = document.getElementById("telemetry");
    if (el) el.textContent = `GRB: ${rand(99999, 5)} PASS: DESC:${rand(999, 3)}`;
  };
  tick();
  setInterval(tick, 3000);
}

export function createTopBar(): HTMLElement {
  const topBar = document.createElement("div");
  topBar.className = "top-bar";
  topBar.innerHTML = TOP_BAR_HTML;
  return topBar;
}

export function createClassificationWatermark(): HTMLElement {
  const watermark = document.createElement("div");
  watermark.className = "classification-watermark";
  watermark.textContent = "TOP SECRET // SI-TK // NOFORN";
  return watermark;
}

export function createVignetteOverlay(): HTMLElement {
  const vignette = document.createElement("div");
  vignette.className = "vignette-overlay";
  return vignette;
}

const MODE_SHORTCUTS: Record<string, ViewMode> = {
  "1": "NORMAL",
  "2": "CRT",
  "3": "NVG",
  "4": "FLIR",
  "5": "ANIME",
  "6": "NAVI",
};

/** Performance monitoring configuration */
const PERF_CONFIG = {
  sampleInterval: 500,       // ms between FPS samples
  warnThreshold: 33,         // ms per frame (30 FPS)
  criticalThreshold: 50,     // ms per frame (20 FPS)
  averageWindow: 10,         // Number of samples for moving average
};

/**
 * Performance Monitor - Tracks FPS and warns on performance issues
 */
class PerformanceMonitor {
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
  getStats(): { fps: number; frameTime: number; isHealthy: boolean } {
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

/** Get the performance monitor instance */
export function getPerformanceMonitor(): PerformanceMonitor | null {
  return performanceMonitor;
}

/** Enable FPS counter display */
export function showFPSCounter(): void {
  performanceMonitor?.enable();
}

/** Disable FPS counter display */
export function hideFPSCounter(): void {
  performanceMonitor?.disable();
}

/** Toggle FPS counter display */
export function toggleFPSCounter(): boolean {
  return performanceMonitor?.toggle() ?? false;
}

function isTypingInInput(): boolean {
  const el = document.activeElement;
  const tag = el?.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || !!(el as HTMLElement)?.isContentEditable;
}

/**
 * Update the satellite TRACKING counter in the top bar.
 * Pass a number to show "TRACKING: N SATS"; pass null to hide the counter.
 */
export function updateSatelliteCount(n: number | null): void {
  const counter = document.getElementById("sat-tracking-counter");
  if (!counter) return;
  if (n === null) {
    counter.classList.add("hidden");
  } else {
    counter.textContent = `TRACKING: ${n} SATS`;
    counter.classList.remove("hidden");
  }
}

/**
 * Update the flight TRACKING counter in the top bar.
 * Pass a number to show "TRACKING: N FLIGHTS"; pass null to hide the counter.
 */
export function updateFlightCount(n: number | null): void {
  const counter = document.getElementById("flight-tracking-counter");
  if (!counter) return;
  if (n === null) {
    counter.classList.add("hidden");
  } else {
    counter.textContent = `TRACKING: ${n} FLIGHTS`;
    counter.classList.remove("hidden");
  }
}

/**
 * Update the camera count in the top bar.
 * Pass a number to show "CAMERAS: N"; pass null to hide the counter.
 */
export function updateCameraCount(n: number | null): void {
  const counter = document.getElementById("camera-tracking-counter");
  if (!counter) return;
  if (n === null) {
    counter.classList.add("hidden");
  } else {
    counter.textContent = `CAMERAS: ${n}`;
    counter.classList.remove("hidden");
  }
}

const escapeHandlers: (() => void)[] = [];

/** Register a callback to be invoked when the Escape key is pressed. */
export function addEscapeHandler(handler: () => void): void {
  escapeHandlers.push(handler);
}

function initKeyboardShortcuts(): void {
  // Register command bar escape handler
  addEscapeHandler(() => {
    if (commandBar?.getIsVisible()) {
      commandBar.hide();
      return;
    }
  });

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    // Handle escape even when typing (for closing command bar)
    if (event.key === "Escape") {
      event.preventDefault();
      for (const handler of escapeHandlers) handler();
      return;
    }

    // Don't process other shortcuts when typing in input
    if (isTypingInInput()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Open command bar with ':' key
    if (event.key === ":") {
      event.preventDefault();
      commandBar?.show();
      return;
    }
    
    // Toggle FPS counter with 'f' key
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFPSCounter();
      return;
    }

    const mode = MODE_SHORTCUTS[event.key];
    if (mode) {
      event.preventDefault();
      setMode(mode);
    }
  });

  console.log("Keyboard shortcuts initialized (1-6 for view modes, f for FPS, : for command bar, Escape for unfollow)");
}
