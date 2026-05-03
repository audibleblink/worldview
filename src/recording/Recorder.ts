/**
 * Recording - Recorder class
 * Snapshot loop: samples live stores and posts frames to the server.
 */

import type { PlaneRecord } from "../layers/planes/types";
import type { ShipRecord } from "../layers/ships/store";
import type { EarthquakeData } from "../ground/seismic/USGSFetcher";
import { snapshotPlanes, snapshotShips, snapshotSeismic } from "./snapshot";
import { appendFrame, stopRecording } from "./api";
import type { Frame } from "./types";

// Cadences in ms
const CADENCE_PLANES = 10_000;
const CADENCE_SHIPS = 5_000;
const CADENCE_SEISMIC = 60_000;
const TICK_INTERVAL = 5_000;

export interface Clock {
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(id: ReturnType<typeof setInterval>): void;
  now(): number;
}

export interface StoreGetters {
  getPlanes(): PlaneRecord[];
  getShips(): ShipRecord[];
  getSeismic(): EarthquakeData[];
}

const realClock: Clock = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  now: () => Date.now(),
};

export class Recorder {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastEmit = { planes: 0, ships: 0, seismic: 0 };

  constructor(
    private readonly id: string,
    private readonly getters: StoreGetters,
    private readonly clock: Clock = realClock,
  ) {}

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = this.clock.setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.intervalId !== null) {
      this.clock.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    stopRecording(this.id).catch((err) =>
      console.error("[Recorder] stopRecording failed:", err),
    );
  }

  private tick(): void {
    const now = this.clock.now();

    const planesdue = now - this.lastEmit.planes >= CADENCE_PLANES;
    const shipsdue = now - this.lastEmit.ships >= CADENCE_SHIPS;
    const seismicdue = now - this.lastEmit.seismic >= CADENCE_SEISMIC;

    const frame: Frame = {
      t: now,
      planes: planesdue ? snapshotPlanes(this.getters.getPlanes()) : [],
      ships: shipsdue ? snapshotShips(this.getters.getShips()) : [],
      seismic: seismicdue ? snapshotSeismic(this.getters.getSeismic()) : [],
    };

    if (planesdue) this.lastEmit.planes = now;
    if (shipsdue) this.lastEmit.ships = now;
    if (seismicdue) this.lastEmit.seismic = now;

    appendFrame(this.id, frame).catch((err) =>
      console.error("[Recorder] appendFrame failed:", err),
    );
  }
}

// Module-level singleton
let activeRecorder: Recorder | null = null;

export function getActiveRecorder(): Recorder | null {
  return activeRecorder;
}

export function setActiveRecorder(r: Recorder | null): void {
  activeRecorder = r;
}
