/**
 * WorldView - Shell Component (SolidJS)
 * Main UI container with top bar, panels, and overlays
 */

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { ui, toggleLeftPanel, toggleRightPanel, setCommandMode } from "../stores/ui";
import { shaders, setShader, type ShaderMode } from "../stores/shaders";
import { LeftPanel } from "./LeftPanelComponent";
import { RightPanel } from "./RightPanelComponent";
import { BottomBar } from "./BottomBarComponent";
import { PerformanceMonitor } from "./PerformanceMonitorComponent";
import { CommandBar } from "./CommandBar";
import { CCTVPanel } from "./panels/CCTVPanel";

// View mode shortcuts (keyboard numbers 1-5)
const MODE_SHORTCUTS: Record<string, ShaderMode | null> = {
  "1": null,      // NORMAL
  "2": "crt",
  "3": "nvg",
  "4": "flir",
  "5": "ah64",
};

/** Format UTC timestamp for the clock display */
function formatUTCTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}

/** Generate random telemetry string */
function generateTelemetry(): string {
  const rand = (max: number, width: number) =>
    String(Math.floor(Math.random() * max)).padStart(width, "0");
  return `GRB: ${rand(99999, 5)} PASS: DESC:${rand(999, 3)}`;
}

/** Check if user is typing in an input field */
function isTypingInInput(): boolean {
  const el = document.activeElement;
  const tag = el?.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || !!(el as HTMLElement)?.isContentEditable;
}

/**
 * Shell component - Main UI container
 */
export function Shell() {
  // Reactive clock time
  const [time, setTime] = createSignal(formatUTCTimestamp());
  
  // Reactive telemetry
  const [telemetry, setTelemetry] = createSignal(generateTelemetry());
  
  // Tracking counters (these would be updated by layer stores)
  const [satCount, setSatCount] = createSignal<number | null>(null);
  const [flightCount, setFlightCount] = createSignal<number | null>(null);
  const [shipCount, setShipCount] = createSignal<number | null>(null);
  const [cameraCount, setCameraCount] = createSignal<number | null>(null);

  // FPS counter visibility
  const [showFPS, setShowFPS] = createSignal(false);

  // Interval references for page visibility handling
  let clockIntervalId: ReturnType<typeof setInterval> | null = null;
  let telemetryIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Start clock updates */
  function startClock(): void {
    setTime(formatUTCTimestamp());
    clockIntervalId = setInterval(() => setTime(formatUTCTimestamp()), 1000);
  }

  /** Start telemetry updates */
  function startTelemetry(): void {
    setTelemetry(generateTelemetry());
    telemetryIntervalId = setInterval(() => setTelemetry(generateTelemetry()), 3000);
  }

  /** Stop all intervals */
  function stopIntervals(): void {
    if (clockIntervalId !== null) {
      clearInterval(clockIntervalId);
      clockIntervalId = null;
    }
    if (telemetryIntervalId !== null) {
      clearInterval(telemetryIntervalId);
      telemetryIntervalId = null;
    }
  }

  /** Resume intervals */
  function resumeIntervals(): void {
    if (clockIntervalId === null) startClock();
    if (telemetryIntervalId === null) startTelemetry();
  }

  /** Handle page visibility changes */
  function handleVisibilityChange(): void {
    if (document.hidden) {
      stopIntervals();
    } else {
      resumeIntervals();
    }
  }

  /** Handle keyboard shortcuts */
  function handleKeydown(event: KeyboardEvent): void {
    // Don't process shortcuts when typing in input (except Escape)
    if (event.key !== "Escape" && isTypingInInput()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Escape key - close command mode if open
    if (event.key === "Escape") {
      if (ui.commandMode) {
        event.preventDefault();
        setCommandMode(false);
      }
      return;
    }

    // Colon key (:) - open command bar (vim-style)
    if (event.key === ":" || (event.shiftKey && event.key === ";")) {
      event.preventDefault();
      setCommandMode(true);
      return;
    }

    // Toggle FPS counter with 'f' key
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      setShowFPS(!showFPS());
      return;
    }

    // Toggle left panel with '[' key
    if (event.key === "[") {
      event.preventDefault();
      toggleLeftPanel();
      return;
    }

    // Toggle right panel with ']' key
    if (event.key === "]") {
      event.preventDefault();
      toggleRightPanel();
      return;
    }

    // Mode shortcuts (1-5)
    const mode = MODE_SHORTCUTS[event.key];
    if (mode !== undefined) {
      event.preventDefault();
      setShader(mode);
    }
  }

  onMount(() => {
    // Start intervals
    startClock();
    startTelemetry();

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("keydown", handleKeydown);

    console.log("[Shell] Mounted, keyboard shortcuts active (1-5 for modes, f for FPS, [ ] for panels, : for command bar)");
  });

  onCleanup(() => {
    // Stop intervals
    stopIntervals();

    // Remove event listeners
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("keydown", handleKeydown);

    console.log("[Shell] Cleaned up");
  });

  /** Get current mode display name */
  const modeDisplay = () => {
    const mode = shaders.active;
    return mode ? mode.toUpperCase() : "NORMAL";
  };

  return (
    <>
      {/* Classification Watermark */}
      <div class="classification-watermark">TOP SECRET // SI-TK // NOFORN</div>

      {/* Vignette Overlay */}
      <div class="vignette-overlay" />

      {/* Top Bar */}
      <div class="top-bar">
        <div class="top-bar-left">
          <div class="wordmark">WORLDVIEW</div>
          <div class="tagline">NO PLACE LEFT BEHIND</div>
        </div>

        <div class="top-bar-center">
          <Show when={satCount() !== null}>
            <span id="sat-tracking-counter">TRACKING: {satCount()} SATS</span>
          </Show>
          <Show when={flightCount() !== null}>
            <span id="flight-tracking-counter">TRACKING: {flightCount()} FLIGHTS</span>
          </Show>
          <Show when={shipCount() !== null}>
            <span id="ship-tracking-counter">TRACKING: {shipCount()} SHIPS</span>
          </Show>
          <Show when={cameraCount() !== null}>
            <span id="camera-tracking-counter">CAMERAS: {cameraCount()}</span>
          </Show>
        </div>

        <div class="top-bar-right">
          <Show when={showFPS()}>
            <PerformanceMonitor />
          </Show>
          <div class="mode-indicator">{modeDisplay()}</div>
          <div class="rec-section">
            <div class="rec-indicator">
              <span class="rec-dot" />
              <span>REC</span>
              <span id="live-clock">{time()}</span>
            </div>
            <div class="telemetry" id="telemetry">{telemetry()}</div>
          </div>
        </div>
      </div>

      {/* Left Panel */}
      <Show when={ui.leftPanelOpen}>
        <LeftPanel />
      </Show>

      {/* Right Panel */}
      <Show when={ui.rightPanelOpen}>
        <RightPanel />
      </Show>

      {/* Bottom Bar */}
      <BottomBar />

      {/* Command Bar (vim-style, activated with : key) */}
      <CommandBar />

      {/* CCTV Panel (shown when a camera is selected) */}
      <CCTVPanel />
    </>
  );
}

export default Shell;
