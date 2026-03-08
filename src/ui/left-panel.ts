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
import { CCTVManager, CCTVPanel, type BBox } from "../ground/cctv/index.ts";
import { GroundLayer } from "../ground/index.ts";
import type { StyleMode } from "../ground/traffic/particleStyles.ts";

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
};

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

function wireUpSatelliteToggle(): void {
  const btn = document.getElementById("satellite-toggle") as HTMLButtonElement | null;
  const filterRow = document.getElementById("sat-filter-row");
  if (!btn || !sat.layer || !sat.loadTLEs) return;

  btn.addEventListener("click", async () => {
    if (sat.active) {
      sat.layer!.hide();
      sat.active = false;
      btn.textContent = "OFF";
      btn.classList.remove("on");
      filterRow?.classList.add("hidden");
      addLogEntry("[SAT] Satellite layer disabled");
      return;
    }

    btn.textContent = "LOADING";
    btn.disabled = true;
    try {
      if (!sat.cachedRecords) {
        addLogEntry("[SAT] Fetching TLE data...");
        sat.cachedRecords = await sat.loadTLEs!();
        addLogEntry(`[SAT] Loaded ${sat.cachedRecords.length} records`, "success");
      }
      await sat.layer!.show(sat.cachedRecords);
      sat.active = true;
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

  btn.addEventListener("click", async () => {
    if (flight.active) {
      flight.layer!.hide();
      flight.active = false;
      btn.textContent = "OFF";
      btn.classList.remove("on");
      addLogEntry("[FLIGHTS] Layer disabled");
      return;
    }

    btn.textContent = "LOADING";
    btn.disabled = true;
    try {
      await flight.layer!.show();
      flight.active = true;
      btn.textContent = "ON";
      btn.classList.add("on");
      addLogEntry("[FLIGHTS] Layer active", "success");
    } catch (err) {
      addLogEntry(`[FLIGHTS] Failed to load flights: ${err}`, "error");
      btn.textContent = "ERR";
    } finally {
      btn.disabled = false;
    }
  });
}

function wireUpGroundToggle(): void {
  const btn = document.getElementById("ground-toggle") as HTMLButtonElement | null;
  const optionsRow = document.getElementById("ground-options-row");
  
  if (!btn) return;

  // Main ground toggle
  btn.addEventListener("click", async () => {
    if (!ground.layer) {
      addLogEntry("[GROUND] Layer not available", "error");
      return;
    }

    if (ground.active) {
      ground.layer.hide();
      ground.active = false;
      btn.textContent = "OFF";
      btn.classList.remove("on");
      optionsRow?.classList.add("hidden");
      addLogEntry("[GROUND] Layer disabled");
      return;
    }

    btn.textContent = "LOADING";
    btn.disabled = true;
    try {
      await ground.layer.show();
      ground.active = true;
      btn.textContent = "ON";
      btn.classList.add("on");
      optionsRow?.classList.remove("hidden");
      updateGroundSubToggles();
      addLogEntry("[GROUND] Layer active", "success");
    } catch (err) {
      addLogEntry(`[GROUND] Failed to load: ${err}`, "error");
      btn.textContent = "ERR";
    } finally {
      btn.disabled = false;
    }
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

/** Get the current viewport bounding box from Cesium camera */
function getViewportBBox(): BBox | null {
  if (!cctv.viewer) return null;

  const camera = cctv.viewer.camera;
  const canvas = cctv.viewer.scene.canvas;
  
  try {
    // Get corners of viewport in cartographic coordinates
    const corners = [
      camera.pickEllipsoid(new Cesium.Cartesian2(0, 0)),
      camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, 0)),
      camera.pickEllipsoid(new Cesium.Cartesian2(0, canvas.height)),
      camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width, canvas.height)),
    ];

    // Filter out null values (when camera is looking at sky)
    const validCorners = corners.filter((c): c is InstanceType<typeof Cesium.Cartesian3> => c !== undefined);
    
    if (validCorners.length < 2) {
      // Fall back to Austin bbox when camera is looking at sky
      return { west: -97.85, south: 30.15, east: -97.65, north: 30.40 };
    }

    // Convert to cartographic and find bounds
    let west = 180, south = 90, east = -180, north = -90;
    
    for (const corner of validCorners) {
      const carto = Cesium.Cartographic.fromCartesian(corner);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }

    // Expand bounds slightly to ensure we capture edge cameras
    const lonPadding = (east - west) * 0.1;
    const latPadding = (north - south) * 0.1;
    
    return {
      west: west - lonPadding,
      south: south - latPadding,
      east: east + lonPadding,
      north: north + latPadding,
    };
  } catch (error) {
    console.error("[CCTV] Error calculating viewport bbox:", error);
    return { west: -97.85, south: 30.15, east: -97.65, north: 30.40 };
  }
}

/** Update CCTV cameras for current viewport */
async function updateCCTVCamerasForViewport(): Promise<void> {
  const bbox = getViewportBBox();
  if (!bbox || !cctv.panel) return;
  
  await cctv.panel.updateViewport(bbox);
  addLogEntry(`[CCTV] Found ${cctv.panel.getCameraCount()} cameras`);
}

/** Wire up viewport change listener */
function wireUpViewportChangeListener(viewer: Viewer): void {
  // Debounce viewport changes to avoid excessive API calls
  const handleViewportChange = () => {
    if (cctv.viewportDebounce !== null) {
      clearTimeout(cctv.viewportDebounce);
    }
    
    cctv.viewportDebounce = window.setTimeout(() => {
      updateCCTVCamerasForViewport();
    }, 500);
  };

  // Listen for camera move end
  viewer.camera.moveEnd.addEventListener(handleViewportChange);
  
  // Also update on zoom
  viewer.camera.changed.addEventListener(handleViewportChange);
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
