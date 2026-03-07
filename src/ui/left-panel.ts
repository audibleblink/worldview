/**
 * WorldView - Left Panel
 * City selector, POI navigation, and calibration controls
 */

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

export function initLeftPanel(_viewer: Viewer, options?: LeftPanelOptions): void {
  _satelliteLayer = options?.satelliteLayer ?? null;
  _loadAllTLEs = options?.loadAllTLEs ?? null;

  const leftPanel = document.querySelector(".left-panel");
  if (!leftPanel) {
    console.error("Left panel element not found");
    return;
  }

  leftPanel.innerHTML = "";
  leftPanel.appendChild(createCitySelector());
  leftPanel.appendChild(createPOINavigation());
  leftPanel.appendChild(createToggles());
  leftPanel.appendChild(createActionButtons());

  const calibrationHeader = document.createElement("div");
  calibrationHeader.className = "panel-header";
  calibrationHeader.textContent = "CALIBRATION";
  leftPanel.appendChild(calibrationHeader);

  leftPanel.appendChild(createCalibrationSliders());
  leftPanel.appendChild(createCalibrationButtons());
  leftPanel.appendChild(createCCTVPlaceholder());
  leftPanel.appendChild(createSystemLog());

  wireUpCitySelector();
  wireUpPOINavigation();
  wireUpSatelliteToggle();

  updatePOIDisplayState();
  updateTooltipFromCurrentPOI();

  console.log("Left panel initialized");
}

function createCitySelector(): HTMLElement {
  const container = document.createElement("div");
  container.className = "city-selector panel-section";

  const options = getCities()
    .map((city, i) => `<option value="${i}">${city.name}</option>`)
    .join("");

  container.innerHTML = `
    <label>LOCATION</label>
    <select id="city-dropdown">${options}</select>
  `;
  return container;
}

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

function wireUpSatelliteToggle(): void {
  const btn = document.getElementById("satellite-toggle") as HTMLButtonElement | null;
  const filterRow = document.getElementById("sat-filter-row");
  if (!btn || !_satelliteLayer || !_loadAllTLEs) return;

  btn.addEventListener("click", async () => {
    if (_satLayerActive) {
      _satelliteLayer!.hide();
      _satLayerActive = false;
      btn.textContent = "OFF";
      btn.classList.remove("on");
      filterRow?.classList.add("hidden");
      addLogEntry("[SAT] Satellite layer disabled");
      return;
    }

    btn.textContent = "LOADING";
    btn.disabled = true;
    try {
      if (!_cachedTLERecords) {
        addLogEntry("[SAT] Fetching TLE data...");
        _cachedTLERecords = await _loadAllTLEs!();
        addLogEntry(`[SAT] Loaded ${_cachedTLERecords.length} records`, "success");
      }
      await _satelliteLayer!.show(_cachedTLERecords);
      _satLayerActive = true;
      btn.textContent = "ON";
      btn.classList.add("on");
      filterRow?.classList.remove("hidden");
      resetFilterButtons();
      addLogEntry("[SAT] Satellite layer active", "success");
    } catch (err) {
      addLogEntry(`[SAT] Failed to load TLEs: ${err}`, "error");
      btn.textContent = "ERR";
    } finally {
      btn.disabled = false;
    }
  });

  wireUpCategoryFilters();
}

const CATEGORIES = ["active", "stations", "military"] as const;
type Category = (typeof CATEGORIES)[number];

function resetFilterButtons(): void {
  for (const cat of CATEGORIES) {
    const btn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    if (btn) {
      btn.classList.add("on");
      btn.dataset.active = "true";
    }
    _satelliteLayer?.setCategory(cat, true);
  }
}

function wireUpCategoryFilters(): void {
  for (const cat of CATEGORIES) {
    const btn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    if (!btn) continue;
    btn.dataset.active = "true";
    btn.addEventListener("click", () => {
      if (!_satLayerActive) return;
      const nowActive = btn.dataset.active !== "true";
      btn.dataset.active = String(nowActive);
      btn.classList.toggle("on", nowActive);
      _satelliteLayer?.setCategory(cat as Category, nowActive);
      addLogEntry(`[SAT] ${cat.toUpperCase()} ${nowActive ? "ON" : "OFF"}`);
    });
  }
}

