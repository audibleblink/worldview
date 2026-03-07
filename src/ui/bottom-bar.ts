/**
 * WorldView - Bottom Bar
 * Style presets, mode switcher, city tabs, and location tooltip
 */

// Use global Cesium type
type Viewer = import("cesium").Viewer;
import { getCities, setCurrentCity, getCurrentCity, getCurrentPOI } from "../pois.ts";
import { getPOIDisplayUpdater } from "./left-panel.ts";
import { shaderManager, type ViewMode } from "../shaders/index.ts";

export type { ViewMode } from "../shaders/index.ts";

// City abbreviations for tabs
const CITY_ABBREVS = ["ATX", "SFO", "NYC", "TYO", "LDN", "PAR", "DXB", "DCA"];

/**
 * Initialize the bottom bar
 */
export function initBottomBar(_viewer: Viewer): void {
  const bottomBar = document.querySelector(".bottom-bar");
  if (!bottomBar) {
    console.error("Bottom bar element not found");
    return;
  }

  // Clear existing content
  bottomBar.innerHTML = "";

  // Create left section with style presets label and mode switcher
  const leftSection = document.createElement("div");
  leftSection.className = "bottom-bar-left";

  const styleLabel = createStylePresetsLabel();
  leftSection.appendChild(styleLabel);

  const modeSwitcher = createModeSwitcher();
  leftSection.appendChild(modeSwitcher);

  bottomBar.appendChild(leftSection);

  // Create center section with city tabs
  const centerSection = document.createElement("div");
  centerSection.className = "bottom-bar-center";

  const cityTabs = createCityTabs();
  centerSection.appendChild(cityTabs);

  bottomBar.appendChild(centerSection);

  // Create right section with location tooltip
  const rightSection = document.createElement("div");
  rightSection.className = "bottom-bar-right";

  const locationTooltip = createLocationTooltip();
  rightSection.appendChild(locationTooltip);

  bottomBar.appendChild(rightSection);

  // Wire up event handlers
  wireUpModeButtons();
  wireUpCityTabs();

  // Set initial active city tab
  updateCityTabsActive(0);

  console.log("Bottom bar initialized");
}

/**
 * Create the style presets label
 */
function createStylePresetsLabel(): HTMLElement {
  const label = document.createElement("span");
  label.className = "style-presets-label";
  label.textContent = "STYLE PRESETS";
  return label;
}

/**
 * Create the mode switcher buttons
 */
function createModeSwitcher(): HTMLElement {
  const container = document.createElement("div");
  container.className = "mode-switcher";

  const modes: ViewMode[] = ["NORMAL", "CRT", "NVG", "FLIR", "ANIME", "NAVI"];
  const currentMode = shaderManager.getMode();

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.className = `mode-btn ${mode === currentMode ? "active" : ""}`;
    button.textContent = mode;
    button.dataset.mode = mode;
    container.appendChild(button);
  });

  return container;
}

/**
 * Wire up mode button click handlers
 */
function wireUpModeButtons(): void {
  const buttons = document.querySelectorAll(".mode-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const target = event.target as HTMLButtonElement;
      const mode = target.dataset.mode as ViewMode;
      if (mode) {
        setMode(mode);
      }
    });
  });
}

/**
 * Set the active view mode
 */
export function setMode(mode: ViewMode): void {
  // Apply shader effect (this is the source of truth)
  shaderManager.setMode(mode);

  // Update button states
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    const btnMode = (btn as HTMLElement).dataset.mode;
    btn.classList.toggle("active", btnMode === mode);
  });

  // Update the top bar mode indicator
  const modeIndicator = document.querySelector(".mode-indicator");
  if (modeIndicator) {
    modeIndicator.textContent = mode;
  }

  console.log(`Mode changed to: ${mode}`);
}

/**
 * Get the current view mode
 */
export function getMode(): ViewMode {
  return shaderManager.getMode();
}

/**
 * Create the city quick-jump tabs
 */
function createCityTabs(): DocumentFragment {
  const fragment = document.createDocumentFragment();

  CITY_ABBREVS.forEach((abbrev, index) => {
    const tab = document.createElement("button");
    tab.className = "city-tab";
    tab.textContent = abbrev;
    tab.dataset.cityIndex = String(index);
    fragment.appendChild(tab);
  });

  return fragment;
}

/**
 * Wire up city tab click handlers
 */
function wireUpCityTabs(): void {
  const tabs = document.querySelectorAll(".city-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      const target = event.target as HTMLButtonElement;
      const cityIndex = parseInt(target.dataset.cityIndex || "0", 10);
      
      // Set the current city
      setCurrentCity(cityIndex);
      
      // Update tabs visual state
      updateCityTabsActive(cityIndex);
      
      // Update city dropdown to match
      const dropdown = document.getElementById("city-dropdown") as HTMLSelectElement;
      if (dropdown) {
        dropdown.value = String(cityIndex);
      }

      // Update POI display
      const updatePOI = getPOIDisplayUpdater();
      if (updatePOI) {
        updatePOI();
      }

      // Update location tooltip
      const city = getCurrentCity();
      const poi = getCurrentPOI();
      if (city && poi) {
        updateLocationTooltip(poi.name, city.name);
      }
    });
  });
}

/**
 * Update city tabs active state
 */
function updateCityTabsActive(activeIndex: number): void {
  const tabs = document.querySelectorAll(".city-tab");
  tabs.forEach((tab, index) => {
    tab.classList.toggle("active", index === activeIndex);
  });
}

/**
 * Create the location tooltip
 */
function createLocationTooltip(): HTMLElement {
  const container = document.createElement("div");
  container.className = "location-tooltip";
  
  // Get initial values
  const city = getCurrentCity();
  const poi = getCurrentPOI();
  
  container.innerHTML = `
    <span class="tooltip-poi" id="current-poi-name">${poi?.name || "--"}</span>
    <span class="tooltip-city" id="current-city-name">${city?.name || "--"}</span>
  `;
  return container;
}

/**
 * Update the location tooltip
 */
export function updateLocationTooltip(poiName: string, cityName: string): void {
  const poiEl = document.getElementById("current-poi-name");
  const cityEl = document.getElementById("current-city-name");

  if (poiEl) poiEl.textContent = poiName;
  if (cityEl) cityEl.textContent = cityName;
}
