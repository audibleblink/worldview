/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

import { initGlobe } from "./globe.ts";
import { initShell } from "./ui/shell.ts";

export function init(): void {
  const container = document.getElementById("cesium-container");
  if (!container) {
    console.error("Cesium container not found");
    return;
  }

  // Initialize the 3D globe
  const viewer = initGlobe(container);

  // Initialize the UI shell
  initShell(viewer);

  console.log("WorldView initialized");
}

// Auto-initialize when DOM is ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
