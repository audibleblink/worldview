/**
 * PlaybackBar event handlers — pure functions, no SolidJS, no Cesium.
 */

import type { PlaybackEngine } from "../recording/PlaybackEngine";
import {
  setPlaybackPlaying,
  clearPlayback,
  setMode,
  cyclePlaybackSpeed,
  setPlaybackTime,
} from "../stores/recording";
import { setLayerEnabled } from "../stores/layers";
import { setSubLayerEnabled } from "../layers/ground/store";

export function onPlayClick(engine: PlaybackEngine, playing: boolean): void {
  if (playing) {
    engine.pause();
    setPlaybackPlaying(false);
  } else {
    engine.play();
    setPlaybackPlaying(true);
  }
}

export function onSpeedClick(engine: PlaybackEngine): void {
  const newSpeed = cyclePlaybackSpeed();
  engine.setSpeed(newSpeed);
}

export function onScrub(value: number, engine: PlaybackEngine): void {
  engine.setTime(value);
  setPlaybackTime(value);
}

export function onExit(engine: PlaybackEngine): void {
  engine.stop();
  clearPlayback();
  setMode("live");
}

export function onChipClick(
  layer: "planes" | "ships" | "satellites" | "seismic",
  enabled: boolean
): void {
  if (layer === "seismic") {
    setSubLayerEnabled("seismic", !enabled);
  } else {
    setLayerEnabled(layer as any, !enabled);
  }
}
