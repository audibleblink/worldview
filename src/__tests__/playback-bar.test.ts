import { test, expect, describe, beforeEach } from "bun:test";
import {
  onPlayClick,
  onSpeedClick,
  onScrub,
  onExit,
  onChipClick,
} from "../ui/playbackBarHandlers";
import { recording, setPlayback, clearPlayback, setMode } from "../stores/recording";
import { layers, setLayerEnabled } from "../stores/layers";
import { groundState, setSubLayerEnabled } from "../layers/ground/store";
import type { PlaybackEngine } from "../recording/PlaybackEngine";

function makeEngine() {
  const calls: string[] = [];
  return {
    play() { calls.push("play"); },
    pause() { calls.push("pause"); },
    stop() { calls.push("stop"); },
    setTime(t: number) { calls.push(`setTime:${t}`); },
    setSpeed(s: number) { calls.push(`setSpeed:${s}`); },
    calls,
  } as unknown as PlaybackEngine & { calls: string[] };
}

const sampleFrames = [
  { t: 1000, planes: [], ships: [], seismic: [] },
  { t: 2000, planes: [], ships: [], seismic: [] },
];

describe("playbackBarHandlers", () => {
  beforeEach(() => {
    clearPlayback();
    setMode("live");
    setLayerEnabled("planes", true);
    setLayerEnabled("ships", true);
    setLayerEnabled("satellites", true);
    setSubLayerEnabled("seismic", false);
  });

  describe("onPlayClick", () => {
    test("pauses when currently playing", () => {
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: true, speed: 1 });
      const engine = makeEngine();
      onPlayClick(engine as any, true);
      expect(engine.calls).toContain("pause");
      expect(recording.playback?.playing).toBe(false);
    });

    test("plays when currently paused", () => {
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: false, speed: 1 });
      const engine = makeEngine();
      onPlayClick(engine as any, false);
      expect(engine.calls).toContain("play");
      expect(recording.playback?.playing).toBe(true);
    });
  });

  describe("onSpeedClick", () => {
    test("cycles speed from 1 to 5 and calls engine.setSpeed", () => {
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: false, speed: 1 });
      const engine = makeEngine();
      onSpeedClick(engine as any);
      expect(recording.playback?.speed).toBe(5);
      expect(engine.calls).toContain("setSpeed:5");
    });

    test("wraps from 300 back to 1", () => {
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: false, speed: 300 });
      const engine = makeEngine();
      onSpeedClick(engine as any);
      expect(recording.playback?.speed).toBe(1);
      expect(engine.calls).toContain("setSpeed:1");
    });
  });

  describe("onScrub", () => {
    test("calls engine.setTime and updates store", () => {
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: false, speed: 1 });
      const engine = makeEngine();
      onScrub(1500, engine as any);
      expect(engine.calls).toContain("setTime:1500");
      expect(recording.playback?.currentTime).toBe(1500);
    });
  });

  describe("onExit", () => {
    test("stops engine, clears playback, sets mode to live", () => {
      setMode("playback");
      setPlayback({ recordingId: "x", frames: sampleFrames, currentTime: 1000, playing: true, speed: 1 });
      const engine = makeEngine();
      onExit(engine as any);
      expect(engine.calls).toContain("stop");
      expect(recording.playback).toBeNull();
      expect(recording.mode).toBe("live");
    });
  });

  describe("onChipClick", () => {
    test("toggles planes off when enabled", () => {
      setLayerEnabled("planes", true);
      onChipClick("planes", true);
      expect(layers.planes).toBe(false);
    });

    test("toggles planes on when disabled", () => {
      setLayerEnabled("planes", false);
      onChipClick("planes", false);
      expect(layers.planes).toBe(true);
    });

    test("toggles ships", () => {
      setLayerEnabled("ships", true);
      onChipClick("ships", true);
      expect(layers.ships).toBe(false);
    });

    test("toggles satellites", () => {
      setLayerEnabled("satellites", true);
      onChipClick("satellites", true);
      expect(layers.satellites).toBe(false);
    });

    test("toggles seismic off when enabled", () => {
      setSubLayerEnabled("seismic", true);
      onChipClick("seismic", true);
      expect(groundState.seismicEnabled).toBe(false);
    });

    test("toggles seismic on when disabled", () => {
      setSubLayerEnabled("seismic", false);
      onChipClick("seismic", false);
      expect(groundState.seismicEnabled).toBe(true);
    });
  });
});
