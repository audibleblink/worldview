/**
 * WorldView - UI Shell
 * Main UI container with top bar, panels, and overlays
 */

type Viewer = import("cesium").Viewer;
import { initLeftPanel, type LeftPanelOptions } from "./left-panel.ts";
import { initRightPanel } from "./right-panel.ts";
import { initBottomBar, setMode, type ViewMode } from "./bottom-bar.ts";

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

  console.log("UI shell initialized");
}

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

const escapeHandlers: (() => void)[] = [];

/** Register a callback to be invoked when the Escape key is pressed. */
export function addEscapeHandler(handler: () => void): void {
  escapeHandlers.push(handler);
}

function initKeyboardShortcuts(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isTypingInInput()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "Escape") {
      event.preventDefault();
      for (const handler of escapeHandlers) handler();
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
