/**
 * WorldView - Bottom Bar (SolidJS)
 * Style presets, mode switcher, city tabs, and location tooltip
 */

import { createMemo, For } from "solid-js";
import { shaders, setShader, type ShaderMode } from "../stores/shaders";
import { ui, setCurrentCityIndex, setCurrentPOIIndex, setMyLocationActive } from "../stores/ui";
import { useCesium } from "../cesium/useCesium";
import { getUserLocation } from "../cesium/getUserLocation";
import { cities, CITY_ABBREVS, flyToPOI } from "./navigation";

type ViewMode = "NORMAL" | ShaderMode;
const VIEW_MODES: ViewMode[] = ["NORMAL", "crt", "nvg", "flir", "ah64"];

export function BottomBar() {
  const { viewer } = useCesium();

  const currentCity = createMemo(() => cities[ui.currentCityIndex]);
  const currentPOI = createMemo(() => currentCity()?.pois[ui.currentPOIIndex]);
  const activeMode = createMemo<ViewMode>(() => shaders.active ?? "NORMAL");

  function handleModeClick(mode: ViewMode): void {
    setShader(mode === "NORMAL" ? null : mode);
  }

  function handleCityClick(index: number): void {
    setCurrentCityIndex(index);
    setCurrentPOIIndex(0);
    setMyLocationActive(false);
    const firstPOI = cities[index]?.pois[0];
    if (firstPOI) flyToPOI(viewer(), firstPOI);
  }

  async function handleMyLocationClick(): Promise<void> {
    const location = await getUserLocation();
    if (!location) return;
    setMyLocationActive(true);
    setCurrentCityIndex(-1);
    flyToPOI(viewer(), {
      name: "My Location",
      lat: location.lat,
      lng: location.lng,
      altitude: 500,
      pitch: -45,
    });
  }

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
                {mode === "NORMAL" ? "NORMAL" : mode.toUpperCase()}
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
              class={`city-tab ${index() === ui.currentCityIndex ? "active" : ""}`}
              data-city-index={index()}
              onClick={() => handleCityClick(index())}
            >
              {abbrev}
            </button>
          )}
        </For>
        <button
          class={`city-tab ${ui.myLocationActive ? "active" : ""}`}
          onClick={handleMyLocationClick}
        >
          MY LOC
        </button>
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
