/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

type Viewer = import("cesium").Viewer;
import { initLeftPanel, type LeftPanelOptions } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar, setMode, type ViewMode } from "./bottom-bar.ts";
import { CommandBar } from "./command-bar.ts";
import { PerformanceMonitor } from "./performance-monitor.ts";
import type { SatelliteLayer } from "../layers/satellites.ts";

// Performance monitoring state
let performanceMonitor: PerformanceMonitor | null = null;

// Command bar instance
let commandBar: CommandBar | null = null;

// Interval IDs for cleanup and visibility handling
let clockIntervalId: ReturnType<typeof setInterval> | null = null;
let telemetryIntervalId: ReturnType<typeof setInterval> | null = null;

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
  initPageVisibility();
  
  // Initialize performance monitoring
  performanceMonitor = new PerformanceMonitor(viewer);

  // Initialize command bar
  commandBar = new CommandBar();
  commandBar.init();
  
  // Wire up satellite layer for follow commands
  if (leftPanelOptions?.satelliteLayer) {
    commandBar.setSatelliteLayer(leftPanelOptions.satelliteLayer);
  }

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
    <span id="ship-tracking-counter" class="hidden">TRACKING: 0 SHIPS</span>
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
  clockIntervalId = setInterval(tick, 1000);
}

function startTelemetry(): void {
  const rand = (max: number, width: number) =>
    String(Math.floor(Math.random() * max)).padStart(width, "0");

  const tick = () => {
    const el = document.getElementById("telemetry");
    if (el) el.textContent = `GRB: ${rand(99999, 5)} PASS: DESC:${rand(999, 3)}`;
  };
  tick();
  telemetryIntervalId = setInterval(tick, 3000);
}

/** Stop shell intervals (for page visibility) */
function stopShellIntervals(): void {
  if (clockIntervalId !== null) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }
  if (telemetryIntervalId !== null) {
    clearInterval(telemetryIntervalId);
    telemetryIntervalId = null;
  }
}

/** Resume shell intervals (for page visibility) */
function resumeShellIntervals(): void {
  if (clockIntervalId === null) startClock();
  if (telemetryIntervalId === null) startTelemetry();
}

/** Initialize page visibility handling to pause updates when tab is hidden */
function initPageVisibility(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopShellIntervals();
      console.log("Tab hidden - paused shell intervals");
    } else {
      resumeShellIntervals();
      console.log("Tab visible - resumed shell intervals");
    }
  });
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
  "5": "AH64",
};

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
 * Update the ship TRACKING counter in the top bar.
 * Pass a number to show "TRACKING: N SHIPS"; pass null to hide the counter.
 */
export function updateShipCount(n: number | null): void {
  const counter = document.getElementById("ship-tracking-counter");
  if (!counter) return;
  if (n === null) {
    counter.classList.add("hidden");
  } else {
    counter.textContent = `TRACKING: ${n} SHIPS`;
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
