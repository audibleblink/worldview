/**
 * WorldView - Left Panel (SolidJS)
 * City selector, POI navigation, and layer toggles
 */

import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { layers, toggleLayer, type LayerId } from "../stores/layers";
import { getAllLayers } from "../layers/registry";
import poisData from "../data/pois.json";

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

  /** Handle city selection change */
  function handleCityChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value, 10);
    setCurrentCityIndex(index);
    setCurrentPOIIndex(0);
    addLogEntry(`[NAV] Flying to ${cities[index]?.name}`);
  }

  /** Navigate to previous POI */
  function handlePrevPOI(): void {
    if (canGoPrev()) {
      setCurrentPOIIndex((i) => i - 1);
      addLogEntry(`[NAV] POI: ${currentCity()?.pois[currentPOIIndex() - 1]?.name}`);
    }
  }

  /** Navigate to next POI */
  function handleNextPOI(): void {
    if (canGoNext()) {
      setCurrentPOIIndex((i) => i + 1);
      addLogEntry(`[NAV] POI: ${currentCity()?.pois[currentPOIIndex() + 1]?.name}`);
    }
  }

  /** Toggle a layer */
  function handleToggleLayer(id: LayerId): void {
    toggleLayer(id);
    const isEnabled = !layers[id]; // State will toggle, so check inverse
    addLogEntry(`[${id.toUpperCase()}] Layer ${isEnabled ? "disabled" : "enabled"}`);
  }

  onMount(() => {
    console.log("[LeftPanel] Mounted");
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
            <div class="toggle-row">
              <span>{config.name}</span>
              <button
                class={`toggle-btn ${layers[config.id] ? "on" : ""}`}
                onClick={() => handleToggleLayer(config.id)}
              >
                {layers[config.id] ? "ON" : "OFF"}
              </button>
            </div>
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
