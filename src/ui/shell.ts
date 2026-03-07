/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

// Use global Cesium type
type Viewer = import("cesium").Viewer;
import { initLeftPanel, type LeftPanelOptions } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar, setMode, type ViewMode } from "./bottom-bar.ts";

/**
 * Initialize the complete UI shell
 */
export function initShell(viewer: Viewer, leftPanelOptions?: LeftPanelOptions): void {
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
  initLeftPanel(viewer, leftPanelOptions);
  initRightPanel(viewer);
  initBottomBar(viewer);

  // Start live clock
  startClock();

  // Start fake telemetry updates
  startTelemetry();

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  console.log("UI shell initialized");
}

// Shared HTML template for top bar
const TOP_BAR_HTML = `
  <div class="top-bar-left">
    <div class="wordmark">WORLDVIEW</div>
    <div class="tagline">NO PLACE LEFT BEHIND</div>
  </div>
  <div class="top-bar-center">
    <span id="sat-tracking-counter" class="hidden">TRACKING: 0 SATS</span>
  </div>
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

/**
 * Update the existing top bar with new structure
 */
function updateTopBar(): void {
  const topBar = document.querySelector(".top-bar");
  if (!topBar) return;
  topBar.innerHTML = TOP_BAR_HTML;
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
 * Format current time as UTC timestamp
 */
function formatUTCTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}

/**
 * Start the live clock update interval
 */
function startClock(): void {
  const updateClock = () => {
    const clockElement = document.getElementById("live-clock");
    if (clockElement) {
      clockElement.textContent = formatUTCTimestamp();
    }
  };

  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Generate random padded number
 */
function randomPadded(max: number, width: number): string {
  return String(Math.floor(Math.random() * max)).padStart(width, "0");
}

/**
 * Start fake telemetry updates
 */
function startTelemetry(): void {
  const updateTelemetry = () => {
    const telemetryElement = document.getElementById("telemetry");
    if (telemetryElement) {
      telemetryElement.textContent = `GRB: ${randomPadded(99999, 5)} PASS: DESC:${randomPadded(999, 3)}`;
    }
  };

  updateTelemetry();
  setInterval(updateTelemetry, 3000);
}

/**
 * Create the top bar element (for programmatic creation if needed)
 */
export function createTopBar(): HTMLElement {
  const topBar = document.createElement("div");
  topBar.className = "top-bar";
  topBar.innerHTML = TOP_BAR_HTML;
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

/**
 * Keyboard shortcut mapping for view modes
 */
const MODE_SHORTCUTS: Record<string, ViewMode> = {
  "1": "NORMAL",
  "2": "CRT",
  "3": "NVG",
  "4": "FLIR",
  "5": "ANIME",
  "6": "NAVI",
};

/**
 * Check if the user is typing in an input field
 */
function isTypingInInput(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    (activeElement as HTMLElement).isContentEditable
  );
}

/**
 * Update the satellite TRACKING counter in the top bar.
 * Pass a number to show "TRACKING: N SATS"; pass null to hide the counter.
 */
export function updateSatelliteCount(n: number | null): void {
  const counter = document.getElementById("sat-tracking-counter");
  if (!counter) return;
  if (n === null || n === undefined) {
    counter.classList.add("hidden");
  } else {
    counter.textContent = `TRACKING: ${n} SATS`;
    counter.classList.remove("hidden");
  }
}

// Escape key handler registered from outside (e.g. main.ts for follow mode)
let escapeHandler: (() => void) | null = null;

/**
 * Register a callback to be invoked when the Escape key is pressed.
 * Only one handler is supported at a time.
 */
export function setEscapeHandler(handler: () => void): void {
  escapeHandler = handler;
}

/**
 * Initialize keyboard shortcuts for mode switching
 */
function initKeyboardShortcuts(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    // Don't capture when user is typing in an input
    if (isTypingInInput()) return;

    // Don't capture when modifier keys are pressed (allow browser shortcuts)
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Escape key — stop follow mode
    if (event.key === "Escape") {
      event.preventDefault();
      escapeHandler?.();
      return;
    }

    const mode = MODE_SHORTCUTS[event.key];
    if (mode) {
      event.preventDefault();
      setMode(mode);
    }
  });

  console.log("Keyboard shortcuts initialized (1-6 for view modes, Escape for unfollow)");
}
