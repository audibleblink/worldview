/**
 * WorldView - Right Panel
 * Parameters, sliders, and live readouts
 */

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");
type Viewer = import("cesium").Viewer;

import { shaderManager, PARAMETER_MAPPINGS, type ViewMode } from "../shaders/index.ts";

/** Slider element references for updating values */
let sliderElements: {
  PIXELATION: { input: HTMLInputElement; value: HTMLSpanElement };
  DISTORTION: { input: HTMLInputElement; value: HTMLSpanElement };
  INSTABILITY: { input: HTMLInputElement; value: HTMLSpanElement };
} | null = null;

/**
 * Initialize the right panel
 */
export function initRightPanel(viewer: Viewer): void {
  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    console.error("Right panel element not found");
    return;
  }

  // Clear existing content
  rightPanel.innerHTML = "";

  // Create parameters header
  const header = createParametersHeader();
  rightPanel.appendChild(header);

  // Create effect sliders
  const effectSliders = createEffectSliders();
  rightPanel.appendChild(effectSliders);

  // Create live readout section
  const readoutHeader = document.createElement("div");
  readoutHeader.className = "panel-header";
  readoutHeader.textContent = "LIVE READOUT";
  readoutHeader.style.marginTop = "var(--spacing-lg)";
  rightPanel.appendChild(readoutHeader);

  const liveReadout = createLiveReadout();
  rightPanel.appendChild(liveReadout);

  // Subscribe to camera change events
  subscribeToCameraChanges(viewer);

  // Initial readout update
  updateReadoutsFromCamera(viewer);

  // Subscribe to mode changes to update sliders
  shaderManager.onModeChange(updateSlidersForMode);
  
  // Initial slider update for current mode
  updateSlidersForMode(shaderManager.getMode());

  console.log("Right panel initialized");
}

/**
 * Create the parameters header
 */
function createParametersHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "PARAMETERS";
  return header;
}

const SLIDER_NAMES = ["PIXELATION", "DISTORTION", "INSTABILITY"] as const;
type SliderName = typeof SLIDER_NAMES[number];

/** Create a single slider row element */
function createSliderRow(name: SliderName): { row: HTMLElement; input: HTMLInputElement; value: HTMLSpanElement } {
  const row = document.createElement("div");
  row.className = "slider-row";
  row.id = `slider-row-${name.toLowerCase()}`;
  row.innerHTML = `
    <label>${name}</label>
    <input type="range" min="0" max="100" value="50" id="slider-${name.toLowerCase()}">
    <span class="slider-value" id="slider-value-${name.toLowerCase()}">50%</span>
  `;
  return {
    row,
    input: row.querySelector("input") as HTMLInputElement,
    value: row.querySelector(".slider-value") as HTMLSpanElement,
  };
}

/**
 * Create the effect sliders
 */
function createEffectSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "effect-sliders panel-section";

  sliderElements = {} as typeof sliderElements;

  for (const name of SLIDER_NAMES) {
    const { row, input, value: valueSpan } = createSliderRow(name);
    container.appendChild(row);
    sliderElements![name] = { input, value: valueSpan };

    input.addEventListener("input", () => {
      const sliderValue = parseInt(input.value, 10);
      valueSpan.textContent = `${sliderValue}%`;

      const mode = shaderManager.getMode();
      if (mode === "NORMAL" || mode === "NAVI") return;

      const mapping = PARAMETER_MAPPINGS[mode]?.[name];
      if (mapping) {
        const paramValue = mapping.min + (sliderValue / 100) * (mapping.max - mapping.min);
        shaderManager.setParameter(mapping.uniform, paramValue);
      }
    });
  }

  return container;
}

/**
 * Update slider values when mode changes
 */
function updateSlidersForMode(mode: ViewMode): void {
  if (!sliderElements) return;

  const isEffectMode = mode !== "NORMAL" && mode !== "NAVI";

  for (const name of SLIDER_NAMES) {
    const { input, value } = sliderElements[name];
    input.disabled = !isEffectMode;
    input.parentElement?.classList.toggle("disabled", !isEffectMode);

    if (!isEffectMode) {
      input.value = "0";
      value.textContent = "--";
      continue;
    }

    const mapping = PARAMETER_MAPPINGS[mode as keyof typeof PARAMETER_MAPPINGS]?.[name];
    if (mapping) {
      const paramValue = shaderManager.getParameters()[mapping.uniform] ?? mapping.default;
      const sliderValue = Math.round(((paramValue - mapping.min) / (mapping.max - mapping.min)) * 100);
      input.value = String(Math.max(0, Math.min(100, sliderValue)));
      value.textContent = `${input.value}%`;
    }
  }
}

