/**
 * WorldView - Playback Engine
 * Drives layer handles from a recorded frame array via a rAF loop.
 * Pure TypeScript — no SolidJS or Cesium imports.
 */

import type { PlaybackHandle, Frame } from "./types";
import { fetchFrames } from "./api";
import { findBracket } from "./interpolate";

export class PlaybackEngine {
  private handles = new Map<string, PlaybackHandle>();

  frames: Frame[] = [];
  currentTime = 0;
  playing = false;
  speed = 1;

  private lastWallClock = 0;
  private rafId: number | null = null;

  registerHandle(layer: string, handle: PlaybackHandle): void {
    this.handles.set(layer, handle);
  }

  unregisterHandle(layer: string): void {
    this.handles.delete(layer);
  }

  /** Fetch frames for a recording, sort by t, and cache. Returns the frames. */
  async load(id: string): Promise<Frame[]> {
    this.frames = (await fetchFrames(id)).sort((a, b) => a.t - b.t);
    return this.frames;
  }

  /** Clear all handle billboard state without stopping the engine. */
  clearHandles(): void {
    for (const h of this.handles.values()) h.clear();
  }

  /** Begin playback from the current time. */
  start(): void {
    this.playing = true;
    this.lastWallClock = performance.now();
    this._tick();
  }

  /** Stop playback and clear all handles. */
  stop(): void {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    for (const h of this.handles.values()) h.clear();
  }

  /** Resume playback (no-op if already playing). */
  play(): void {
    if (!this.playing) {
      this.playing = true;
      this.lastWallClock = performance.now();
      this._tick();
    }
  }

  /** Pause without clearing handles. */
  pause(): void {
    this.playing = false;
  }

  /** Jump to an absolute time (ms). Next tick picks it up. */
  setTime(t: number): void {
    this.currentTime = t;
  }

  /** Set playback speed multiplier. */
  setSpeed(s: number): void {
    this.speed = s;
  }

  private _tick(): void {
    if (!this.playing) return;

    const now = performance.now();
    const dt = now - this.lastWallClock;
    this.lastWallClock = now;
    this.currentTime += dt * this.speed;

    if (this.frames.length > 0) {
      const first = this.frames[0]!.t;
      const last = this.frames[this.frames.length - 1]!.t;

      if (this.currentTime > last) {
        this.currentTime = last;
        this.playing = false;
        return;
      }
      if (this.currentTime < first) this.currentTime = first;

      const bracket = findBracket(this.frames, this.currentTime);
      if (bracket) {
        const [prev, next, alpha] = bracket;
        for (const [name, handle] of this.handles) {
          if (name === "satellites") {
            handle.updateAtTime?.(this.currentTime);
          } else {
            handle.update?.(prev, next, alpha);
          }
        }
      }
    }

    this.rafId = requestAnimationFrame(() => this._tick());
  }
}

/** Module-level singleton — imported by layer components to register handles. */
export const playbackEngine = new PlaybackEngine();

if (typeof window !== "undefined") {
  (window as any).__playback = playbackEngine;
}
