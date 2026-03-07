/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");
import { initGlobe } from "./globe.ts";
import { initShell, updateSatelliteCount, updateFlightCount, addEscapeHandler } from "./ui/shell.ts";
import { setViewer, flyToPOIByIndex } from "./pois.ts";
import { shaderManager } from "./shaders/index.ts";
import { SatelliteLayer, loadAllTLEs } from "./layers/satellites.ts";
import { FlightLayer, fetchAircraftMeta } from "./layers/flights.ts";
import { showSatelliteInfoPanel, hideSatelliteInfoPanel, resetFollowButton } from "./ui/sat-info-panel.ts";
import { showFlightInfoPanel, hideFlightInfoPanel, resetFlightFollowButton } from "./ui/flight-info-panel.ts";

// POI navigation key mappings: q→0, w→1, e→2, r→3, t→4
const POI_KEY_MAP: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4 };

function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    const el = document.activeElement;
    const tag = el?.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement)?.isContentEditable) return;
    
    const poiIndex = POI_KEY_MAP[event.key.toLowerCase()];
    if (poiIndex !== undefined) flyToPOIByIndex(poiIndex);
  });
}

export async function init(): Promise<void> {
  const container = document.getElementById("cesium-container");
  if (!container) {
    console.error("Cesium container not found");
    return;
  }

  try {
    const viewer = await initGlobe(container);
    setViewer(viewer);

    const satelliteLayer = new SatelliteLayer(viewer, updateSatelliteCount);
    const flightLayer = new FlightLayer(viewer, updateFlightCount);

    // When a category filter hides the selected satellite, close the panel
    satelliteLayer.setExternalDeselectCallback(() => {
      hideSatelliteInfoPanel();
      resetFollowButton();
    });

    // When a flight is deselected externally, close the flight panel
    flightLayer.setExternalDeselectCallback(() => {
      hideFlightInfoPanel();
    });

    initShell(viewer, { satelliteLayer, loadAllTLEs, flightLayer });

    // Escape stops follow mode for both satellites and flights
    addEscapeHandler(() => {
      satelliteLayer.stopFollow();
      resetFollowButton();
      flightLayer.stopFollow();
      resetFlightFollowButton();
    });

    setupKeyboardNavigation();

    shaderManager.init(viewer);
    (window as Window & { shaderManager?: typeof shaderManager }).shaderManager = shaderManager;

    // Click-to-select: billboard id is set to noradId/icao24 string at creation time
    viewer.screenSpaceEventHandler.setInputAction((click: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick((click as any).position);

      if (picked && typeof picked.id === "string") {
        // Check if it's a flight (FlightLayer tracks its own icao24 set)
        if (flightLayer.hasIcao(picked.id)) {
          flightLayer.selectFlight(picked.id, async (record) => {
            const meta = await fetchAircraftMeta(picked.id);
            showFlightInfoPanel(record, meta, flightLayer);
          });
          return;
        }

        // Otherwise handle as satellite
        satelliteLayer.selectSatellite(picked.id, (record, velocity) => {
          showSatelliteInfoPanel(record, velocity, satelliteLayer);
        });
        return;
      }

      // Clicked empty space — deselect both
      satelliteLayer.deselectSatellite(hideSatelliteInfoPanel);
      flightLayer.deselectFlight(hideFlightInfoPanel);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    console.log("WorldView initialized");
  } catch (error) {
    console.error("Failed to initialize WorldView:", error);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