/**
 * Export function to manually refresh sliders
 */
export function refreshSliders(): void {
  updateSlidersForMode(shaderManager.getMode());
}

/**
 * Create the live readout display
 */
function createLiveReadout(): HTMLElement {
  const container = document.createElement("div");
  container.className = "live-readout";
  container.innerHTML = `
    <div class="readout-row">
      <span class="readout-label">LAT</span>
      <span class="readout-value" id="readout-lat">--°</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">LNG</span>
      <span class="readout-value" id="readout-lng">--°</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">ALT</span>
      <span class="readout-value" id="readout-alt">----m</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">GSD</span>
      <span class="readout-value" id="readout-gsd">--m</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">NIIRS</span>
      <span class="readout-value" id="readout-niirs">--</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">SUB</span>
      <span class="readout-value" id="readout-sub">--° EL</span>
    </div>
  `;
  return container;
}

/**
 * Subscribe to CesiumJS camera change events for live updates
 */
function subscribeToCameraChanges(viewer: Viewer): void {
  // Use moveEnd for performance (fires when camera stops moving)
  viewer.camera.moveEnd.addEventListener(() => {
    updateReadoutsFromCamera(viewer);
  });

  // Also update during movement with throttling
  let lastUpdate = 0;
  const throttleMs = 100;

  viewer.camera.changed.addEventListener(() => {
    const now = Date.now();
    if (now - lastUpdate > throttleMs) {
      lastUpdate = now;
      updateReadoutsFromCamera(viewer);
    }
  });
}

/**
 * Update readouts from camera position
 */
function updateReadoutsFromCamera(viewer: Viewer): void {
  const camera = viewer.camera;
  
  // Get camera position in cartographic coordinates
  const cartographic = camera.positionCartographic;
  if (!cartographic) return;

  const latitude = Cesium.Math.toDegrees(cartographic.latitude);
  const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  const altitude = cartographic.height;
  
  // Get camera pitch (negative because Cesium uses negative for looking down)
  const pitchDegrees = Cesium.Math.toDegrees(camera.pitch);

  // Calculate GSD (Ground Sample Distance)
  // Simplified: GSD ≈ altitude * sensor_size / focal_length
  // For a rough estimate: GSD ≈ altitude / 10000 (at nadir)
  const gsd = Math.max(0.01, altitude / 10000);

  // Calculate NIIRS (National Imagery Interpretability Rating Scale)
  // Simplified formula: NIIRS ≈ 9 - log10(altitude/100), clamped 1-9
  // This gives roughly: 100m alt = NIIRS 9, 1km = 8, 10km = 7, etc.
  const niirs = Math.max(1, Math.min(9, 9 - Math.log10(altitude / 100)));

  updateReadouts({
    latitude,
    longitude,
    altitude,
    gsd,
    niirs,
    pitch: pitchDegrees,
  });
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
 * Format altitude with appropriate precision
 */
function formatAltitude(altitude: number): string {
  if (altitude >= 1_000_000) return `${(altitude / 1000).toFixed(0)}km`;
  if (altitude >= 1000) return `${Math.round(altitude)}m`;
  return `${altitude.toFixed(1)}m`;
}

/**
 * Update a readout element if it exists and value is defined
 */
function setReadout(id: string, value: number | undefined, formatter: (v: number) => string): void {
  if (value === undefined) return;
  const el = document.getElementById(id);
  if (el) el.textContent = formatter(value);
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
 * Update the live readouts with calculated data
 */
export function updateReadouts(data: {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gsd?: number;
  niirs?: number;
  pitch?: number;
}): void {
  setReadout("readout-lat", data.latitude, formatLatitude);
  setReadout("readout-lng", data.longitude, formatLongitude);
  setReadout("readout-alt", data.altitude, formatAltitude);
  setReadout("readout-gsd", data.gsd, formatDistance);
  setReadout("readout-niirs", data.niirs, (v) => v.toFixed(1));
  setReadout("readout-sub", data.pitch, (v) => `${v.toFixed(1)}° EL`);
}
