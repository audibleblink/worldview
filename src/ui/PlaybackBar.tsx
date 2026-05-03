/**
 * PlaybackBar — full-width bottom bar for playback mode.
 * Thin JSX wrapper over playbackBarHandlers.ts.
 */

import { createSignal, onCleanup, For } from "solid-js";
import { recording } from "../stores/recording";
import { layers } from "../stores/layers";
import { groundState } from "../layers/ground/store";
import { playbackEngine } from "../recording/PlaybackEngine";
import {
  onPlayClick,
  onSpeedClick,
  onScrub,
  onExit,
  onChipClick,
} from "./playbackBarHandlers";

function fmtHHMMSS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtHHMM(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

export function PlaybackBar() {
  // 4Hz local time sync
  const [localTime, setLocalTime] = createSignal(playbackEngine.currentTime);
  const poll = setInterval(() => setLocalTime(playbackEngine.currentTime), 250);
  onCleanup(() => clearInterval(poll));

  const frames = () => recording.playback?.frames ?? [];
  const startT = () => frames()[0]?.t ?? 0;
  const endT = () => frames()[frames().length - 1]?.t ?? 0;
  const duration = () => endT() - startT();

  // 5 evenly-spaced tick labels
  const ticks = (): { t: number; label: string }[] => {
    const n = 5;
    const s = startT();
    const d = duration();
    if (d === 0) return [];
    return Array.from({ length: n }, (_, i) => {
      const t = s + (d / (n - 1)) * i;
      return { t, label: fmtHHMM(t) };
    });
  };

  const playing = () => recording.playback?.playing ?? false;
  const speed = () => recording.playback?.speed ?? 1;

  const chips: { key: "planes" | "ships" | "satellites" | "seismic"; label: string }[] = [
    { key: "planes", label: "PLANES" },
    { key: "ships", label: "SHIPS" },
    { key: "satellites", label: "SATS" },
    { key: "seismic", label: "SEISMIC" },
  ];

  function chipEnabled(key: "planes" | "ships" | "satellites" | "seismic"): boolean {
    if (key === "seismic") return groundState.seismicEnabled;
    return layers[key as "planes" | "ships" | "satellites"];
  }

  return (
    <div class="playback-bar">
      {/* Row 1: controls + scrubber */}
      <div class="pb-row1">
        <button
          class="pb-btn"
          onClick={() => onPlayClick(playbackEngine, playing())}
        >
          {playing() ? "⏸" : "▶"}
        </button>

        <span class="pb-time">{fmtHHMMSS(localTime())}</span>

        <input
          class="pb-scrubber"
          type="range"
          min={startT()}
          max={endT()}
          value={localTime()}
          onInput={(e) => onScrub(Number(e.currentTarget.value), playbackEngine)}
        />

        <span class="pb-time" style={{ "text-align": "right" }}>{fmtHHMMSS(endT())}</span>

        <button class="pb-btn" onClick={() => onSpeedClick(playbackEngine)}>
          {speed()}×
        </button>

        <button class="pb-btn pb-exit" onClick={() => onExit(playbackEngine)}>
          ✕
        </button>
      </div>

      {/* Row 2: tick labels */}
      <div class="pb-row2">
        <For each={ticks()}>{(tick) => <span>{tick.label}</span>}</For>
      </div>

      {/* Row 3: layer chips */}
      <div class="pb-row3">
        <span style={{ color: "#7ab8a8", "font-size": "10px" }}>LAYERS:</span>
        <For each={chips}>
          {(chip) => (
            <button
              class={`pb-chip${chipEnabled(chip.key) ? " active" : ""}`}
              onClick={() => onChipClick(chip.key, chipEnabled(chip.key))}
            >
              {chip.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

export default PlaybackBar;
