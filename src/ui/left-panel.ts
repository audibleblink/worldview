/**
 * WorldView - Left Panel
 * City selector, POI navigation, and calibration controls
 */

// Use global Cesium type
type Viewer = import("cesium").Viewer;
import {
  getCities,
  getCurrentCity,
  getCurrentPOI,
  getCurrentPOIIndex,
  setCurrentCity,
  nextPOI,
  prevPOI,
} from "../pois.ts";
import { updateLocationTooltip } from "./bottom-bar.ts";

// Store reference to update functions
let updatePOIDisplay: (() => void) | null = null;

/**
 * Initialize the left panel
 */
export function initLeftPanel(_viewer: Viewer): void {
  const leftPanel = document.querySelector(".left-panel");
  if (!leftPanel) {
    console.error("Left panel element not found");
    return;
  }

  // Clear existing content
  leftPanel.innerHTML = "";

  // Create city selector
  const citySelector = createCitySelector();
  leftPanel.appendChild(citySelector);

  // Create POI navigation
  const poiNav = createPOINavigation();
  leftPanel.appendChild(poiNav);

  // Create toggles section
  const toggles = createToggles();
  leftPanel.appendChild(toggles);

  // Create action buttons
  const actionButtons = createActionButtons();
  leftPanel.appendChild(actionButtons);

  // Create calibration sliders
  const calibrationHeader = document.createElement("div");
  calibrationHeader.className = "panel-header";
  calibrationHeader.textContent = "CALIBRATION";
  leftPanel.appendChild(calibrationHeader);

  const calibrationSliders = createCalibrationSliders();
  leftPanel.appendChild(calibrationSliders);

  // Create calibration buttons
  const calibrationButtons = createCalibrationButtons();
  leftPanel.appendChild(calibrationButtons);

  // Create CCTV placeholder
  const cctv = createCCTVPlaceholder();
  leftPanel.appendChild(cctv);

  // Create system log
  const systemLog = createSystemLog();
  leftPanel.appendChild(systemLog);

  // Wire up event handlers
  wireUpCitySelector();
  wireUpPOINavigation();

  // Initial update
  updatePOIDisplayState();
  updateTooltipFromCurrentPOI();

  console.log("Left panel initialized");
}

/**
 * Create the city selector dropdown
 */
function createCitySelector(): HTMLElement {
  const container = document.createElement("div");
  container.className = "city-selector panel-section";

  const cities = getCities();
  const options = cities
    .map((city, index) => `<option value="${index}">${city.name}</option>`)
    .join("");

  container.innerHTML = `
    <label>LOCATION</label>
    <select id="city-dropdown">
      ${options}
    </select>
  `;
  return container;
}

/**
 * Create the POI navigation controls
 */
function createPOINavigation(): HTMLElement {
  const container = document.createElement("div");
  container.className = "poi-navigation panel-section";
  container.innerHTML = `
    <button class="nav-btn" id="prev-poi">PREV</button>
    <span class="poi-display" id="poi-display">POI 1/4</span>
    <button class="nav-btn" id="next-poi">NEXT</button>
  `;
  return container;
}

/**
 * Create stubbed toggle controls
 */
function createToggles(): HTMLElement {
  const container = document.createElement("div");
  container.className = "toggles panel-section";
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
 * Create action buttons
 */
function createActionButtons(): HTMLElement {
  const container = document.createElement("div");
  container.className = "action-buttons panel-section";
  container.innerHTML = `
    <button class="action-btn" disabled>AUTO CAL</button>
    <button class="action-btn" disabled>ALIGN - DRAPE</button>
  `;
  return container;
}

/**
 * Create stubbed calibration sliders
 */
function createCalibrationSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-sliders";

  const sliderConfigs = [
    { name: "AZIMUTH", value: 0, unit: "°" },
    { name: "PITCH", value: 0, unit: "°" },
    { name: "FOC", value: 50, unit: "" },
    { name: "RANGE", value: 100, unit: "%" },
    { name: "HEIGHT", value: 0, unit: "m" },
    { name: "NORTH", value: 0, unit: "m" },
    { name: "EAST", value: 0, unit: "m" },
  ];

  sliderConfigs.forEach((config) => {
    const slider = document.createElement("div");
    slider.className = "slider-row";
    slider.innerHTML = `
      <label>${config.name}</label>
      <input type="range" min="0" max="100" value="${config.value}" disabled>
      <span class="slider-value">${config.value}${config.unit}</span>
    `;
    container.appendChild(slider);
  });

  return container;
}

