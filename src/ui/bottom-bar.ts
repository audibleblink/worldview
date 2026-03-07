/**
 * WorldView - Bottom Bar
 * Style presets, mode switcher, city tabs, and location tooltip
 */

import type { Viewer } from "cesium";

export type ViewMode = "NORMAL" | "CRT" | "NVG" | "FLIR" | "ANIME" | "NAVI";

let currentMode: ViewMode = "NORMAL";

/**
 * Initialize the bottom bar
 */
export function initBottomBar(_viewer: Viewer): void {
  console.log("Bottom bar initialized (stub)");
}

/**
 * Create the style presets section
 */
export function createStylePresets(): HTMLElement {
  const container = document.createElement("div");
  container.className = "style-presets";
  container.innerHTML = `
    <span class="presets-label">STYLE PRESETS</span>
  `;
  return container;
}

/**
 * Create the mode switcher buttons
 */
export function createModeSwitcher(): HTMLElement {
  const container = document.createElement("div");
  container.className = "mode-switcher";

  const modes: ViewMode[] = ["NORMAL", "CRT", "NVG", "FLIR", "ANIME", "NAVI"];

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.className = `mode-btn ${mode === currentMode ? "active" : ""}`;
    button.textContent = mode;
    button.dataset.mode = mode;
    button.addEventListener("click", () => setMode(mode));
    container.appendChild(button);
  });

  return container;
}

/**
 * Set the active view mode
 */
export function setMode(mode: ViewMode): void {
  currentMode = mode;

  // Update button states
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.textContent === mode);
  });

  console.log(`Mode changed to: ${mode}`);
}

/**
 * Get the current view mode
 */
export function getMode(): ViewMode {
  return currentMode;
}

/**
 * Create the city quick-jump tabs
 */
export function createCityTabs(): HTMLElement {
  const container = document.createElement("div");
  container.className = "city-tabs";

  // Placeholder cities - will be populated from pois.ts in Phase 4
  const cities = ["ATX", "SFO", "NYC", "TYO", "LDN", "PAR", "DXB", "DCA"];

  cities.forEach((city) => {
    const tab = document.createElement("button");
    tab.className = "city-tab";
    tab.textContent = city;
    tab.disabled = true; // Disabled until Phase 4
    container.appendChild(tab);
  });

  return container;
}

/**
 * Create the location tooltip
 */
export function createLocationTooltip(): HTMLElement {
  const container = document.createElement("div");
  container.className = "location-tooltip";
  container.innerHTML = `
    <span class="tooltip-poi" id="current-poi-name">--</span>
    <span class="tooltip-city" id="current-city-name">--</span>
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
