import { CesiumProvider } from "./cesium/CesiumProvider";
import { LayerRenderer } from "./layers/LayerRenderer";
import { ShaderSystem } from "./shaders/ShaderSystem";
import { Shell } from "./ui/ShellComponent";

// Side-effect imports: register layer definitions
import "./layers/satellites";
import "./layers/ships";
import "./layers/ground";
import "./layers/planes";

export function App() {
  return (
    <CesiumProvider
      options={{
        msaaSamples: 4,
        maximumScreenSpaceError: 16,
      }}
    >
      <ShaderSystem />
      <LayerRenderer />
      <Shell />
    </CesiumProvider>
  );
}
