/**
 * WorldView - Recording Store
 * App mode signal and recording/playback state.
 */

import { createStore } from "solid-js/store";
import type { AppMode, RecordingMeta, Frame } from "../recording/types";

export interface PlaybackState {
  recordingId: string;
  frames: Frame[];
  currentTime: number;
  playing: boolean;
  speed: 1 | 5 | 30 | 60 | 300;
}

export interface RecordingState {
  mode: AppMode;
  activeRecordingId: string | null;
  recordings: RecordingMeta[];
  playback: PlaybackState | null;
}

const SPEED_CYCLE = [1, 5, 30, 60, 300] as const;

const [recording, setRecording] = createStore<RecordingState>({
  mode: "live",
  activeRecordingId: null,
  recordings: [],
  playback: null,
});

export { recording };

export function setMode(mode: AppMode): void {
  setRecording("mode", mode);
}

export function setActiveRecordingId(id: string | null): void {
  setRecording("activeRecordingId", id);
}

export function setRecordingsList(recordings: RecordingMeta[]): void {
  setRecording("recordings", recordings);
}

export function setPlayback(state: PlaybackState): void {
  setRecording("playback", state);
}

export function setPlaybackTime(t: number): void {
  setRecording("playback", "currentTime", t);
}

export function setPlaybackPlaying(playing: boolean): void {
  setRecording("playback", "playing", playing);
}

export function setPlaybackSpeed(speed: 1 | 5 | 30 | 60 | 300): void {
  setRecording("playback", "speed", speed);
}

export function clearPlayback(): void {
  setRecording("playback", null);
}

/** Rotates through [1, 5, 30, 60, 300] and returns the next speed value. */
export function cyclePlaybackSpeed(): 1 | 5 | 30 | 60 | 300 {
  const current = recording.playback?.speed ?? 1;
  const idx = SPEED_CYCLE.indexOf(current as typeof SPEED_CYCLE[number]);
  const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length] as 1 | 5 | 30 | 60 | 300;
  if (recording.playback) setPlaybackSpeed(next);
  return next;
}
