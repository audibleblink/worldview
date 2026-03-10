/**
 * WorldView - App Component (SolidJS)
 *
 * Root application component that composes:
 * - CesiumProvider: Manages Cesium viewer lifecycle
 * - Shell: UI shell with top bar, panels, and overlays
 * - LayerRenderer: Renders enabled visualization layers
 */

import { CesiumProvider } from "./cesium/CesiumProvider";
import { LayerRenderer } from "./layers/LayerRenderer";
import { ShaderSystem } from "./shaders/ShaderSystem";
import { Shell } from "./ui/ShellComponent";

// Import layer registrations - these must be imported to register layers
import "./layers/satellites";
import "./layers/flights";
import "./layers/ships";
import "./layers/ground";

/**
 * App component - Root of the application
 *
 * Structure:
 * - CesiumProvider wraps everything to provide Cesium context
 * - LayerRenderer renders visualization layers (satellites, flights, ships, ground)
 * - Shell provides the UI (top bar, panels, bottom bar)
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
 *
 * The Shell:
 * - Top bar with clock, telemetry, mode indicator
 * - Left panel with city selector, POI nav, layer toggles
 * - Right panel with shader controls, live readouts
 * - Bottom bar with mode switcher, city tabs
 */
export function App() {
  return (
    <CesiumProvider
      options={{
        msaaSamples: 4,
        maximumScreenSpaceError: 16,
      }}
    >
      {/* Shader post-processing system - connects store to Cesium PostProcessStages */}
      <ShaderSystem />

      {/* Layer components render to Cesium, not DOM */}
      <LayerRenderer />
      
      {/* UI Shell renders all panels and overlays */}
      <Shell />
    </CesiumProvider>
  );
}

export default App;