function createActionButtons(): HTMLElement {
  const container = document.createElement("div");
  container.className = "action-buttons panel-section";
  container.innerHTML = `
    <button class="action-btn" disabled>AUTO CAL</button>
    <button class="action-btn" disabled>ALIGN - DRAPE</button>
  `;
  return container;
}

function createCalibrationSliders(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-sliders";

  const sliders = [
    { name: "AZIMUTH", value: 0, unit: "°" },
    { name: "PITCH",   value: 0, unit: "°" },
    { name: "FOC",     value: 50, unit: "" },
    { name: "RANGE",   value: 100, unit: "%" },
    { name: "HEIGHT",  value: 0, unit: "m" },
    { name: "NORTH",   value: 0, unit: "m" },
    { name: "EAST",    value: 0, unit: "m" },
  ];

  for (const { name, value, unit } of sliders) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <label>${name}</label>
      <input type="range" min="0" max="100" value="${value}" disabled>
      <span class="slider-value">${value}${unit}</span>
    `;
    container.appendChild(row);
  }

  return container;
}

function createCalibrationButtons(): HTMLElement {
  const container = document.createElement("div");
  container.className = "calibration-buttons panel-section";
  container.innerHTML = `
    <button disabled>SAVE CAL</button>
    <button disabled>RESET CAL</button>
  `;
  return container;
}

function createCCTVPlaceholder(): HTMLElement {
  const container = document.createElement("div");
  container.className = "cctv-placeholder";
  container.innerHTML = `
    <div class="cctv-header">CCTV FEED</div>
    <div class="cctv-content">NO FEED</div>
  `;
  return container;
}

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

function wireUpCitySelector(): void {
  const dropdown = document.getElementById("city-dropdown") as HTMLSelectElement | null;
  if (!dropdown) return;

  dropdown.addEventListener("change", (event) => {
    const cityIndex = parseInt((event.target as HTMLSelectElement).value, 10);
    setCurrentCity(cityIndex);
    updatePOIDisplayState();
    updateTooltipFromCurrentPOI();
    document.querySelectorAll(".city-tab").forEach((tab, i) => {
      tab.classList.toggle("active", i === cityIndex);
    });
    addLogEntry(`[NAV] Flying to ${getCities()[cityIndex]?.name}`);
  });
}

function handlePOINavigation(navigateFn: () => void): void {
  navigateFn();
  updatePOIDisplayState();
  updateTooltipFromCurrentPOI();
  const poi = getCurrentPOI();
  if (poi) addLogEntry(`[NAV] POI: ${poi.name}`);
}

function wireUpPOINavigation(): void {
  document.getElementById("prev-poi")?.addEventListener("click", () => handlePOINavigation(prevPOI));
  document.getElementById("next-poi")?.addEventListener("click", () => handlePOINavigation(nextPOI));
  updatePOIDisplay = updatePOIDisplayState;
}

function updatePOIDisplayState(): void {
  const display = document.getElementById("poi-display");
  const prevBtn = document.getElementById("prev-poi") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("next-poi") as HTMLButtonElement | null;

  const city = getCurrentCity();
  const poi = getCurrentPOI();
  const poiIndex = getCurrentPOIIndex();

  if (display && poi) display.textContent = poi.name;

  if (city) {
    if (prevBtn) prevBtn.disabled = poiIndex === 0;
    if (nextBtn) nextBtn.disabled = poiIndex >= city.pois.length - 1;
  }
}

function updateTooltipFromCurrentPOI(): void {
  const city = getCurrentCity();
  const poi = getCurrentPOI();
  if (city && poi) updateLocationTooltip(poi.name, city.name);
}

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

export function getPOIDisplayUpdater(): (() => void) | null {
  return updatePOIDisplay;
}
