/**
 * WorldView - Phase 2 Verification Script
 * Tests all stores independently of UI or Cesium
 */

// Test layers store
import { layers, toggleLayer, setLayerEnabled } from "../src/stores/layers";

console.log("=== Layers Store Test ===");
console.log("Initial state:", JSON.stringify(layers));

toggleLayer("satellites");
console.log("After toggleLayer(satellites):", JSON.stringify(layers));
if (layers.satellites !== false) throw new Error("toggleLayer failed");

setLayerEnabled("satellites", true);
console.log("After setLayerEnabled(satellites, true):", JSON.stringify(layers));
if (layers.satellites !== true) throw new Error("setLayerEnabled failed");

console.log("Layers store: PASS\n");

// Test selection store
import {
  selection,
  selectEntity,
  clearSelection,
  setSelectionData,
} from "../src/stores/selection";

console.log("=== Selection Store Test ===");
console.log("Initial state:", JSON.stringify(selection));

selectEntity("satellite", "25544", {
  noradId: "25544",
  name: "ISS",
  category: "stations",
  position: { lat: 0, lng: 0, alt: 400000 },
});
console.log("After selectEntity(satellite, 25544):", JSON.stringify(selection));
if (selection.type !== "satellite" || selection.id !== "25544") {
  throw new Error("selectEntity failed");
}

selectEntity("flight", "ABC123");
console.log("After selectEntity(flight, ABC123):", JSON.stringify(selection));

setSelectionData({
  icao24: "abc123",
  callsign: "UAL123",
  originCountry: "USA",
  position: { lat: 40, lng: -74, alt: 10000 },
  velocity: 250,
  heading: 90,
  verticalRate: 0,
  onGround: false,
});
console.log("After setSelectionData:", JSON.stringify(selection));
if ((selection.data as any)?.callsign !== "UAL123") {
  throw new Error("setSelectionData failed");
}

clearSelection();
console.log("After clearSelection:", JSON.stringify(selection));
if (selection.type !== null || selection.id !== null) {
  throw new Error("clearSelection failed");
}

console.log("Selection store: PASS\n");

// Test camera store
import {
  camera,
  setFollowTarget,
  setFreeCamera,
  setOrbitTarget,
  updateCameraPosition,
} from "../src/stores/camera";

console.log("=== Camera Store Test ===");
console.log("Initial state:", JSON.stringify(camera));

setFollowTarget("satellite", "25544");
console.log(
  "After setFollowTarget(satellite, 25544):",
  JSON.stringify(camera)
);
if (camera.mode !== "follow" || camera.target?.id !== "25544") {
  throw new Error("setFollowTarget failed");
}

setOrbitTarget("flight", "ABC123");
console.log("After setOrbitTarget(flight, ABC123):", JSON.stringify(camera));
if (camera.mode !== "orbit") throw new Error("setOrbitTarget failed");

updateCameraPosition({
  longitude: -97.7,
  latitude: 30.2,
  height: 1000,
  heading: 0,
  pitch: -45,
  roll: 0,
});
console.log("After updateCameraPosition:", JSON.stringify(camera));
if (camera.position?.latitude !== 30.2) {
  throw new Error("updateCameraPosition failed");
}

setFreeCamera();
console.log("After setFreeCamera:", JSON.stringify(camera));
if (camera.mode !== "free" || camera.target !== null) {
  throw new Error("setFreeCamera failed");
}

console.log("Camera store: PASS\n");

// Test UI store
import {
  ui,
  toggleLeftPanel,
  toggleRightPanel,
  setCommandMode,
  setCurrentCity,
} from "../src/stores/ui";

console.log("=== UI Store Test ===");
console.log("Initial state:", JSON.stringify(ui));

toggleLeftPanel();
console.log("After toggleLeftPanel:", JSON.stringify(ui));
if (ui.leftPanelOpen !== false) throw new Error("toggleLeftPanel failed");

toggleRightPanel();
console.log("After toggleRightPanel:", JSON.stringify(ui));
if (ui.rightPanelOpen !== false) throw new Error("toggleRightPanel failed");

setCommandMode(true);
console.log("After setCommandMode(true):", JSON.stringify(ui));
if (ui.commandMode !== true) throw new Error("setCommandMode failed");

setCurrentCity({
  name: "Austin, TX",
  pois: [
    { name: "Texas State Capitol", lat: 30.2747, lng: -97.7404, altitude: 500, pitch: -45 },
  ],
});
console.log("After setCurrentCity:", JSON.stringify(ui));
if (ui.currentCity?.name !== "Austin, TX") {
  throw new Error("setCurrentCity failed");
}

console.log("UI store: PASS\n");

// Test shaders store
import {
  shaders,
  setShader,
  setIntensity,
  setParameter,
  PARAMETER_MAPPINGS,
  getDefaultParameters,
} from "../src/stores/shaders";

console.log("=== Shaders Store Test ===");
console.log("Initial state:", JSON.stringify(shaders));

console.log("Parameter mappings available:", Object.keys(PARAMETER_MAPPINGS));
console.log("CRT mapping:", JSON.stringify(PARAMETER_MAPPINGS.crt));

setShader("crt");
console.log("After setShader(crt):", JSON.stringify(shaders));
if (shaders.active !== "crt") throw new Error("setShader failed");
if (shaders.parameters.scanlineIntensity !== 0.15) {
  throw new Error("Default parameters not set correctly");
}

setIntensity(0.5);
console.log("After setIntensity(0.5):", JSON.stringify(shaders));
if (shaders.intensity !== 0.5) throw new Error("setIntensity failed");

setParameter("scanlineIntensity", 0.25);
console.log(
  "After setParameter(scanlineIntensity, 0.25):",
  JSON.stringify(shaders)
);
if (shaders.parameters.scanlineIntensity !== 0.25) {
  throw new Error("setParameter failed");
}

setShader("nvg");
console.log("After setShader(nvg):", JSON.stringify(shaders));
if (shaders.active !== "nvg") throw new Error("setShader(nvg) failed");
if (shaders.parameters.greenIntensity !== 1.0) {
  throw new Error("NVG default parameters not set correctly");
}

setShader(null);
console.log("After setShader(null):", JSON.stringify(shaders));
if (shaders.active !== null) throw new Error("setShader(null) failed");

console.log("Shaders store: PASS\n");

// Summary
console.log("=====================================");
console.log("Phase 2 complete - All stores verified");
console.log("=====================================");
