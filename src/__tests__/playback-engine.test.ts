import { test, expect, describe, beforeEach, afterAll, mock } from "bun:test";

// Mock requestAnimationFrame before any module imports that might use it.
let rafCallbacks: Array<() => void> = [];

(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  rafCallbacks.push(() => cb(performance.now()));
  return rafCallbacks.length;
};
(globalThis as any).cancelAnimationFrame = (_id: number) => {
  // No-op; tests don't need real cancellation.
};

/** Run all pending RAF callbacks once. */
function flushRaf() {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb());
}

// Save original fetch so we can restore it after this test file.
const _originalFetch = globalThis.fetch;

// Mock fetch so PlaybackEngine.load() doesn't hit the network.
const frame1 = { t: 1000, planes: [], ships: [], seismic: [] };
const frame2 = { t: 2000, planes: [], ships: [], seismic: [] };
const frame3 = { t: 3000, planes: [], ships: [], seismic: [] };
const ndjson = [frame1, frame2, frame3].map((f) => JSON.stringify(f)).join("\n") + "\n";

(globalThis as any).fetch = mock(async (_url: string) => {
  return new Response(ndjson, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
});

// Restore original fetch after all tests in this file to avoid leaking into
// other test files in the same Bun worker.
afterAll(() => {
  globalThis.fetch = _originalFetch;
});

import { PlaybackEngine } from "../recording/PlaybackEngine";
import type { PlaybackHandle, Frame } from "../recording/types";

describe("PlaybackEngine", () => {
  let engine: PlaybackEngine;

  beforeEach(() => {
    engine = new PlaybackEngine();
    rafCallbacks = [];
  });

  test("load() parses and sorts frames", async () => {
    // Return frames out of order to verify sorting.
    const reversed = [frame3, frame1, frame2].map((f) => JSON.stringify(f)).join("\n");
    (globalThis as any).fetch = mock(async () => new Response(reversed + "\n", { status: 200 }));

    const frames = await engine.load("test-id");
    expect(frames).toHaveLength(3);
    expect(frames[0]!.t).toBe(1000);
    expect(frames[1]!.t).toBe(2000);
    expect(frames[2]!.t).toBe(3000);

    // Restore mock
    (globalThis as any).fetch = mock(async () => new Response(ndjson, { status: 200 }));
  });

  test("load() caches frames on engine.frames", async () => {
    await engine.load("x");
    expect(engine.frames).toHaveLength(3);
  });

  test("setTime sets currentTime", () => {
    engine.setTime(1500);
    expect(engine.currentTime).toBe(1500);
  });

  test("setSpeed sets speed", () => {
    engine.setSpeed(30);
    expect(engine.speed).toBe(30);
  });

  test("pause() stops playing without clearing handles", () => {
    engine.playing = true;
    engine.pause();
    expect(engine.playing).toBe(false);
  });

  test("start() sets playing=true", async () => {
    await engine.load("x");
    engine.start();
    expect(engine.playing).toBe(true);
    engine.stop();
  });

  test("stop() sets playing=false and calls clear()", async () => {
    let clearCalled = false;
    const handle: PlaybackHandle = {
      update: () => {},
      clear: () => { clearCalled = true; },
    };
    engine.registerHandle("planes", handle);
    await engine.load("x");
    engine.start();
    engine.stop();
    expect(engine.playing).toBe(false);
    expect(clearCalled).toBe(true);
  });

  test("non-satellite handle receives update() on tick", async () => {
    const calls: Array<{ prev: Frame; next: Frame; alpha: number }> = [];
    const handle: PlaybackHandle = {
      update(prev, next, alpha) { calls.push({ prev, next, alpha }); },
      clear() {},
    };
    engine.registerHandle("planes", handle);
    await engine.load("x");
    engine.setTime(1500); // midpoint between frame1 and frame2
    engine.start(); // _tick runs synchronously
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.prev.t).toBe(1000);
    expect(calls[0]!.next.t).toBe(2000);
    expect(calls[0]!.alpha).toBeCloseTo(0.5, 1);
    engine.stop();
  });

  test("satellite handle receives updateAtTime() not update()", async () => {
    let updateAtTimeCalled = false;
    let updateCalled = false;
    const handle: PlaybackHandle = {
      updateAtTime: (_t: number) => { updateAtTimeCalled = true; },
      update: () => { updateCalled = true; },
      clear: () => {},
    };
    engine.registerHandle("satellites", handle);
    await engine.load("x");
    engine.setTime(1500);
    engine.start();
    expect(updateAtTimeCalled).toBe(true);
    expect(updateCalled).toBe(false);
    engine.stop();
  });

  test("unregisterHandle prevents clear() on stop()", async () => {
    let clearCalled = false;
    const handle: PlaybackHandle = {
      update: () => {},
      clear: () => { clearCalled = true; },
    };
    engine.registerHandle("planes", handle);
    engine.unregisterHandle("planes");
    await engine.load("x");
    engine.start();
    engine.stop();
    expect(clearCalled).toBe(false);
  });

  test("flushRaf() drives subsequent ticks", async () => {
    let updateCount = 0;
    const handle: PlaybackHandle = {
      update: () => { updateCount++; },
      clear: () => {},
    };
    engine.registerHandle("planes", handle);
    await engine.load("x");
    engine.setTime(1500);
    engine.start(); // tick 1
    flushRaf();     // tick 2
    flushRaf();     // tick 3
    expect(updateCount).toBeGreaterThanOrEqual(3);
    engine.stop();
  });

  test("stops at end of frames", async () => {
    await engine.load("x");
    engine.setTime(3000); // at last frame
    engine.setSpeed(1000); // advance far past end
    engine.start();
    // First tick: currentTime exceeds last.t → playing stops
    expect(engine.playing).toBe(false);
    expect(engine.currentTime).toBe(3000); // clamped to last
  });

  test("play() is no-op when already playing", async () => {
    await engine.load("x");
    engine.start();
    engine.play(); // should not throw or restart
    expect(engine.playing).toBe(true);
    engine.stop();
  });
});
