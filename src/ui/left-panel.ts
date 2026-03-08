/**
 * WorldView - Left Panel
 * City selector, POI navigation, and calibration controls
 */

declare const Cesium: typeof import("cesium");

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
import type { FlightLayer } from "../layers/flights.ts";
import { CCTVManager, CCTVPanel } from "../ground/cctv/index.ts";
import { GroundLayer } from "../ground/index.ts";
import type { StyleMode } from "../ground/traffic/particleStyles.ts";
import { getViewportBBox, getCameraAltitude, type BBox } from "../camera.ts";

// Satellite layer state — grouped to make lifecycle clear
const sat = {
  layer: null as SatelliteLayer | null,
  loadTLEs: null as (() => Promise<SatelliteRecord[]>) | null,
  cachedRecords: null as SatelliteRecord[] | null,
  active: false,
};

// Flight layer state — parallel structure to sat
const flight = {
  layer: null as FlightLayer | null,
  active: false,
};

// Ground layer state
const ground = {
  layer: null as GroundLayer | null,
  active: false,
  trafficActive: true,
  cctvActive: true,
  seismicActive: true,
  styleMode: "heatmap" as StyleMode,
};

// CCTV state
const cctv = {
  manager: null as CCTVManager | null,
  panel: null as CCTVPanel | null,
  viewer: null as Viewer | null,
  viewportDebounce: null as number | null,
  lastAltitude: 0,
  isAboveAltitudeThreshold: true,
};

// CCTV altitude threshold - only load cameras below this altitude (in meters)
const CCTV_MAX_ALTITUDE_M = 2_000_000; // 2000 km

export interface LeftPanelOptions {
  satelliteLayer?: SatelliteLayer;
  loadAllTLEs?: () => Promise<SatelliteRecord[]>;
  flightLayer?: FlightLayer;
  groundLayer?: GroundLayer;
}

