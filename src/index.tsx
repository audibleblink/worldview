/**
 * WorldView - SolidJS Entry Point
 *
 * Main entry point wrapping the app in CesiumProvider.
 * The globe renders via the provider, with all Cesium hooks available to children.
 */

import { render } from "solid-js/web";
import { CesiumProvider } from "./cesium/CesiumProvider";

/**
 * App component - wrapped in CesiumProvider for Cesium access
 *
 * The CesiumProvider:
 * - Creates the Cesium Viewer
 * - Loads Google 3D Tiles
 * - Provides context for useCesium, usePreRender, useCamera, etc.
 */
function App() {
  return (
    <CesiumProvider
      options={{
        msaaSamples: 4,
        maximumScreenSpaceError: 16,
      }}
    >
      {/* Globe renders via CesiumProvider */}
      {/* Future phases will add LayerRenderer, UI Shell, etc. here */}
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
