/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

import type { Viewer } from "cesium";
import { initLeftPanel } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar } from "./bottom-bar.ts";

/**
 * Initialize the complete UI shell
 */
export function initShell(viewer: Viewer): void {
  console.log("Initializing UI shell...");

  // Initialize sub-components
  initLeftPanel(viewer);
  initRightPanel(viewer);
  initBottomBar(viewer);

  // Start live clock
  startClock();

  console.log("UI shell initialized");
}

/**
 * Start the live clock update interval
 */
function startClock(): void {
  const updateClock = () => {
    const now = new Date();
    const timestamp = now.toISOString().replace("T", " ").substring(0, 19);
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
 * Create the top bar element
 */
export function createTopBar(): HTMLElement {
  const topBar = document.createElement("div");
  topBar.className = "top-bar";
  topBar.innerHTML = `
    <div class="wordmark">WORLDVIEW</div>
    <div class="tagline">GEOSPATIAL INTELLIGENCE SYSTEM</div>
    <div class="mode-indicator">MODE: OBSERVATION</div>
    <div class="rec-indicator">
      <span class="rec-dot"></span>
      REC <span id="live-clock">--:--:--</span>
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
