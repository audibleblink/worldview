/**
 * WorldView - Right Panel
 * Parameters, sliders, and live readouts
 */

import type { Viewer } from "cesium";

/**
 * Initialize the right panel
 */
export function initRightPanel(_viewer: Viewer): void {
  console.log("Right panel initialized (stub)");
}

/**
 * Create the parameters header
 */
export function createParametersHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "parameters-header";
  header.textContent = "PARAMETERS";
  return header;
}

/**
 * Create the effect sliders (stubbed)
 */
export function createEffectSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "effect-sliders";

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
export function createLiveReadout(): HTMLElement {
  const container = document.createElement("div");
  container.className = "live-readout";
  container.innerHTML = `
    <div class="readout-row">
      <span class="readout-label">GSD</span>
      <span class="readout-value" id="readout-gsd">-- m</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">NIIRS</span>
      <span class="readout-value" id="readout-niirs">--</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">ALT</span>
      <span class="readout-value" id="readout-alt">-- km</span>
    </div>
    <div class="readout-row">
      <span class="readout-label">SUB</span>
      <span class="readout-value" id="readout-sub">--°, --°</span>
    </div>
  `;
  return container;
}

/**
 * Update the live readouts with camera data
 */
export function updateReadouts(data: {
  gsd?: number;
  niirs?: number;
  altitude?: number;
  lat?: number;
  lng?: number;
}): void {
  const gsdEl = document.getElementById("readout-gsd");
  const niirsEl = document.getElementById("readout-niirs");
  const altEl = document.getElementById("readout-alt");
  const subEl = document.getElementById("readout-sub");

  if (gsdEl && data.gsd !== undefined) {
    gsdEl.textContent = `${data.gsd.toFixed(2)} m`;
  }
  if (niirsEl && data.niirs !== undefined) {
    niirsEl.textContent = data.niirs.toFixed(1);
  }
  if (altEl && data.altitude !== undefined) {
    const altKm = data.altitude / 1000;
    altEl.textContent = `${altKm.toFixed(1)} km`;
  }
  if (subEl && data.lat !== undefined && data.lng !== undefined) {
    subEl.textContent = `${data.lat.toFixed(4)}°, ${data.lng.toFixed(4)}°`;
  }
}
