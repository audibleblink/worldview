/**
 * WorldView - Left Panel (SolidJS)
 * City selector, POI navigation, and layer toggles
 */

import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { layers, toggleLayer, type LayerId } from "../stores/layers";
import { groundState, toggleSubLayer, setTrafficStyle } from "../layers/ground/store";
import type { GroundSubLayer, StyleMode } from "../layers/ground/types";
import { satelliteState, toggleCategory } from "../layers/satellites/store";
import type { SatelliteCategory } from "../layers/satellites/types";
import { ui, setCurrentCityIndex, setCurrentPOIIndex } from "../stores/ui";
import { useCesium } from "../cesium/useCesium";
import { getUserLocation } from "../cesium/getUserLocation";
import { CCTVCameraListPanel } from "./panels/CCTVCameraListPanel";
import { cities, flyToPOI } from "./navigation";

// Layer display configuration
interface LayerConfig {
  id: LayerId;
  name: string;
}

// Static layer configuration for display
const LAYER_CONFIGS: LayerConfig[] = [
  { id: "satellites", name: "SATELLITES" },
  { id: "ships", name: "SHIPS" },
  { id: "planes", name: "PLANES" },
  { id: "ground", name: "GROUND" },
];

interface CategoryConfig {
  id: SatelliteCategory;
  name: string;
}

const SATELLITE_CATEGORIES: CategoryConfig[] = [
  { id: "stations", name: "STATIONS" },
  { id: "military", name: "MILITARY" },
  { id: "gnss", name: "GNSS" },
  { id: "research", name: "RESEARCH" },
  { id: "starlink", name: "STARLINK" },
];

type LogType = "info" | "error" | "success";

interface LogEntry {
  id: number;
  message: string;
  type: LogType;
}

let logIdCounter = 0;

/**
 * LeftPanel component
 */
