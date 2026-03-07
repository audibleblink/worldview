/**
 * WorldView - Left Panel
 * City selector, POI navigation, and calibration controls
 */

import type { Viewer } from "cesium";

/**
 * Initialize the left panel
 */
export function initLeftPanel(_viewer: Viewer): void {
  console.log("Left panel initialized (stub)");
}

/**
 * Create the city selector dropdown
 */
export function createCitySelector(): HTMLElement {
  const container = document.createElement("div");
  container.className = "city-selector";
  container.innerHTML = `
    <label>LOCATION</label>
    <select id="city-dropdown" disabled>
      <option>SELECT CITY...</option>
    </select>
  `;
  return container;
}

/**
 * Create the POI navigation controls
 */
export function createPOINavigation(): HTMLElement {
  const container = document.createElement("div");
  container.className = "poi-navigation";
  container.innerHTML = `
    <button class="nav-btn" id="prev-poi" disabled>PREV</button>
    <span class="poi-display">POI 0/0</span>
    <button class="nav-btn" id="next-poi" disabled>NEXT</button>
  `;
  return container;
}

/**
 * Create stubbed toggle controls
 */
export function createToggles(): HTMLElement {
  const container = document.createElement("div");
  container.className = "toggles";
  container.innerHTML = `
    <div class="toggle-row">
      <span>COVERAGE</span>
      <button class="toggle-btn" disabled>ON</button>
    </div>
    <div class="toggle-row">
      <span>AUTO HOF SPY</span>
      <button class="toggle-btn" disabled>OFF</button>
    </div>
    <div class="toggle-row">
      <span>PROJECTION</span>
      <button class="toggle-btn" disabled>IN</button>
    </div>
  `;
  return container;
}

/**
 * Create stubbed calibration sliders
 */
export function createCalibrationSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-sliders";

  const sliderNames = ["GAIN", "OFFSET", "GAMMA", "CONTRAST", "BRIGHT", "HUE", "SAT"];

  sliderNames.forEach((name) => {
    const slider = document.createElement("div");
    slider.className = "slider-row";
    slider.innerHTML = `
      <label>${name}</label>
      <input type="range" min="0" max="100" value="50" disabled>
      <span class="slider-value">50</span>
    `;
    container.appendChild(slider);
  });

  return container;
}

/**
 * Create calibration action buttons
 */
export function createCalibrationButtons(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-buttons";
  container.innerHTML = `
    <button class="action-btn" disabled>AUTO CAL</button>
    <button class="action-btn" disabled>ALIGN - DRAPE</button>
    <button class="action-btn" disabled>SAVE CAL</button>
    <button class="action-btn" disabled>RESET CAL</button>
  `;
  return container;
}

/**
 * Create CCTV placeholder
 */
export function createCCTVPlaceholder(): HTMLElement {
  const container = document.createElement("div");
  container.className = "cctv-placeholder";
  container.innerHTML = `
    <div class="cctv-label">CCTV FEED</div>
    <div class="cctv-content">NO FEED</div>
  `;
  return container;
}

/**
 * Create system log placeholder
 */
export function createSystemLog(): HTMLElement {
  const container = document.createElement("div");
  container.className = "system-log";
  container.innerHTML = `
    <div class="log-header">SYSTEM LOG</div>
    <div class="log-content">
      <div class="log-entry">[INIT] System ready</div>
    </div>
  `;
  return container;
}
