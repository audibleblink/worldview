/**
 * WorldView - Right Panel (SolidJS)
 * Shader/effect controls, live camera readouts, and info panels
 */

import { createSignal, createEffect, onMount, onCleanup, For, Switch, Match, useContext } from "solid-js";
import { shaders, setParameter, PARAMETER_MAPPINGS, type ShaderMode } from "../stores/shaders";
import { selection } from "../stores/selection";
import { CesiumContext } from "../cesium/CesiumProvider";
import { SatelliteInfo } from "./panels/SatelliteInfo";
import { ShipInfo } from "./panels/ShipInfo";
import { PlaneInfo } from "./panels/PlaneInfo";
import { formatLatitude, formatLongitude, formatAltitude, formatDistance } from "./formatters";

declare const Cesium: typeof import("cesium");

const SLIDER_NAMES = ["PIXELATION", "DISTORTION", "INSTABILITY"] as const;
type SliderName = typeof SLIDER_NAMES[number];

interface ReadoutData {
  latitude: number;
  longitude: number;
  altitude: number;
  gsd: number;
  niirs: number;
  pitch: number;
}

export function RightPanel() {
  const cesiumCtx = useContext(CesiumContext);

  const [sliderValues, setSliderValues] = createSignal<Record<SliderName, number>>({
    PIXELATION: 50, DISTORTION: 50, INSTABILITY: 50,
  });

  const [readouts, setReadouts] = createSignal<ReadoutData>({
    latitude: 0, longitude: 0, altitude: 0, gsd: 0, niirs: 0, pitch: 0,
  });

  const slidersEnabled = () => shaders.active !== null;

  function getSliderValueFromParams(name: SliderName, mode: ShaderMode): number {
    const mapping = PARAMETER_MAPPINGS[mode]?.[name];
    if (!mapping) return 50;
    const paramValue = shaders.parameters[mapping.uniform] ?? mapping.default;
    return Math.round(((paramValue - mapping.min) / (mapping.max - mapping.min)) * 100);
  }

  function handleSliderChange(name: SliderName, value: number): void {
    setSliderValues((prev) => ({ ...prev, [name]: value }));
    const mode = shaders.active;
    if (!mode) return;
    const mapping = PARAMETER_MAPPINGS[mode]?.[name];
    if (mapping) {
      setParameter(mapping.uniform, mapping.min + (value / 100) * (mapping.max - mapping.min));
    }
  }

  function updateReadoutsFromCamera(): void {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) return;

    const { camera } = viewer;
    const carto = camera.positionCartographic;
    if (!carto) return;

    const altitude = carto.height;
    // GSD: simplified as altitude / 10000 at nadir
    // NIIRS: simplified as 9 - log10(altitude/100), clamped 1-9
    setReadouts({
      latitude: Cesium.Math.toDegrees(carto.latitude),
      longitude: Cesium.Math.toDegrees(carto.longitude),
      altitude,
      gsd: Math.max(0.01, altitude / 10000),
      niirs: Math.max(1, Math.min(9, 9 - Math.log10(altitude / 100))),
      pitch: Cesium.Math.toDegrees(camera.pitch),
    });
  }

  // Sync slider values when shader mode changes
  createEffect(() => {
    const mode = shaders.active;
    if (!mode) {
      setSliderValues({ PIXELATION: 0, DISTORTION: 0, INSTABILITY: 0 });
      return;
    }
    setSliderValues({
      PIXELATION: getSliderValueFromParams("PIXELATION", mode),
      DISTORTION: getSliderValueFromParams("DISTORTION", mode),
      INSTABILITY: getSliderValueFromParams("INSTABILITY", mode),
    });
  });

  onMount(() => {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) return;

    updateReadoutsFromCamera();

    // Throttle camera.changed to max 10 updates/sec
    let lastUpdate = 0;
    const throttledUpdate = () => {
      const now = Date.now();
      if (now - lastUpdate > 100) {
        lastUpdate = now;
        updateReadoutsFromCamera();
      }
    };

    viewer.camera.changed.addEventListener(throttledUpdate);
    viewer.camera.moveEnd.addEventListener(updateReadoutsFromCamera);

    onCleanup(() => {
      viewer.camera.changed.removeEventListener(throttledUpdate);
      viewer.camera.moveEnd.removeEventListener(updateReadoutsFromCamera);
    });
  });

  return (
    <>
      {/* Info Panels - shown based on selection type */}
      <Switch>
        <Match when={selection.type === "satellite"}>
          <SatelliteInfo />
        </Match>
        <Match when={selection.type === "ship"}>
          <ShipInfo />
        </Match>
        <Match when={selection.type === "flight"}>
          <PlaneInfo />
        </Match>
      </Switch>

      <div class="right-panel">
        {/* Parameters Header */}
        <div class="panel-header">PARAMETERS</div>

      {/* Effect Sliders */}
      <div class="effect-sliders panel-section">
        <For each={SLIDER_NAMES}>
          {(name) => (
            <div 
              class={`slider-row ${!slidersEnabled() ? "disabled" : ""}`}
              id={`slider-row-${name.toLowerCase()}`}
            >
              <label>{name}</label>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderValues()[name]}
                disabled={!slidersEnabled()}
                id={`slider-${name.toLowerCase()}`}
                onInput={(e) => handleSliderChange(name, parseInt(e.currentTarget.value, 10))}
              />
              <span class="slider-value" id={`slider-value-${name.toLowerCase()}`}>
                {slidersEnabled() ? `${sliderValues()[name]}%` : "--"}
              </span>
            </div>
          )}
        </For>
      </div>

      {/* Live Readout Header */}
      <div class="panel-header" style={{ "margin-top": "var(--spacing-lg)" }}>
        LIVE READOUT
      </div>

      {/* Live Readout */}
      <div class="live-readout">
        <div class="readout-row">
          <span class="readout-label">LAT</span>
          <span class="readout-value" id="readout-lat">
            {formatLatitude(readouts().latitude)}
          </span>
        </div>
        <div class="readout-row">
          <span class="readout-label">LNG</span>
          <span class="readout-value" id="readout-lng">
            {formatLongitude(readouts().longitude)}
          </span>
        </div>
        <div class="readout-row">
          <span class="readout-label">ALT</span>
          <span class="readout-value" id="readout-alt">
            {formatAltitude(readouts().altitude)}
          </span>
        </div>
        <div class="readout-row">
          <span class="readout-label">GSD</span>
          <span class="readout-value" id="readout-gsd">
            {formatDistance(readouts().gsd)}
          </span>
        </div>
        <div class="readout-row">
          <span class="readout-label">NIIRS</span>
          <span class="readout-value" id="readout-niirs">
            {readouts().niirs.toFixed(1)}
          </span>
        </div>
        <div class="readout-row">
          <span class="readout-label">SUB</span>
          <span class="readout-value" id="readout-sub">
            {readouts().pitch.toFixed(1)}° EL
          </span>
        </div>
      </div>
      </div>
    </>
  );
}

export default RightPanel;
