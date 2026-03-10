/**
 * WorldView - Right Panel (SolidJS)
 * Shader/effect controls and live camera readouts
 */

import { createSignal, createEffect, onMount, onCleanup, For, Show, useContext } from "solid-js";
import { shaders, setParameter, PARAMETER_MAPPINGS, type ShaderMode } from "../stores/shaders";
import { CesiumContext } from "../cesium/CesiumProvider";

declare const Cesium: typeof import("cesium");

// Slider configuration
const SLIDER_NAMES = ["PIXELATION", "DISTORTION", "INSTABILITY"] as const;
type SliderName = typeof SLIDER_NAMES[number];

// Readout data structure
interface ReadoutData {
  latitude: number;
  longitude: number;
  altitude: number;
  gsd: number;
  niirs: number;
  pitch: number;
}

/**
 * Format latitude with N/S indicator
 */
function formatLatitude(lat: number): string {
  const dir = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(4)}° ${dir}`;
}

/**
 * Format longitude with E/W indicator
 */
function formatLongitude(lng: number): string {
  const dir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lng).toFixed(4)}° ${dir}`;
}

/**
 * Format altitude with appropriate precision
 */
function formatAltitude(altitude: number): string {
  if (altitude >= 1_000_000) return `${(altitude / 1000).toFixed(0)}km`;
  if (altitude >= 1000) return `${Math.round(altitude)}m`;
  return `${altitude.toFixed(1)}m`;
}

/**
 * Format distance value with appropriate unit (cm, m, km)
 */
function formatDistance(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  if (value >= 1) return `${value.toFixed(1)}m`;
  return `${(value * 100).toFixed(1)}cm`;
}

/**
 * RightPanel component
 */
export function RightPanel() {
  // Get Cesium context (may be null if not within CesiumProvider)
  const cesiumCtx = useContext(CesiumContext);
  
  // Slider values (0-100 scale)
  const [sliderValues, setSliderValues] = createSignal<Record<SliderName, number>>({
    PIXELATION: 50,
    DISTORTION: 50,
    INSTABILITY: 50,
  });

  // Readout values
  const [readouts, setReadouts] = createSignal<ReadoutData>({
    latitude: 0,
    longitude: 0,
    altitude: 0,
    gsd: 0,
    niirs: 0,
    pitch: 0,
  });

  // Check if sliders should be enabled (when a shader mode is active)
  const slidersEnabled = () => shaders.active !== null;

  /** Get slider value from shader parameters */
  function getSliderValueFromParams(name: SliderName, mode: ShaderMode): number {
    const mapping = PARAMETER_MAPPINGS[mode]?.[name];
    if (!mapping) return 50;

    const paramValue = shaders.parameters[mapping.uniform] ?? mapping.default;
    const normalized = (paramValue - mapping.min) / (mapping.max - mapping.min);
    return Math.round(normalized * 100);
  }

  /** Update shader parameter from slider value */
  function handleSliderChange(name: SliderName, value: number): void {
    setSliderValues((prev) => ({ ...prev, [name]: value }));

    const mode = shaders.active;
    if (!mode) return;

    const mapping = PARAMETER_MAPPINGS[mode]?.[name];
    if (mapping) {
      const paramValue = mapping.min + (value / 100) * (mapping.max - mapping.min);
      setParameter(mapping.uniform, paramValue);
    }
  }

  /** Update readouts from camera position */
  function updateReadoutsFromCamera(): void {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) return;

    const camera = viewer.camera;
    const cartographic = camera.positionCartographic;
    if (!cartographic) return;

    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const altitude = cartographic.height;
    const pitchDegrees = Cesium.Math.toDegrees(camera.pitch);

    // Calculate GSD (Ground Sample Distance)
    // Simplified: GSD ≈ altitude / 10000 (at nadir)
    const gsd = Math.max(0.01, altitude / 10000);

    // Calculate NIIRS (National Imagery Interpretability Rating Scale)
    // Simplified formula: NIIRS ≈ 9 - log10(altitude/100), clamped 1-9
    const niirs = Math.max(1, Math.min(9, 9 - Math.log10(altitude / 100)));

    setReadouts({
      latitude,
      longitude,
      altitude,
      gsd,
      niirs,
      pitch: pitchDegrees,
    });
  }

  // Sync slider values when shader mode changes
  createEffect(() => {
    const mode = shaders.active;
    if (!mode) {
      // Reset sliders when no shader active
      setSliderValues({ PIXELATION: 0, DISTORTION: 0, INSTABILITY: 0 });
      return;
    }

    // Set sliders to current parameter values
    const newValues: Record<SliderName, number> = {
      PIXELATION: getSliderValueFromParams("PIXELATION", mode),
      DISTORTION: getSliderValueFromParams("DISTORTION", mode),
      INSTABILITY: getSliderValueFromParams("INSTABILITY", mode),
    };
    setSliderValues(newValues);
  });

  onMount(() => {
    const viewer = cesiumCtx?.viewer();
    if (!viewer) return;

    // Initial readout update
    updateReadoutsFromCamera();

    // Throttled camera change handler
    let lastUpdate = 0;
    const throttleMs = 100;

    const handleCameraChange = () => {
      const now = Date.now();
      if (now - lastUpdate > throttleMs) {
        lastUpdate = now;
        updateReadoutsFromCamera();
      }
    };

    const handleCameraMoveEnd = () => {
      updateReadoutsFromCamera();
    };

    // Subscribe to camera events
    viewer.camera.changed.addEventListener(handleCameraChange);
    viewer.camera.moveEnd.addEventListener(handleCameraMoveEnd);

    onCleanup(() => {
      viewer.camera.changed.removeEventListener(handleCameraChange);
      viewer.camera.moveEnd.removeEventListener(handleCameraMoveEnd);
    });

    console.log("[RightPanel] Mounted, subscribed to camera changes");
  });

  return (
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
  );
}

export default RightPanel;
