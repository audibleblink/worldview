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

/**
 * Create the effect sliders
 */
function createEffectSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "effect-sliders panel-section";

  const sliderNames = ["PIXELATION", "DISTORTION", "INSTABILITY"] as const;

  // Initialize slider elements storage
  sliderElements = {
    PIXELATION: { input: null!, value: null! },
    DISTORTION: { input: null!, value: null! },
    INSTABILITY: { input: null!, value: null! },
  };

  sliderNames.forEach((name) => {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.id = `slider-row-${name.toLowerCase()}`;
    
    const label = document.createElement("label");
    label.textContent = name;
    
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = "50";
    input.id = `slider-${name.toLowerCase()}`;
    
    const valueSpan = document.createElement("span");
    valueSpan.className = "slider-value";
    valueSpan.textContent = "50%";
    valueSpan.id = `slider-value-${name.toLowerCase()}`;
    
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valueSpan);
    container.appendChild(row);
    
    // Store references
    sliderElements![name] = { input, value: valueSpan };
    
    // Add event listener for real-time updates
    input.addEventListener("input", () => {
      const sliderValue = parseInt(input.value, 10);
      valueSpan.textContent = `${sliderValue}%`;
      
      // Map slider value (0-100) to parameter value
      const mode = shaderManager.getMode();
      if (mode === "NORMAL" || mode === "NAVI") return;
      
      const mapping = PARAMETER_MAPPINGS[mode]?.[name];
      if (mapping) {
        // Convert 0-100 slider to min-max range
        const normalizedValue = sliderValue / 100;
        const paramValue = mapping.min + normalizedValue * (mapping.max - mapping.min);
        shaderManager.setParameter(mapping.uniform, paramValue);
      }
    });
  });

  return container;
}

/**
 * Update slider values when mode changes
 */
function updateSlidersForMode(mode: ViewMode): void {
  if (!sliderElements) return;
  
  const sliderNames = ["PIXELATION", "DISTORTION", "INSTABILITY"] as const;
  const isEffectMode = mode !== "NORMAL" && mode !== "NAVI";
  
  sliderNames.forEach((name) => {
    const { input, value } = sliderElements![name];
    
    if (isEffectMode) {
      // Enable slider
      input.disabled = false;
      input.parentElement?.classList.remove("disabled");
      
      // Get current parameter value and convert to slider percentage
      const mapping = PARAMETER_MAPPINGS[mode as keyof typeof PARAMETER_MAPPINGS]?.[name];
      if (mapping) {
        const params = shaderManager.getParameters();
        const paramValue = params[mapping.uniform] ?? mapping.default;
        
        // Convert parameter value to 0-100 slider range
        const normalizedValue = (paramValue - mapping.min) / (mapping.max - mapping.min);
        const sliderValue = Math.round(normalizedValue * 100);
        
        input.value = String(Math.max(0, Math.min(100, sliderValue)));
        value.textContent = `${input.value}%`;
      }
    } else {
      // Disable slider for NORMAL mode
      input.disabled = true;
      input.parentElement?.classList.add("disabled");
      input.value = "0";
      value.textContent = "--";
    }
  });
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
      <span class="readout-label">GSD</span>
      <span class="readout-value" id="readout-gsd">--m</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">NIIRS</span>
      <span class="readout-value" id="readout-niirs">--</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">ALT</span>
      <span class="readout-value" id="readout-alt">----m</span>
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
    gsd,
    niirs,
    altitude,
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
 * Update the live readouts with calculated data
 */
export function updateReadouts(data: {
  gsd?: number;
  niirs?: number;
  altitude?: number;
  pitch?: number;
}): void {
  setReadout("readout-gsd", data.gsd, formatDistance);
  setReadout("readout-niirs", data.niirs, (v) => v.toFixed(1));
  setReadout("readout-alt", data.altitude, formatAltitude);
  setReadout("readout-sub", data.pitch, (v) => `${v.toFixed(1)}° EL`);
}
