/**
 * WorldView - Right Panel
 * Parameters, sliders, and live readouts
 */

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");
type Viewer = import("cesium").Viewer;

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
 * Create the effect sliders (stubbed)
 */
function createEffectSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "effect-sliders panel-section";

  const sliders = [
    { name: "PIXELATION", value: 0 },
    { name: "DISTORTION", value: 0 },
    { name: "INSTABILITY", value: 0 },
  ];

  sliders.forEach((slider) => {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <label>${slider.name}</label>
      <input type="range" min="0" max="100" value="${slider.value}" disabled>
      <span class="slider-value">${slider.value}</span>
    `;
    container.appendChild(row);
  });

  return container;
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
