/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

import { initGlobe } from "./globe.ts";
import { initShell } from "./ui/shell.ts";
import { setViewer, flyToPOIByIndex } from "./pois.ts";

/**
 * Set up keyboard event listeners for POI navigation
 * Q = POI 1, W = POI 2, E = POI 3, R = POI 4, T = POI 5
 */
function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    // Ignore if user is typing in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "q":
        flyToPOIByIndex(0);
        break;
      case "w":
        flyToPOIByIndex(1);
        break;
      case "e":
        flyToPOIByIndex(2);
        break;
      case "r":
        flyToPOIByIndex(3);
        break;
      case "t":
        flyToPOIByIndex(4);
        break;
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

    // Initialize the UI shell
    initShell(viewer);

    // Set up keyboard shortcuts for POI navigation
    setupKeyboardNavigation();

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
