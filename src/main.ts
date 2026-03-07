/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

import { initGlobe } from "./globe.ts";
import { initShell } from "./ui/shell.ts";

export async function init(): Promise<void> {
  const container = document.getElementById("cesium-container");
  if (!container) {
    console.error("Cesium container not found");
    return;
  }

  try {
    // Initialize the 3D globe (async for loading 3D tiles)
    const viewer = await initGlobe(container);

    // Initialize the UI shell
    initShell(viewer);

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