export function initLeftPanel(viewer: Viewer, options?: LeftPanelOptions): void {
  sat.layer = options?.satelliteLayer ?? null;
  sat.loadTLEs = options?.loadAllTLEs ?? null;
  sat.cachedRecords = null;
  sat.active = false;

  flight.layer = options?.flightLayer ?? null;
  flight.active = false;

  // Initialize ground layer (may be provided externally or created here)
  ground.layer = options?.groundLayer ?? null;
  ground.active = false;
  
  // Set up ground layer error handler
  if (ground.layer) {
    ground.layer.setOnError((error) => {
      addLogEntry(`[${error.layer.toUpperCase()}] ${error.message}`, "error");
    });
  }

  // Initialize CCTV manager - use from ground layer if available
  cctv.viewer = viewer;
  if (ground.layer) {
    cctv.manager = ground.layer.getCCTVManager();
  } else {
    cctv.manager = new CCTVManager();
    cctv.manager.initialize(viewer);
  }

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
  
  // Create CCTV panel instead of placeholder
  cctv.panel = new CCTVPanel(cctv.manager);
  leftPanel.appendChild(cctv.panel.getElement());
  
  leftPanel.appendChild(createSystemLog());

  wireUpCitySelector();
  wireUpPOINavigation();
  wireUpSatelliteToggle();
  wireUpFlightToggle();
  wireUpGroundToggle();
  wireUpViewportChangeListener(viewer);

  updatePOIDisplayState();
  updateTooltipFromCurrentPOI();

  // Initial camera load for current viewport
  setTimeout(() => updateCCTVCamerasForViewport(), 500);

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
      <button class="toggle-btn on" id="filter-stations" data-category="stations">STATIONS</button>
      <button class="toggle-btn on" id="filter-military" data-category="military">MILITARY</button>
      <button class="toggle-btn on" id="filter-gnss" data-category="gnss">GNSS</button>
      <button class="toggle-btn on" id="filter-research" data-category="research">RESEARCH</button>
      <button class="toggle-btn" id="filter-starlink" data-category="starlink">STARLINK</button>
    </div>
    <div class="toggle-row">
      <span>FLIGHTS</span>
      <button class="toggle-btn" id="flight-toggle">OFF</button>
    </div>
    <div class="toggle-row">
      <span>GROUND</span>
      <button class="toggle-btn" id="ground-toggle">OFF</button>
    </div>
    <div class="ground-options-row hidden" id="ground-options-row">
      <div class="sub-toggle-row">
        <button class="toggle-btn on sub-toggle" id="ground-traffic-toggle">TRAFFIC</button>
        <button class="toggle-btn style-toggle" id="ground-style-toggle">HEATMAP</button>
      </div>
      <div class="sub-toggle-row">
        <button class="toggle-btn on sub-toggle" id="ground-cctv-toggle">CCTV</button>
        <button class="toggle-btn on sub-toggle" id="ground-seismic-toggle">SEISMIC</button>
      </div>
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

/** Generic async toggle handler for layer buttons */
async function handleLayerToggle<T>(
  btn: HTMLButtonElement,
  state: { active: boolean },
  layer: { show: (...args: T[]) => Promise<void>; hide: () => void },
  options: {
    logPrefix: string;
    onShow?: () => Promise<T[] | void>;
    onEnabled?: () => void;
    onDisabled?: () => void;
  }
): Promise<void> {
  if (state.active) {
    layer.hide();
    state.active = false;
    btn.textContent = "OFF";
    btn.classList.remove("on");
    options.onDisabled?.();
    addLogEntry(`[${options.logPrefix}] Layer disabled`);
    return;
  }

  btn.textContent = "LOADING";
  btn.disabled = true;
  try {
    const args = await options.onShow?.();
    if (args !== undefined) {
      await layer.show(...(args as T[]));
    } else {
      await layer.show();
    }
    state.active = true;
    btn.textContent = "ON";
    btn.classList.add("on");
    options.onEnabled?.();
    addLogEntry(`[${options.logPrefix}] Layer active`, "success");
  } catch (err) {
    addLogEntry(`[${options.logPrefix}] Failed to load: ${err}`, "error");
    btn.textContent = "ERR";
  } finally {
    btn.disabled = false;
  }
}

function wireUpSatelliteToggle(): void {
  const btn = document.getElementById("satellite-toggle") as HTMLButtonElement | null;
  const filterRow = document.getElementById("sat-filter-row");
  if (!btn || !sat.layer || !sat.loadTLEs) return;

  btn.addEventListener("click", () => handleLayerToggle(btn, sat, sat.layer!, {
    logPrefix: "SAT",
    onShow: async () => {
      if (!sat.cachedRecords) {
        addLogEntry("[SAT] Fetching TLE data...");
        sat.cachedRecords = await sat.loadTLEs!();
        addLogEntry(`[SAT] Loaded ${sat.cachedRecords.length} records`, "success");
      }
      return [sat.cachedRecords];
    },
    onEnabled: () => {
      filterRow?.classList.remove("hidden");
      resetFilterButtons();
    },
    onDisabled: () => filterRow?.classList.add("hidden"),
  }));

  wireUpCategoryFilters();
}

const CATEGORIES = ["stations", "military", "gnss", "research", "starlink"] as const;
type Category = (typeof CATEGORIES)[number];

// Starlink defaults to OFF when enabling satellites
const DEFAULT_OFF_CATEGORIES: Set<Category> = new Set(["starlink"]);

function resetFilterButtons(): void {
  for (const cat of CATEGORIES) {
    const btn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    const defaultOn = !DEFAULT_OFF_CATEGORIES.has(cat);
    if (btn) {
      btn.classList.toggle("on", defaultOn);
      btn.dataset.active = String(defaultOn);
    }
    sat.layer?.setCategory(cat, defaultOn);
  }
}

function wireUpCategoryFilters(): void {
  for (const cat of CATEGORIES) {
    const btn = document.getElementById(`filter-${cat}`) as HTMLButtonElement | null;
    if (!btn) continue;
    btn.dataset.active = "true";
    btn.addEventListener("click", () => {
      if (!sat.active) return;
      const nowActive = btn.dataset.active !== "true";
      btn.dataset.active = String(nowActive);
      btn.classList.toggle("on", nowActive);
      sat.layer?.setCategory(cat as Category, nowActive);
      addLogEntry(`[SAT] ${cat.toUpperCase()} ${nowActive ? "ON" : "OFF"}`);
    });
  }
}

function wireUpFlightToggle(): void {
  const btn = document.getElementById("flight-toggle") as HTMLButtonElement | null;
  if (!btn || !flight.layer) return;

  btn.addEventListener("click", () => handleLayerToggle(btn, flight, flight.layer!, {
    logPrefix: "FLIGHTS",
  }));
}

function wireUpGroundToggle(): void {
  const btn = document.getElementById("ground-toggle") as HTMLButtonElement | null;
  const optionsRow = document.getElementById("ground-options-row");
  
  if (!btn) return;

  // Main ground toggle
  btn.addEventListener("click", () => {
    if (!ground.layer) {
      addLogEntry("[GROUND] Layer not available", "error");
      return;
    }
    handleLayerToggle(btn, ground, ground.layer, {
      logPrefix: "GROUND",
      onEnabled: () => {
        optionsRow?.classList.remove("hidden");
        updateGroundSubToggles();
      },
      onDisabled: () => optionsRow?.classList.add("hidden"),
    });
  });

  // Traffic sub-toggle
  const trafficBtn = document.getElementById("ground-traffic-toggle") as HTMLButtonElement | null;
  trafficBtn?.addEventListener("click", () => {
    if (!ground.layer || !ground.active) return;
    ground.trafficActive = !ground.trafficActive;
    ground.layer.setTrafficVisible(ground.trafficActive);
    trafficBtn.classList.toggle("on", ground.trafficActive);
    updateStyleToggleVisibility();
    addLogEntry(`[GROUND] Traffic ${ground.trafficActive ? "ON" : "OFF"}`);
  });

  // Style toggle (HEATMAP / TERMINAL)
  const styleBtn = document.getElementById("ground-style-toggle") as HTMLButtonElement | null;
  styleBtn?.addEventListener("click", () => {
    if (!ground.layer || !ground.active || !ground.trafficActive) return;
    ground.styleMode = ground.styleMode === "heatmap" ? "terminal" : "heatmap";
    ground.layer.setTrafficStyleMode(ground.styleMode);
    styleBtn.textContent = ground.styleMode.toUpperCase();
    addLogEntry(`[GROUND] Style: ${ground.styleMode.toUpperCase()}`);
  });

  // CCTV sub-toggle
  const cctvBtn = document.getElementById("ground-cctv-toggle") as HTMLButtonElement | null;
  cctvBtn?.addEventListener("click", () => {
    if (!ground.layer || !ground.active) return;
    ground.cctvActive = !ground.cctvActive;
    ground.layer.setCCTVVisible(ground.cctvActive);
    cctvBtn.classList.toggle("on", ground.cctvActive);
    addLogEntry(`[GROUND] CCTV ${ground.cctvActive ? "ON" : "OFF"}`);
  });

  // Seismic sub-toggle
  const seismicBtn = document.getElementById("ground-seismic-toggle") as HTMLButtonElement | null;
  seismicBtn?.addEventListener("click", () => {
    if (!ground.layer || !ground.active) return;
    ground.seismicActive = !ground.seismicActive;
    ground.layer.setSeismicVisible(ground.seismicActive);
    seismicBtn.classList.toggle("on", ground.seismicActive);
    addLogEntry(`[GROUND] Seismic ${ground.seismicActive ? "ON" : "OFF"}`);
  });
}

/** Update sub-toggle button states to match current settings */
function updateGroundSubToggles(): void {
  const trafficBtn = document.getElementById("ground-traffic-toggle");
  const cctvBtn = document.getElementById("ground-cctv-toggle");
  const seismicBtn = document.getElementById("ground-seismic-toggle");
  const styleBtn = document.getElementById("ground-style-toggle");

  trafficBtn?.classList.toggle("on", ground.trafficActive);
  cctvBtn?.classList.toggle("on", ground.cctvActive);
  seismicBtn?.classList.toggle("on", ground.seismicActive);
  
  if (styleBtn) {
    styleBtn.textContent = ground.styleMode.toUpperCase();
  }
  
  updateStyleToggleVisibility();
}

/** Show/hide style toggle based on traffic state */
function updateStyleToggleVisibility(): void {
  const styleBtn = document.getElementById("ground-style-toggle") as HTMLButtonElement | null;
  if (styleBtn) {
    styleBtn.style.visibility = ground.trafficActive ? "visible" : "hidden";
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

/** Austin fallback bbox for when camera is looking at sky */
const AUSTIN_BBOX: BBox = { west: -97.85, south: 30.15, east: -97.65, north: 30.40 };

/** Get the current viewport bounding box from Cesium camera */
function getViewportBBoxForCCTV(): BBox | null {
  if (!cctv.viewer) return null;
  return getViewportBBox(cctv.viewer, { padding: 0.1, fallback: AUSTIN_BBOX });
}

/** Get current camera altitude in meters */
function getCCTVCameraAltitude(): number {
  if (!cctv.viewer) return Infinity;
  return getCameraAltitude(cctv.viewer);
}

/** Update CCTV cameras for current viewport */
async function updateCCTVCamerasForViewport(): Promise<void> {
  if (!cctv.panel) return;
  
  const altitude = getCCTVCameraAltitude();
  cctv.lastAltitude = altitude;
  
  // Check if we're above the altitude threshold
  if (altitude > CCTV_MAX_ALTITUDE_M) {
    if (!cctv.isAboveAltitudeThreshold) {
      cctv.isAboveAltitudeThreshold = true;
      // Clear cameras and show message
      clearCCTVPanel();
      addLogEntry(`[CCTV] Zoom in to view cameras (alt: ${(altitude / 1000).toFixed(0)}km)`);
    }
    return;
  }
  
  cctv.isAboveAltitudeThreshold = false;
  
  const bbox = getViewportBBoxForCCTV();
  if (!bbox) return;
  
  await cctv.panel.updateViewport(bbox);
  addLogEntry(`[CCTV] Found ${cctv.panel.getCameraCount()} cameras`);
}

/** Clear CCTV panel when zoomed out */
function clearCCTVPanel(): void {
  if (!cctv.panel) return;
  
  const listEl = document.getElementById("cctv-camera-list");
  if (listEl) {
    listEl.innerHTML = '<div class="cctv-empty">ZOOM IN TO VIEW CAMERAS</div>';
  }
  
  const countEl = document.getElementById("cctv-count");
  if (countEl) {
    countEl.textContent = "—";
  }
}

/** Wire up viewport change listener */
function wireUpViewportChangeListener(viewer: Viewer): void {
  // Debounce viewport changes to avoid excessive API calls
  const handleViewportChange = () => {
    if (cctv.viewportDebounce !== null) {
      clearTimeout(cctv.viewportDebounce);
    }
    
    // Longer debounce (800ms) to reduce API spam during navigation
    cctv.viewportDebounce = window.setTimeout(() => {
      updateCCTVCamerasForViewport();
    }, 800);
  };

  // Listen for camera move end only (not changed - that fires too often)
  viewer.camera.moveEnd.addEventListener(handleViewportChange);
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

export function getPOIDisplayUpdater(): () => void {
  return updatePOIDisplayState;
}
