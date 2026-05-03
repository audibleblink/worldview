import { test, expect, describe } from "bun:test";
import {
  recording,
  setMode,
  setActiveRecordingId,
  setRecordingsList,
  setPlayback,
  clearPlayback,
  cyclePlaybackSpeed,
} from "../stores/recording";

describe("Recording Store", () => {
  test("starts in live mode", () => {
    expect(recording.mode).toBe("live");
  });

  test("starts with null activeRecordingId", () => {
    expect(recording.activeRecordingId).toBeNull();
  });

  test("starts with empty recordings list", () => {
    expect(recording.recordings).toHaveLength(0);
  });

  test("starts with null playback", () => {
    expect(recording.playback).toBeNull();
  });

  test("setMode flips to recording", () => {
    setMode("recording");
    expect(recording.mode).toBe("recording");
    setMode("live");
  });

  test("setMode flips to playback", () => {
    setMode("playback");
    expect(recording.mode).toBe("playback");
    setMode("live");
  });

  test("setActiveRecordingId sets and clears id", () => {
    setActiveRecordingId("rec-001");
    expect(recording.activeRecordingId).toBe("rec-001");
    setActiveRecordingId(null);
    expect(recording.activeRecordingId).toBeNull();
  });

  test("setRecordingsList updates the list", () => {
    const meta = {
      id: "r1",
      name: "Test",
      startTime: 1000,
      endTime: 2000,
      bbox: { west: -1, south: -1, east: 1, north: 1 },
      tles: [],
      frameCount: 5,
      complete: true,
    };
    setRecordingsList([meta]);
    expect(recording.recordings).toHaveLength(1);
    expect(recording.recordings[0].id).toBe("r1");
    setRecordingsList([]);
  });

  test("cyclePlaybackSpeed wraps after 300", () => {
    setPlayback({ recordingId: "x", frames: [], currentTime: 0, playing: false, speed: 300 });
    const next = cyclePlaybackSpeed();
    expect(next).toBe(1);
    expect(recording.playback!.speed).toBe(1);
    clearPlayback();
  });

  test("cyclePlaybackSpeed advances through sequence", () => {
    setPlayback({ recordingId: "x", frames: [], currentTime: 0, playing: false, speed: 1 });
    expect(cyclePlaybackSpeed()).toBe(5);
    expect(cyclePlaybackSpeed()).toBe(30);
    expect(cyclePlaybackSpeed()).toBe(60);
    expect(cyclePlaybackSpeed()).toBe(300);
    expect(cyclePlaybackSpeed()).toBe(1);
    clearPlayback();
  });

  test("clearPlayback resets playback to null", () => {
    setPlayback({ recordingId: "x", frames: [], currentTime: 100, playing: true, speed: 5 });
    expect(recording.playback).not.toBeNull();
    clearPlayback();
    expect(recording.playback).toBeNull();
  });
});
