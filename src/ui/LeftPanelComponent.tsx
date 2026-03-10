/**
 * WorldView - Left Panel (SolidJS)
 * City selector, POI navigation, and layer toggles
 */

import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { layers, toggleLayer, type LayerId } from "../stores/layers";
import { getAllLayers } from "../layers/registry";
import { groundState, toggleSubLayer, setTrafficStyle } from "../layers/ground/store";
import type { GroundSubLayer, StyleMode } from "../layers/ground/types";
import { satelliteState, toggleCategory } from "../layers/satellites/store";
import type { SatelliteCategory } from "../layers/satellites/types";
import poisData from "../data/pois.json";
import { useCesium } from "../cesium/useCesium";

declare const Cesium: typeof import("cesium");

// Types for POI data
interface POI {
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  pitch: number;
}

interface City {
  name: string;
  pois: POI[];
}

// Load cities from JSON
const cities = poisData as City[];

// Layer display configuration
interface LayerConfig {
  id: LayerId;
  name: string;
}

// Static layer configuration for display
const LAYER_CONFIGS: LayerConfig[] = [
  { id: "satellites", name: "SATELLITES" },
  { id: "flights", name: "FLIGHTS" },
  { id: "ships", name: "SHIPS" },
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

// Log entry types
type LogType = "info" | "error" | "success";

interface LogEntry {
  id: number;
  message: string;
  type: LogType;
}

// Log entry counter for unique IDs
let logIdCounter = 0;

/**
 * LeftPanel component
 */
export function LeftPanel() {
  const { viewer } = useCesium();

  // Navigation state
  const [currentCityIndex, setCurrentCityIndex] = createSignal(0);
  const [currentPOIIndex, setCurrentPOIIndex] = createSignal(0);

  // System log entries
  const [logEntries, setLogEntries] = createSignal<LogEntry[]>([
    { id: logIdCounter++, message: "[INIT] System ready", type: "success" },
    { id: logIdCounter++, message: "[INFO] Google 3D Tiles active", type: "info" },
  ]);

  // Derived state
  const currentCity = createMemo(() => cities[currentCityIndex()]);
  const currentPOI = createMemo(() => currentCity()?.pois[currentPOIIndex()]);
  const poiCount = createMemo(() => currentCity()?.pois.length ?? 0);

  // Navigation helpers
  const canGoPrev = createMemo(() => currentPOIIndex() > 0);
  const canGoNext = createMemo(() => currentPOIIndex() < poiCount() - 1);

  /** Add a log entry */
  function addLogEntry(message: string, type: LogType = "info"): void {
    const entry: LogEntry = { id: logIdCounter++, message, type };
    setLogEntries((prev) => {
      const updated = [entry, ...prev];
      // Keep only last 20 entries
      return updated.slice(0, 20);
    });
  }

  /** Fly the camera to a POI */
  function flyToPOI(poi: POI): void {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Offset latitude slightly to compensate for oblique camera angle
    const pitch = poi.pitch ?? -45;
    const pitchRad = Math.abs(pitch) * (Math.PI / 180);
    const latOffset = (poi.altitude / 111000) * Math.tan(pitchRad);

    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        poi.lng,
        poi.lat - latOffset,
        poi.altitude
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0,
      },
      duration: 2,
    });
  }

  /** Handle city selection change */
  function handleCityChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value, 10);
    setCurrentCityIndex(index);
    setCurrentPOIIndex(0);
    addLogEntry(`[NAV] Flying to ${cities[index]?.name}`);

    // Fly to first POI of selected city
    const firstPOI = cities[index]?.pois[0];
    if (firstPOI) {
      flyToPOI(firstPOI);
    }
  }

  /** Navigate to previous POI */
  function handlePrevPOI(): void {
    if (canGoPrev()) {
      const newIndex = currentPOIIndex() - 1;
      setCurrentPOIIndex(newIndex);
      const poi = currentCity()?.pois[newIndex];
      if (poi) {
        addLogEntry(`[NAV] POI: ${poi.name}`);
        flyToPOI(poi);
      }
    }
  }

  /** Navigate to next POI */
  function handleNextPOI(): void {
    if (canGoNext()) {
      const newIndex = currentPOIIndex() + 1;
      setCurrentPOIIndex(newIndex);
      const poi = currentCity()?.pois[newIndex];
      if (poi) {
        addLogEntry(`[NAV] POI: ${poi.name}`);
        flyToPOI(poi);
      }
    }
  }

  /** Toggle a layer */
  function handleToggleLayer(id: LayerId): void {
    toggleLayer(id);
    const isEnabled = !layers[id]; // State will toggle, so check inverse
    addLogEntry(`[${id.toUpperCase()}] Layer ${isEnabled ? "disabled" : "enabled"}`);
  }

  /** Toggle a satellite category */
  function handleToggleCategory(category: SatelliteCategory): void {
    const wasVisible = !satelliteState.hiddenCategories.has(category);
    toggleCategory(category);
    addLogEntry(`[SAT] ${category.toUpperCase()} ${wasVisible ? "OFF" : "ON"}`);
  }

  /** Toggle a ground sub-layer */
  function handleToggleSubLayer(subLayer: GroundSubLayer): void {
    toggleSubLayer(subLayer);
    const stateKey = `${subLayer}Enabled` as keyof typeof groundState;
    const isEnabled = !groundState[stateKey]; // State will toggle
    addLogEntry(`[GROUND] ${subLayer.toUpperCase()} ${isEnabled ? "OFF" : "ON"}`);
  }

  /** Cycle traffic style mode */
  function handleCycleTrafficStyle(): void {
    const nextStyle: StyleMode = groundState.trafficStyle === "heatmap" ? "terminal" : "heatmap";
    setTrafficStyle(nextStyle);
    addLogEntry(`[GROUND] Style: ${nextStyle.toUpperCase()}`);
  }

  onMount(() => {
    console.log("[LeftPanel] Mounted");

    // Fly to initial POI after a short delay (viewer may not be ready immediately)
    setTimeout(() => {
      const poi = currentPOI();
      if (poi) {
        flyToPOI(poi);
      }
    }, 2000);
  });

  return (
    <div class="left-panel">
      {/* City Selector */}
      <div class="city-selector panel-section">
        <label>LOCATION</label>
        <select id="city-dropdown" value={currentCityIndex()} onChange={handleCityChange}>
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
          onClick={handlePrevPOI}
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
          onClick={handleNextPOI}
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
