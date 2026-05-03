/**
 * WorldView - Shell Component (SolidJS)
 * Main UI container with top bar, panels, and overlays
 */

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { ui, toggleLeftPanel, toggleRightPanel, setCommandMode } from "../stores/ui";
import { shaders, setShader, type ShaderMode } from "../stores/shaders";
import { recording } from "../stores/recording";
import { LeftPanel } from "./LeftPanelComponent";
import { RightPanel } from "./RightPanelComponent";
import { BottomBar } from "./BottomBarComponent";
import { PlaybackBar } from "./PlaybackBar";
import { PerformanceMonitor } from "./PerformanceMonitorComponent";
import { CommandBar } from "./CommandBar";
import { CCTVPanel } from "./panels/CCTVPanel";
import { Compass } from "./Compass";

/** Keyboard number keys map to shader modes (1 = normal/null, 2-5 = effects) */
const MODE_SHORTCUTS: Record<string, ShaderMode | null> = {
  "1": null, "2": "crt", "3": "nvg", "4": "flir", "5": "ah64",
};

/** Format UTC timestamp for the clock display */
function formatUTCTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** Generate random telemetry string for display */
function generateTelemetry(): string {
  const rand = (max: number, w: number) => String(Math.floor(Math.random() * max)).padStart(w, "0");
  return `GRB: ${rand(99999, 5)} PASS: DESC:${rand(999, 3)}`;
}

/** Check if user is typing in an input field */
function isTypingInInput(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

/**
 * Shell component - Main UI container
 */
export function Shell() {
  const [time, setTime] = createSignal(formatUTCTimestamp());
  const [telemetry, setTelemetry] = createSignal(generateTelemetry());
  const [showFPS, setShowFPS] = createSignal(false);

  // Interval IDs for cleanup and visibility handling
  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let telemetryInterval: ReturnType<typeof setInterval> | null = null;

  function startIntervals(): void {
    stopIntervals();
    setTime(formatUTCTimestamp());
    setTelemetry(generateTelemetry());
    clockInterval = setInterval(() => setTime(formatUTCTimestamp()), 1000);
    telemetryInterval = setInterval(() => setTelemetry(generateTelemetry()), 3000);
  }

  function stopIntervals(): void {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
    if (telemetryInterval) { clearInterval(telemetryInterval); telemetryInterval = null; }
  }

  function handleVisibilityChange(): void {
    document.hidden ? stopIntervals() : startIntervals();
  }

  /** Handle keyboard shortcuts */
  function handleKeydown(e: KeyboardEvent): void {
    // Allow Escape even when typing; block other shortcuts in input fields
    if (e.key !== "Escape" && isTypingInInput()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Key action map for simple shortcuts
    const actions: Record<string, () => void> = {
      "Escape": () => ui.commandMode && setCommandMode(false),
      ":": () => setCommandMode(true),
      "f": () => setShowFPS(!showFPS()),
      "F": () => setShowFPS(!showFPS()),
      "[": toggleLeftPanel,
      "]": toggleRightPanel,
    };

    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
      return;
    }

    // Mode shortcuts (1-5)
    const mode = MODE_SHORTCUTS[e.key];
    if (mode !== undefined) {
      e.preventDefault();
      setShader(mode);
    }
  }

  onMount(() => {
    startIntervals();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("keydown", handleKeydown);

    console.log("[Shell] Mounted, keyboard shortcuts active (1-5 for modes, f for FPS, [ ] for panels, : for command bar)");
  });

  onCleanup(() => {
    stopIntervals();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("keydown", handleKeydown);
  });

  const modeDisplay = () => {
    if (recording.mode === "playback") return "PLAYBACK";
    if (recording.mode === "recording") return "RECORDING";
    return shaders.active?.toUpperCase() ?? "NORMAL";
  };

  const modeColor = () => {
    if (recording.mode === "playback") return "#00d4d4";
    if (recording.mode === "recording") return "#ff3a3a";
    return undefined;
  };

  return (
    <>
      <div class="classification-watermark">TOP SECRET // SI-TK // NOFORN</div>
      <div class="vignette-overlay" />

      {/* Top Bar */}
      <div class="top-bar">
        <div class="top-bar-left">
          <div class="wordmark">WORLDVIEW</div>
          <div class="tagline">NO PLACE LEFT BEHIND</div>
        </div>

        {/* Center section intentionally empty - tracking counters removed (were unused) */}
        <div class="top-bar-center" />

        <div class="top-bar-right">
          <Show when={showFPS()}>
            <PerformanceMonitor />
          </Show>
          <div class="mode-indicator" style={modeColor() ? `color: ${modeColor()}` : undefined}>{modeDisplay()}</div>
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
      <Show when={recording.mode === "playback"} fallback={<BottomBar />}>
        <PlaybackBar />
      </Show>

      {/* Command Bar (vim-style, activated with : key) */}
      <CommandBar />

      {/* CCTV Panel (shown when a camera is selected) */}
      <CCTVPanel />

      {/* Compass */}
      <Compass />
    </>
  );
}

export default Shell;
