import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { Recorder } from "../recording/Recorder";
import type { Clock, StoreGetters } from "../recording/Recorder";
import type { PlaneRecord } from "../layers/planes/types";
import type { ShipRecord } from "../layers/ships/store";
import type { EarthquakeData } from "../ground/seismic/USGSFetcher";

// --- FakeClock ---

class FakeClock implements Clock {
  time = 0;
  private intervals = new Map<number, { fn: () => void; intervalMs: number; lastFireTime: number }>();
  private nextId = 1;

  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = this.nextId++ as unknown as ReturnType<typeof setInterval>;
    this.intervals.set(id as unknown as number, { fn, intervalMs: ms, lastFireTime: this.time });
    return id;
  }

  clearInterval(id: ReturnType<typeof setInterval>): void {
    this.intervals.delete(id as unknown as number);
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    const target = this.time + ms;
    // Fire each tick with `now()` set to the tick's actual timestamp
    for (const entry of this.intervals.values()) {
      while (entry.lastFireTime + entry.intervalMs <= target) {
        entry.lastFireTime += entry.intervalMs;
        this.time = entry.lastFireTime;
        entry.fn();
      }
    }
    this.time = target;
  }
}

// --- Canned store data ---

const PLANE: PlaneRecord = {
  icao24: "abc123", callsign: "UAL100", longitude: -122, latitude: 37,
  altitude: 10000, velocity: 250, heading: 90, verticalRate: 0,
  onGround: false, lastContact: 0, timestamp: 0,
};

const SHIP: ShipRecord = {
  mmsi: "123456789", name: "EVER GIVEN", latitude: 30, longitude: 32,
  cog: 180, sog: 12, trueHeading: 180, shipType: 70, shipTypeCategory: "cargo", timestamp: 0,
};

const QUAKE: EarthquakeData = {
  id: "us6000abc", magnitude: 5.2, place: "Somewhere", time: new Date(1_700_000_000_000),
  longitude: -118, latitude: 34, depth: 10, isSimulated: false,
};

const getters: StoreGetters = {
  getPlanes: () => [PLANE],
  getShips: () => [SHIP],
  getSeismic: () => [QUAKE],
};

// --- Mock fetch ---

interface PostedFrame {
  url: string;
  body: any;
}

let postedFrames: PostedFrame[] = [];
let stopCalled = false;
let originalFetch: typeof globalThis.fetch;

function resetMocks() {
  postedFrames = [];
  stopCalled = false;
  originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async (url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : null;
    if (typeof url === "string" && url.includes("/frames")) {
      postedFrames.push({ url, body });
      return new Response("", { status: 204 });
    }
    if (typeof url === "string" && url.includes("/stop")) {
      stopCalled = true;
      return new Response(JSON.stringify({ id: "test-id", complete: true }), { status: 200 });
    }
    return new Response("", { status: 204 });
  }) as typeof fetch;
}

// --- Tests ---

describe("Recorder", () => {
  beforeEach(() => resetMocks());
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("no frame posted before 5s", async () => {
    const clock = new FakeClock();
    const recorder = new Recorder("test-id", getters, clock);
    recorder.start();

    clock.advance(4999);
    // Yield microtasks
    await Promise.resolve();

    expect(postedFrames).toHaveLength(0);
  });

  test("ships frame posted at exactly 5s", async () => {
    const clock = new FakeClock();
    const recorder = new Recorder("test-id", getters, clock);
    recorder.start();

    clock.advance(5000);
    await Promise.resolve();
    // Wait a tick for the async appendFrame promise
    await new Promise((r) => setTimeout(r, 0));

    expect(postedFrames).toHaveLength(1);
    const frame = postedFrames[0].body;
    expect(frame.ships).toHaveLength(1);
    expect(frame.ships[0].shipName).toBe("EVER GIVEN");
    expect(frame.planes).toHaveLength(0);   // planes not due yet (cadence 10s)
    expect(frame.seismic).toHaveLength(0);  // seismic not due yet (cadence 60s)
  });

  test("planes frame posted at 10s (and ships again)", async () => {
    const clock = new FakeClock();
    const recorder = new Recorder("test-id", getters, clock);
    recorder.start();

    clock.advance(10000);
    await new Promise((r) => setTimeout(r, 0));

    // Two ticks: at 5s (ships only) and at 10s (planes + ships)
    expect(postedFrames).toHaveLength(2);
    const frame10 = postedFrames[1].body;
    expect(frame10.planes).toHaveLength(1);
    expect(frame10.planes[0].icao24).toBe("abc123");
    expect(frame10.ships).toHaveLength(1);
  });

  test("seismic frame posted at 60s", async () => {
    const clock = new FakeClock();
    const recorder = new Recorder("test-id", getters, clock);
    recorder.start();

    clock.advance(60000);
    await new Promise((r) => setTimeout(r, 0));

    // Ticks at 5,10,15,20,25,30,35,40,45,50,55,60 = 12 ticks
    expect(postedFrames.length).toBeGreaterThanOrEqual(12);

    // The last tick (at 60s) should include seismic
    const lastFrame = postedFrames[postedFrames.length - 1].body;
    expect(lastFrame.seismic).toHaveLength(1);
    expect(lastFrame.seismic[0].id).toBe("us6000abc");
  });

  test("stop() clears interval and calls stopRecording", async () => {
    const clock = new FakeClock();
    const recorder = new Recorder("test-id", getters, clock);
    recorder.start();

    recorder.stop();
    await new Promise((r) => setTimeout(r, 0));

    // No more ticks fire after stop
    const countBeforeAdvance = postedFrames.length;
    clock.advance(10000);
    await new Promise((r) => setTimeout(r, 0));
    expect(postedFrames.length).toBe(countBeforeAdvance);

    expect(stopCalled).toBe(true);
  });
});
