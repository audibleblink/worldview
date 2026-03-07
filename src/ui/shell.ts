/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

// Use global Cesium type
type Viewer = import("cesium").Viewer;
import { initLeftPanel } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar } from "./bottom-bar.ts";

/**
 * Initialize the complete UI shell
 */
export function initShell(viewer: Viewer): void {
  console.log("Initializing UI shell...");

  // Get the app container
  const app = document.getElementById("app");
  if (!app) {
    console.error("App container not found");
    return;
  }

  // Update existing top bar with new structure
  updateTopBar();

  // Update classification watermark position
  updateClassificationWatermark();

  // Initialize sub-components
  initLeftPanel(viewer);
  initRightPanel(viewer);
  initBottomBar(viewer);

  // Start live clock
  startClock();

  // Start fake telemetry updates
  startTelemetry();

  console.log("UI shell initialized");
}

/**
 * Update the existing top bar with new structure
 */
function updateTopBar(): void {
  const topBar = document.querySelector(".top-bar");
  if (!topBar) return;

  topBar.innerHTML = `
    <div class="top-bar-left">
      <div class="wordmark">WORLDVIEW</div>
      <div class="tagline">NO PLACE LEFT BEHIND</div>
    </div>
    <div class="top-bar-center"></div>
    <div class="top-bar-right">
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
}

/**
 * Update the classification watermark styling
 */
function updateClassificationWatermark(): void {
  const watermark = document.querySelector(".classification-watermark") as HTMLElement;
  if (watermark) {
    watermark.textContent = "TOP SECRET // SI-TK // NOFORN";
  }
}

/**
 * Start the live clock update interval
 */
function startClock(): void {
  const updateClock = () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const hours = String(now.getUTCHours()).padStart(2, "0");
    const minutes = String(now.getUTCMinutes()).padStart(2, "0");
    const seconds = String(now.getUTCSeconds()).padStart(2, "0");
    
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}Z`;
    const clockElement = document.getElementById("live-clock");
    if (clockElement) {
      clockElement.textContent = timestamp;
    }
  };

  // Update immediately and then every second
  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Start fake telemetry updates
 */
function startTelemetry(): void {
  const updateTelemetry = () => {
    const grb = String(Math.floor(Math.random() * 99999)).padStart(5, "0");
    const desc = String(Math.floor(Math.random() * 999)).padStart(3, "0");
    
    const telemetryElement = document.getElementById("telemetry");
    if (telemetryElement) {
      telemetryElement.textContent = `GRB: ${grb} PASS: DESC:${desc}`;
    }
  };

  // Update immediately and then every 3 seconds
  updateTelemetry();
  setInterval(updateTelemetry, 3000);
}

/**
 * Create the top bar element (for programmatic creation if needed)
 */
export function createTopBar(): HTMLElement {
  const topBar = document.createElement("div");
  topBar.className = "top-bar";
  topBar.innerHTML = `
    <div class="top-bar-left">
      <div class="wordmark">WORLDVIEW</div>
      <div class="tagline">NO PLACE LEFT BEHIND</div>
    </div>
    <div class="top-bar-center"></div>
    <div class="top-bar-right">
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
  return topBar;
}

/**
 * Create the classification watermark
 */
export function createClassificationWatermark(): HTMLElement {
  const watermark = document.createElement("div");
  watermark.className = "classification-watermark";
  watermark.textContent = "TOP SECRET // SI-TK // NOFORN";
  return watermark;
}

/**
 * Create the vignette overlay
 */
export function createVignetteOverlay(): HTMLElement {
  const vignette = document.createElement("div");
  vignette.className = "vignette-overlay";
  return vignette;
}
