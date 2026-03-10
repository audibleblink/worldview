/**
 * WorldView - Bottom Bar (SolidJS)
 * Style presets, mode switcher, city tabs, and location tooltip
 */

import { createSignal, createMemo, For, onMount } from "solid-js";
import { shaders, setShader, type ShaderMode } from "../stores/shaders";
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

// City abbreviations for tabs
const CITY_ABBREVS = ["ATX", "SFO", "NYC", "TYO", "LDN", "PAR", "DXB", "DCA"];

// View modes (null = NORMAL, otherwise shader mode)
type ViewMode = "NORMAL" | ShaderMode;
const VIEW_MODES: ViewMode[] = ["NORMAL", "crt", "nvg", "flir", "ah64"];

/**
 * Get display name for a view mode
 */
function getModeDisplayName(mode: ViewMode): string {
  if (mode === "NORMAL") return "NORMAL";
  return mode.toUpperCase();
}

/**
 * BottomBar component
 */
export function BottomBar() {
  // Current city and POI (synced with LeftPanel state)
  // In a full implementation, this would come from a shared store
  const [activeCityIndex, setActiveCityIndex] = createSignal(0);
  const [currentPOIIndex, setCurrentPOIIndex] = createSignal(0);

  // Derived state
  const currentCity = createMemo(() => cities[activeCityIndex()]);
  const currentPOI = createMemo(() => currentCity()?.pois[currentPOIIndex()]);

  // Active view mode derived from shaders store
  const activeMode = createMemo<ViewMode>(() => {
    return shaders.active ?? "NORMAL";
  });

  /** Handle mode button click */
  function handleModeClick(mode: ViewMode): void {
    if (mode === "NORMAL") {
      setShader(null);
    } else {
      setShader(mode);
    }
  }

  /** Handle city tab click */
  function handleCityClick(index: number): void {
    setActiveCityIndex(index);
    setCurrentPOIIndex(0);
    // In full implementation, this would trigger camera fly-to via store
    console.log(`[BottomBar] Selected city: ${cities[index]?.name}`);
  }

  onMount(() => {
    console.log("[BottomBar] Mounted");
  });

  return (
    <div class="bottom-bar">
      {/* Left Section - Style Presets and Mode Switcher */}
      <div class="bottom-bar-left">
        <span class="style-presets-label">STYLE PRESETS</span>
        <div class="mode-switcher">
          <For each={VIEW_MODES}>
            {(mode) => (
              <button
                class={`mode-btn ${activeMode() === mode ? "active" : ""}`}
                data-mode={mode}
                onClick={() => handleModeClick(mode)}
              >
                {getModeDisplayName(mode)}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Center Section - City Tabs */}
      <div class="bottom-bar-center">
        <For each={CITY_ABBREVS}>
          {(abbrev, index) => (
            <button
              class={`city-tab ${index() === activeCityIndex() ? "active" : ""}`}
              data-city-index={index()}
              onClick={() => handleCityClick(index())}
            >
              {abbrev}
            </button>
          )}
        </For>
      </div>

      {/* Right Section - Location Tooltip */}
      <div class="bottom-bar-right">
        <div class="location-tooltip">
          <span class="tooltip-poi" id="current-poi-name">
            {currentPOI()?.name ?? "--"}
          </span>
          <span class="tooltip-city" id="current-city-name">
            {currentCity()?.name ?? "--"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BottomBar;
