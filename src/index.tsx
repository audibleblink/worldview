/**
 * WorldView - SolidJS Entry Point
 *
 * Main entry point for the SolidJS application.
 * Renders the App component which includes CesiumProvider, LayerRenderer, and UI Shell.
 */

import { render } from "solid-js/web";
import { App } from "./App";

// Mount to #app container
const container = document.getElementById("app");
if (container) {
  // Clear existing content before mounting SolidJS
  container.innerHTML = "";
  render(() => <App />, container);
} else {
  console.error("WorldView: #app container not found");
}
