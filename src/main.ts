/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

import * as Cesium from "cesium";
import { initGlobe } from "./globe.ts";
import { initShell, updateSatelliteCount, setEscapeHandler } from "./ui/shell.ts";
import { setViewer, flyToPOIByIndex } from "./pois.ts";
import { shaderManager } from "./shaders/index.ts";
import { SatelliteLayer, loadAllTLEs } from "./layers/satellites.ts";
import { showSatelliteInfoPanel, hideSatelliteInfoPanel, resetFollowButton } from "./ui/sat-info-panel.ts";

// POI navigation key mappings: q→0, w→1, e→2, r→3, t→4
const POI_KEY_MAP: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4 };

function isTypingInFormElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isTypingInFormElement(event.target)) return;
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

    // When a category filter hides the selected satellite, close the panel
    satelliteLayer.setExternalDeselectCallback(() => {
      hideSatelliteInfoPanel();
      resetFollowButton();
    });

    initShell(viewer, { satelliteLayer, loadAllTLEs });

    // Escape stops follow mode
    setEscapeHandler(() => {
      satelliteLayer.stopFollow();
      resetFollowButton();
    });

    setupKeyboardNavigation();

    shaderManager.init(viewer);
    (window as Window & { shaderManager?: typeof shaderManager }).shaderManager = shaderManager;

    // Click-to-select: billboard id is set to noradId string at creation time
    viewer.screenSpaceEventHandler.setInputAction((click: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick((click as any).position);

      if (picked && typeof picked.id === "string") {
        satelliteLayer.selectSatellite(picked.id, (record, velocity) => {
          showSatelliteInfoPanel(record, velocity, satelliteLayer);
        });
        return;
      }

      // Clicked empty space — deselect
      satelliteLayer.deselectSatellite(() => hideSatelliteInfoPanel());
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
