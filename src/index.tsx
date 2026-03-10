/**
 * WorldView - SolidJS Entry Point
 *
 * Main entry point wrapping the app in CesiumProvider.
 * The globe renders via the provider, with all Cesium hooks available to children.
 */

import { render } from "solid-js/web";
import { CesiumProvider } from "./cesium/CesiumProvider";
import { LayerRenderer } from "./layers/LayerRenderer";

// Import layer registrations - these must be imported to register layers
import "./layers/satellites";
import "./layers/flights";
import "./layers/ships";
import "./layers/ground";

/**
 * App component - wrapped in CesiumProvider for Cesium access
 *
 * The CesiumProvider:
 * - Creates the Cesium Viewer
 * - Loads Google 3D Tiles
 * - Provides context for useCesium, usePreRender, useCamera, etc.
 *
 * The LayerRenderer:
 * - Reads the layers store for visibility
 * - Renders enabled layer components
 * - Handles mount/unmount when layers toggle
 */
function App() {
  return (
    <CesiumProvider
      options={{
        msaaSamples: 4,
        maximumScreenSpaceError: 16,
      }}
    >
      {/* Layer components render to Cesium, not DOM */}
      <LayerRenderer />
      {/* Future phases will add UI Shell here */}
    </CesiumProvider>
  );
}

// Mount to #app container
const container = document.getElementById("app");
if (container) {
  // Clear existing content before mounting SolidJS
  container.innerHTML = "";
  render(() => <App />, container);
} else {
  console.error("WorldView: #app container not found");
}