/**
 * Create calibration action buttons
 */
function createCalibrationButtons(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-buttons panel-section";
  container.innerHTML = `
    <button disabled>SAVE CAL</button>
    <button disabled>RESET CAL</button>
  `;
  return container;
}

/**
 * Create CCTV placeholder
 */
function createCCTVPlaceholder(): HTMLElement {
  const container = document.createElement("div");
  container.className = "cctv-placeholder";
  container.innerHTML = `
    <div class="cctv-header">CCTV FEED</div>
    <div class="cctv-content">NO FEED</div>
  `;
  return container;
}

/**
 * Create system log placeholder
 */
function createSystemLog(): HTMLElement {
  const container = document.createElement("div");
  container.className = "system-log";
  container.innerHTML = `
    <div class="log-header">SYSTEM LOG</div>
    <div class="log-content" id="system-log-content">
      <div class="log-entry success">[INIT] System ready</div>
      <div class="log-entry">[INFO] Google 3D Tiles active</div>
    </div>
  `;
  return container;
}

/**
 * Wire up city selector change handler
 */
function wireUpCitySelector(): void {
  const dropdown = document.getElementById("city-dropdown") as HTMLSelectElement;
  if (!dropdown) return;

  dropdown.addEventListener("change", (event) => {
    const target = event.target as HTMLSelectElement;
    const cityIndex = parseInt(target.value, 10);
    setCurrentCity(cityIndex);
    updatePOIDisplayState();
    updateTooltipFromCurrentPOI();
    updateCityTabs(cityIndex);
    addLogEntry(`[NAV] Flying to ${getCities()[cityIndex]?.name}`);
  });
}

/**
 * Wire up POI navigation buttons
 */
function wireUpPOINavigation(): void {
  const prevBtn = document.getElementById("prev-poi");
  const nextBtn = document.getElementById("next-poi");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      prevPOI();
      updatePOIDisplayState();
      updateTooltipFromCurrentPOI();
      const poi = getCurrentPOI();
      if (poi) {
        addLogEntry(`[NAV] POI: ${poi.name}`);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      nextPOI();
      updatePOIDisplayState();
      updateTooltipFromCurrentPOI();
      const poi = getCurrentPOI();
      if (poi) {
        addLogEntry(`[NAV] POI: ${poi.name}`);
      }
    });
  }

  // Store the update function for external access
  updatePOIDisplay = updatePOIDisplayState;
}

/**
 * Update the POI display text and button states
 */
function updatePOIDisplayState(): void {
  const display = document.getElementById("poi-display");
  const prevBtn = document.getElementById("prev-poi") as HTMLButtonElement;
  const nextBtn = document.getElementById("next-poi") as HTMLButtonElement;
  
  const city = getCurrentCity();
  const poiIndex = getCurrentPOIIndex();
  const poi = getCurrentPOI();

  if (display && city && poi) {
    const total = city.pois.length;
    display.textContent = poi.name;
  }

  // Update button states
  if (prevBtn && city) {
    prevBtn.disabled = poiIndex === 0;
  }
  if (nextBtn && city) {
    nextBtn.disabled = poiIndex >= city.pois.length - 1;
  }
}

/**
 * Update location tooltip from current POI
 */
function updateTooltipFromCurrentPOI(): void {
  const city = getCurrentCity();
  const poi = getCurrentPOI();
  
  if (city && poi) {
    updateLocationTooltip(poi.name, city.name);
  }
}

/**
 * Update city tabs to reflect current selection
 */
function updateCityTabs(activeIndex: number): void {
  const tabs = document.querySelectorAll(".city-tab");
  tabs.forEach((tab, index) => {
    tab.classList.toggle("active", index === activeIndex);
  });
}

/**
 * Add an entry to the system log
 */
export function addLogEntry(message: string, type: "info" | "error" | "success" = "info"): void {
  const logContent = document.getElementById("system-log-content");
  if (!logContent) return;

  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = message;

  logContent.insertBefore(entry, logContent.firstChild);

  // Keep only the last 20 entries
  while (logContent.children.length > 20) {
    logContent.removeChild(logContent.lastChild!);
  }
}

/**
 * Get the POI display update function
 */
export function getPOIDisplayUpdater(): (() => void) | null {
  return updatePOIDisplay;
}
