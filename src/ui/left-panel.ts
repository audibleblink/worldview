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
import type { SatelliteLayer, SatelliteRecord } from "../layers/satellites.ts";

// Store reference to update functions
let updatePOIDisplay: (() => void) | null = null;

// Satellite layer state
let _satelliteLayer: SatelliteLayer | null = null;
let _loadAllTLEs: (() => Promise<SatelliteRecord[]>) | null = null;
let _cachedTLERecords: SatelliteRecord[] | null = null;
let _satLayerActive = false;

export interface LeftPanelOptions {
  satelliteLayer?: SatelliteLayer;
  loadAllTLEs?: () => Promise<SatelliteRecord[]>;
}

/**
 * Initialize the left panel
 */
export function initLeftPanel(_viewer: Viewer, options?: LeftPanelOptions): void {
  _satelliteLayer = options?.satelliteLayer ?? null;
  _loadAllTLEs = options?.loadAllTLEs ?? null;
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
  wireUpSatelliteToggle();

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
      <span>SATELLITES</span>
      <button class="toggle-btn" id="satellite-toggle">OFF</button>
    </div>
    <div class="sat-filter-row hidden" id="sat-filter-row">
      <button class="toggle-btn on" id="filter-active" data-category="active">ACTIVE</button>
      <button class="toggle-btn on" id="filter-stations" data-category="stations">STATIONS</button>
      <button class="toggle-btn on" id="filter-military" data-category="military">MILITARY</button>
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
 * Wire up the satellite layer toggle button and category filter buttons
 */
function wireUpSatelliteToggle(): void {
  const btn = document.getElementById("satellite-toggle") as HTMLButtonElement | null;
  const filterRow = document.getElementById("sat-filter-row");
  if (!btn || !_satelliteLayer || !_loadAllTLEs) return;

  btn.addEventListener("click", async () => {
    if (_satLayerActive) {
      // Turn OFF
      _satelliteLayer!.hide();
      _satLayerActive = false;
      btn.textContent = "OFF";
      btn.classList.remove("on");
      // Hide filter buttons
      filterRow?.classList.add("hidden");
      addLogEntry("[SAT] Satellite layer disabled");
    } else {
      // Turn ON
      btn.textContent = "LOADING";
      btn.disabled = true;
      try {
        // Fetch TLEs once, then cache
        if (!_cachedTLERecords) {
          addLogEntry("[SAT] Fetching TLE data...");
          _cachedTLERecords = await _loadAllTLEs!();
          addLogEntry(`[SAT] Loaded ${_cachedTLERecords.length} records`, "success");
        }
        await _satelliteLayer!.show(_cachedTLERecords);
        _satLayerActive = true;
        btn.textContent = "ON";
        btn.classList.add("on");
        // Show filter buttons and reset them to ON state
        filterRow?.classList.remove("hidden");
        resetFilterButtons();
        addLogEntry(`[SAT] Satellite layer active`, "success");
      } catch (err) {
        addLogEntry(`[SAT] Failed to load TLEs: ${err}`, "error");
        btn.textContent = "ERR";
      } finally {
        btn.disabled = false;
      }
    }
  });

  // Wire category filter buttons
  wireUpCategoryFilters();
}

/**
 * Reset all category filter buttons to ON state
 */
function resetFilterButtons(): void {
  const categories: Array<"active" | "stations" | "military"> = ["active", "stations", "military"];
  for (const cat of categories) {
    const filterBtn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    if (filterBtn) {
      filterBtn.classList.add("on");
      filterBtn.dataset.active = "true";
    }
    // Ensure layer shows the category if it was toggled off before
    _satelliteLayer?.setCategory(cat, true);
  }
}

/**
 * Wire the three category filter buttons to the satellite layer
 */
function wireUpCategoryFilters(): void {
  const categories: Array<"active" | "stations" | "military"> = ["active", "stations", "military"];
  for (const cat of categories) {
    const filterBtn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    if (!filterBtn) continue;
    // Mark as active by default
    filterBtn.dataset.active = "true";
    filterBtn.addEventListener("click", () => {
      if (!_satLayerActive) return;
      const isActive = filterBtn.dataset.active === "true";
      const nowActive = !isActive;
      filterBtn.dataset.active = String(nowActive);
      if (nowActive) {
        filterBtn.classList.add("on");
      } else {
        filterBtn.classList.remove("on");
      }
      _satelliteLayer?.setCategory(cat, nowActive);
      addLogEntry(`[SAT] ${cat.toUpperCase()} ${nowActive ? "ON" : "OFF"}`);
    });
  }
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
    // Update city tabs visual state
    document.querySelectorAll(".city-tab").forEach((tab, i) => {
      tab.classList.toggle("active", i === cityIndex);
    });
    addLogEntry(`[NAV] Flying to ${getCities()[cityIndex]?.name}`);
  });
}

/**
 * Handle POI navigation and update UI
 */
function handlePOINavigation(navigateFn: () => void): void {
  navigateFn();
  updatePOIDisplayState();
  updateTooltipFromCurrentPOI();
  const poi = getCurrentPOI();
  if (poi) {
    addLogEntry(`[NAV] POI: ${poi.name}`);
  }
}

/**
 * Wire up POI navigation buttons
 */
function wireUpPOINavigation(): void {
  document.getElementById("prev-poi")?.addEventListener("click", () => handlePOINavigation(prevPOI));
  document.getElementById("next-poi")?.addEventListener("click", () => handlePOINavigation(nextPOI));

  // Store the update function for external access
  updatePOIDisplay = updatePOIDisplayState;
}

/**
 * Update the POI display text and button states
 */
function updatePOIDisplayState(): void {
  const display = document.getElementById("poi-display");
  const prevBtn = document.getElementById("prev-poi") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("next-poi") as HTMLButtonElement | null;
  
  const city = getCurrentCity();
  const poiIndex = getCurrentPOIIndex();
  const poi = getCurrentPOI();

  if (display && poi) {
    display.textContent = poi.name;
  }

  if (city) {
    if (prevBtn) prevBtn.disabled = poiIndex === 0;
    if (nextBtn) nextBtn.disabled = poiIndex >= city.pois.length - 1;
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

// Note: City tab visual updates are handled by bottom-bar.ts

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