export function LeftPanel() {
  const { viewer } = useCesium();

  // System log entries
  const [logEntries, setLogEntries] = createSignal<LogEntry[]>([
    { id: logIdCounter++, message: "[INIT] System ready", type: "success" },
    { id: logIdCounter++, message: "[INFO] Google 3D Tiles active", type: "info" },
  ]);

  // Derived state from shared store
  const currentCity = createMemo(() => cities[ui.currentCityIndex]);
  const currentPOI = createMemo(() => currentCity()?.pois[ui.currentPOIIndex]);
  const poiCount = createMemo(() => currentCity()?.pois.length ?? 0);

  // Navigation helpers
  const canGoPrev = createMemo(() => ui.currentPOIIndex > 0);
  const canGoNext = createMemo(() => ui.currentPOIIndex < poiCount() - 1);

  function addLogEntry(message: string, type: LogType = "info"): void {
    setLogEntries((prev) => [{ id: logIdCounter++, message, type }, ...prev].slice(0, 20));
  }

  function handleCityChange(e: Event): void {
    const index = parseInt((e.target as HTMLSelectElement).value, 10);
    setCurrentCityIndex(index);
    setCurrentPOIIndex(0);
    addLogEntry(`[NAV] Flying to ${cities[index]?.name}`);
    const firstPOI = cities[index]?.pois[0];
    if (firstPOI) flyToPOI(viewer(), firstPOI);
  }

  function navigatePOI(delta: -1 | 1): void {
    const newIndex = ui.currentPOIIndex + delta;
    if (newIndex < 0 || newIndex >= poiCount()) return;
    setCurrentPOIIndex(newIndex);
    const poi = currentCity()?.pois[newIndex];
    if (poi) {
      addLogEntry(`[NAV] POI: ${poi.name}`);
      flyToPOI(viewer(), poi);
    }
  }

  function handleToggleLayer(id: LayerId): void {
    const wasEnabled = layers[id];
    toggleLayer(id);
    addLogEntry(`[${id.toUpperCase()}] Layer ${wasEnabled ? "disabled" : "enabled"}`);
  }

  function handleToggleCategory(category: SatelliteCategory): void {
    const wasVisible = !satelliteState.hiddenCategories.has(category);
    toggleCategory(category);
    addLogEntry(`[SAT] ${category.toUpperCase()} ${wasVisible ? "OFF" : "ON"}`);
  }

  function handleToggleSubLayer(subLayer: GroundSubLayer): void {
    const stateKey = `${subLayer}Enabled` as keyof typeof groundState;
    const wasEnabled = groundState[stateKey];
    toggleSubLayer(subLayer);
    addLogEntry(`[GROUND] ${subLayer.toUpperCase()} ${wasEnabled ? "OFF" : "ON"}`);
  }

  function handleCycleTrafficStyle(): void {
    const nextStyle: StyleMode = groundState.trafficStyle === "heatmap" ? "terminal" : "heatmap";
    setTrafficStyle(nextStyle);
    addLogEntry(`[GROUND] Style: ${nextStyle.toUpperCase()}`);
  }

  onMount(() => {
    // Start geolocation request immediately (runs in parallel with viewer-ready delay)
    const locationPromise = getUserLocation();

    // Fly to user's location or fall back to initial POI
    setTimeout(async () => {
      const userLocation = await locationPromise;
      if (userLocation) {
        flyToPOI(viewer(), {
          name: "User Location",
          lat: userLocation.lat,
          lng: userLocation.lng,
          altitude: 500,
          pitch: -45,
        });
      } else {
        const poi = currentPOI();
        if (poi) flyToPOI(viewer(), poi);
      }
    }, 2000);
  });

  return (
    <div class="left-panel">
      {/* City Selector */}
      <div class="city-selector panel-section">
        <label>LOCATION</label>
        <select id="city-dropdown" value={ui.currentCityIndex} onChange={handleCityChange}>
          <For each={cities}>
            {(city, index) => (
              <option value={index()}>{city.name}</option>
            )}
          </For>
        </select>
      </div>

      {/* POI Navigation */}
      <div class="poi-navigation panel-section">
        <button 
          class="nav-btn" 
          id="prev-poi" 
          disabled={!canGoPrev()}
          onClick={() => navigatePOI(-1)}
        >
          PREV
        </button>
        <span class="poi-display" id="poi-display">
          {currentPOI()?.name ?? "No POI"}
        </span>
        <button 
          class="nav-btn" 
          id="next-poi" 
          disabled={!canGoNext()}
          onClick={() => navigatePOI(1)}
        >
          NEXT
        </button>
      </div>

      {/* Layer Toggles */}
      <div class="toggles panel-section">
        <For each={LAYER_CONFIGS}>
          {(config) => (
            <>
              <div class="toggle-row">
                <span>{config.name}</span>
                <button
                  class={`toggle-btn ${layers[config.id] ? "on" : ""}`}
                  onClick={() => handleToggleLayer(config.id)}
                >
                  {layers[config.id] ? "ON" : "OFF"}
                </button>
              </div>
              
              {/* Satellite category toggles */}
              <Show when={config.id === "satellites" && layers.satellites}>
                <div class="ground-options-row">
                  <For each={SATELLITE_CATEGORIES}>
                    {(cat) => (
                      <div class="sub-toggle-row">
                        <button
                          class={`toggle-btn sub-toggle ${!satelliteState.hiddenCategories.has(cat.id) ? "on" : ""}`}
                          onClick={() => handleToggleCategory(cat.id)}
                        >
                          {cat.name}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              {/* Ground sub-layer toggles */}
              <Show when={config.id === "ground" && layers.ground}>
                <div class="ground-options-row">
                  <div class="sub-toggle-row">
                    <button
                      class={`toggle-btn sub-toggle ${groundState.trafficEnabled ? "on" : ""}`}
                      onClick={() => handleToggleSubLayer("traffic")}
                    >
                      TRAFFIC
                    </button>
                    <button
                      class={`toggle-btn style-toggle ${groundState.trafficEnabled ? "" : "disabled"}`}
                      onClick={handleCycleTrafficStyle}
                      disabled={!groundState.trafficEnabled}
                    >
                      {groundState.trafficStyle.toUpperCase()}
                    </button>
                  </div>
                  <div class="sub-toggle-row">
                    <button
                      class={`toggle-btn sub-toggle ${groundState.cctvEnabled ? "on" : ""}`}
                      onClick={() => handleToggleSubLayer("cctv")}
                    >
                      CCTV
                    </button>
                    <button
                      class={`toggle-btn sub-toggle ${groundState.seismicEnabled ? "on" : ""}`}
                      onClick={() => handleToggleSubLayer("seismic")}
                    >
                      SEISMIC
                    </button>
                  </div>
                </div>
              </Show>
            </>
          )}
        </For>

        {/* Disabled placeholder toggles */}
        <div class="toggle-row">
          <span>AUTO HOF SPY</span>
          <button class="toggle-btn" disabled>OFF</button>
        </div>
        <div class="toggle-row">
          <span>PROJECTION</span>
          <button class="toggle-btn" disabled>IN</button>
        </div>
      </div>

      {/* Action Buttons */}
      <div class="action-buttons panel-section">
        <button class="action-btn" disabled>AUTO CAL</button>
        <button class="action-btn" disabled>ALIGN - DRAPE</button>
      </div>

      {/* CCTV Camera List - always visible */}
      <CCTVCameraListPanel />

      {/* System Log */}
      <div class="system-log">
        <div class="log-header">SYSTEM LOG</div>
        <div class="log-content" id="system-log-content">
          <For each={logEntries()}>
            {(entry) => (
              <div class={`log-entry ${entry.type}`}>{entry.message}</div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default LeftPanel;
