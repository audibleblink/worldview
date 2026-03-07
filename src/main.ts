/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

import { initGlobe } from "./globe.ts";
import { initShell, updateSatelliteCount } from "./ui/shell.ts";
import { setViewer, flyToPOIByIndex } from "./pois.ts";
import { shaderManager } from "./shaders/index.ts";
import { SatelliteLayer, loadAllTLEs } from "./layers/satellites.ts";

/**
 * Check if the user is currently interacting with a form element
 */
function isUserTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

// POI navigation key mappings: key -> POI index
const POI_KEY_MAP: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4 };

/**
 * Set up keyboard event listeners for POI navigation
 * Q = POI 1, W = POI 2, E = POI 3, R = POI 4, T = POI 5
 */
function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isUserTyping(event.target)) return;

    const poiIndex = POI_KEY_MAP[event.key.toLowerCase()];
    if (poiIndex !== undefined) {
      flyToPOIByIndex(poiIndex);
    }
  });
}

export async function init(): Promise<void> {
  const container = document.getElementById("cesium-container");
  if (!container) {
    console.error("Cesium container not found");
    return;
  }

  try {
    // Initialize the 3D globe (async for loading 3D tiles)
    const viewer = await initGlobe(container);

    // Set the viewer reference for POI navigation
    setViewer(viewer);

    // Create satellite layer (browser-side, needs viewer)
    const satelliteLayer = new SatelliteLayer(viewer, updateSatelliteCount);

    // Initialize the UI shell
    initShell(viewer, { satelliteLayer, loadAllTLEs });

    // Set up keyboard shortcuts for POI navigation
    setupKeyboardNavigation();

    // Initialize shader manager
    shaderManager.init(viewer);

    // Expose shaderManager for testing
    (window as Window & { shaderManager?: typeof shaderManager }).shaderManager = shaderManager;

    console.log("WorldView initialized");
  } catch (error) {
    console.error("Failed to initialize WorldView:", error);
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
