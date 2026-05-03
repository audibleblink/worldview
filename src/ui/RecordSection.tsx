/**
 * RecordSection - Right-panel record button and past recordings list
 */

import { createSignal, createEffect, onMount, onCleanup, For, Show, useContext } from "solid-js";
import { recording, setMode, setActiveRecordingId, setRecordingsList, setPlayback } from "../stores/recording";
import { satelliteState } from "../layers/satellites/store";
import { planeState } from "../layers/planes/store";
import { shipState } from "../layers/ships/store";
import { groundState } from "../layers/ground/store";
import { CesiumContext } from "../cesium/CesiumProvider";
import { createRecording, listRecordings } from "../recording/api";
import { Recorder, getActiveRecorder, setActiveRecorder } from "../recording/Recorder";
import { playbackEngine } from "../recording/PlaybackEngine";
import type { BBox, TLERecord } from "../recording/types";

declare const Cesium: typeof import("cesium");

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${pad2(totalSec / 60)}:${pad2(totalSec % 60)}`;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`;
}

export function RecordSection() {
  const cesiumCtx = useContext(CesiumContext);
  const [startTime, setStartTime] = createSignal<number | null>(null);
  const [now, setNow] = createSignal(Date.now());
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  const isRecording = () => recording.mode === "recording";

  function startTimer() {
    setStartTime(Date.now());
    timerInterval = setInterval(() => setNow(Date.now()), 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    setStartTime(null);
  }

  onCleanup(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  onMount(async () => {
    try {
      setRecordingsList(await listRecordings());
    } catch (err) {
      console.error("[RecordSection] listRecordings failed:", err);
    }
  });

  async function handleStartRec() {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) return;

    // Compute viewport bbox in degrees
    let bbox: BBox;
    const rect = viewer.camera.computeViewRectangle();
    if (rect) {
      bbox = {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      };
    } else {
      console.warn("[RecordSection] computeViewRectangle returned undefined, using fallback bbox");
      const carto = viewer.camera.positionCartographic;
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      bbox = { west: lon - 5, south: lat - 5, east: lon + 5, north: lat + 5 };
    }

    // Build TLE list from satellite store (exclude non-serializable fields)
    const tles: TLERecord[] = satelliteState.records.map((r) => ({
      name: r.name,
      noradId: r.noradId,
      line1: r.line1,
      line2: r.line2,
      category: r.category,
    }));

    try {
      const { id } = await createRecording(bbox, tles);
      setActiveRecordingId(id);
      setMode("recording");

      const getters = {
        getPlanes: () => Array.from(planeState.planes.values()),
        getShips: () => Array.from(shipState.ships.values()),
        getSeismic: () => groundState.earthquakes,
      };

      const recorder = new Recorder(id, getters);
      setActiveRecorder(recorder);
      recorder.start();
      startTimer();
    } catch (err) {
      console.error("[RecordSection] failed to start recording:", err);
    }
  }

  async function handleStopRec() {
    getActiveRecorder()?.stop();
    setActiveRecorder(null);
    setMode("live");
    setActiveRecordingId(null);
    stopTimer();

    try {
      setRecordingsList(await listRecordings());
    } catch (err) {
      console.error("[RecordSection] listRecordings failed:", err);
    }
  }

  async function handleEnterPlayback(id: string) {
    try {
      const frames = await playbackEngine.load(id);
      if (frames.length === 0) {
        console.warn("[RecordSection] No frames to play");
        return;
      }
      setMode("playback");
      setPlayback({ recordingId: id, frames, currentTime: frames[0]!.t, playing: true, speed: 1 });
      playbackEngine.start();
    } catch (err) {
      console.error("[RecordSection] Failed to load recording:", err);
    }
  }

  return (
    <div style={{ "margin-top": "auto" }}>
      <div class="panel-header" style={{ "margin-top": "var(--spacing-lg)" }}>
        RECORDING
      </div>

      <div class="panel-section" style={{ padding: "8px 12px" }}>
        <Show
          when={isRecording()}
          fallback={
            <button
              style={{
                width: "100%",
                background: "transparent",
                border: "1px solid #cc2222",
                color: "#cc2222",
                padding: "6px 0",
                cursor: "pointer",
                "font-family": "inherit",
                "font-size": "12px",
                "letter-spacing": "0.05em",
              }}
              onClick={handleStartRec}
            >
              ● START REC
            </button>
          }
        >
          <button
            style={{
              width: "100%",
              background: "#cc2222",
              border: "1px solid #cc2222",
              color: "#ffffff",
              padding: "6px 0",
              cursor: "pointer",
              "font-family": "inherit",
              "font-size": "12px",
              "letter-spacing": "0.05em",
            }}
            onClick={handleStopRec}
          >
            ■ STOP REC &nbsp;{formatElapsed(now() - (startTime() ?? now()))}
          </button>
        </Show>
      </div>

      <Show when={recording.recordings.length > 0}>
        <div class="panel-header">PAST</div>
        <div class="panel-section" style={{ padding: "0 12px 8px" }}>
          <For each={[...recording.recordings].sort((a, b) => b.startTime - a.startTime)}>
            {(rec) => (
              <div
                style={{
                  padding: "4px 0",
                  cursor: "pointer",
                  "font-size": "11px",
                  color: "var(--text-secondary, #aaa)",
                  "border-bottom": "1px solid var(--border-color, #222)",
                }}
                onClick={() => handleEnterPlayback(rec.id)}
              >
                {formatTimestamp(rec.startTime)}
                {!rec.complete ? " (incomplete)" : ""}
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default RecordSection;
