/**
 * Store Tests
 * Tests SolidJS stores independently of UI or Cesium
 */

import { test, expect, describe } from "bun:test";
import { layers, toggleLayer, setLayerEnabled } from "../stores/layers";
import { selection, selectEntity, clearSelection, setSelectionData } from "../stores/selection";
import { camera, setFollowTarget, setFreeCamera, setOrbitTarget, updateCameraPosition } from "../stores/camera";
import { ui, toggleLeftPanel, toggleRightPanel, setCommandMode, setCurrentCity } from "../stores/ui";
import { shaders, setShader, setIntensity, setParameter, PARAMETER_MAPPINGS } from "../stores/shaders";

describe("Layers Store", () => {
  test("toggleLayer toggles layer state", () => {
    const initialState = layers.satellites;
    toggleLayer("satellites");
    expect(layers.satellites).toBe(!initialState);
    // Reset
    toggleLayer("satellites");
  });

  test("setLayerEnabled sets specific state", () => {
    setLayerEnabled("satellites", true);
    expect(layers.satellites).toBe(true);
    setLayerEnabled("satellites", false);
    expect(layers.satellites).toBe(false);
    // Reset to default
    setLayerEnabled("satellites", true);
  });
});

describe("Selection Store", () => {
  test("selectEntity sets type and id", () => {
    selectEntity("satellite", "25544", {
      noradId: "25544",
      name: "ISS",
      category: "stations",
      position: { lat: 0, lng: 0, alt: 400000 },
    });

    expect(selection.type).toBe("satellite");
    expect(selection.id).toBe("25544");
  });

  test("clearSelection resets state", () => {
    selectEntity("flight", "ABC123");
    clearSelection();

    expect(selection.type).toBeNull();
    expect(selection.id).toBeNull();
  });

  test("setSelectionData updates data", () => {
    selectEntity("flight", "ABC123");
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

    expect((selection.data as any)?.callsign).toBe("UAL123");
    clearSelection();
  });
});

describe("Camera Store", () => {
  test("setFollowTarget sets follow mode", () => {
    setFollowTarget("satellite", "25544");
    
    expect(camera.mode).toBe("follow");
    expect(camera.target?.id).toBe("25544");
  });

  test("setOrbitTarget sets orbit mode", () => {
    setOrbitTarget("flight", "ABC123");
    
    expect(camera.mode).toBe("orbit");
  });

  test("updateCameraPosition updates position", () => {
    updateCameraPosition({
      longitude: -97.7,
      latitude: 30.2,
      height: 1000,
      heading: 0,
      pitch: -45,
      roll: 0,
    });

    expect(camera.position?.latitude).toBe(30.2);
  });

  test("setFreeCamera resets to free mode", () => {
    setFollowTarget("satellite", "25544");
    setFreeCamera();

    expect(camera.mode).toBe("free");
    expect(camera.target).toBeNull();
  });
});

describe("UI Store", () => {
  test("toggleLeftPanel toggles state", () => {
    const initial = ui.leftPanelOpen;
    toggleLeftPanel();
    expect(ui.leftPanelOpen).toBe(!initial);
    // Reset
    toggleLeftPanel();
  });

  test("toggleRightPanel toggles state", () => {
    const initial = ui.rightPanelOpen;
    toggleRightPanel();
    expect(ui.rightPanelOpen).toBe(!initial);
    // Reset
    toggleRightPanel();
  });

  test("setCommandMode sets state", () => {
    setCommandMode(true);
    expect(ui.commandMode).toBe(true);
    setCommandMode(false);
    expect(ui.commandMode).toBe(false);
  });

  test("setCurrentCity updates city", () => {
    setCurrentCity({
      name: "Austin, TX",
      pois: [
        { name: "Texas State Capitol", lat: 30.2747, lng: -97.7404, altitude: 500, pitch: -45 },
      ],
    });

    expect(ui.currentCity?.name).toBe("Austin, TX");
  });
});

describe("Shaders Store", () => {
  test("setShader activates shader with default params", () => {
    setShader("crt");
    
    expect(shaders.active).toBe("crt");
    expect(shaders.parameters.scanlineIntensity).toBe(0.15);
  });

  test("setIntensity updates intensity", () => {
    setIntensity(0.5);
    expect(shaders.intensity).toBe(0.5);
  });

  test("setParameter updates specific parameter", () => {
    setShader("crt");
    setParameter("scanlineIntensity", 0.25);
    
    expect(shaders.parameters.scanlineIntensity).toBe(0.25);
  });

  test("setShader(null) disables shader", () => {
    setShader("crt");
    setShader(null);
    
    expect(shaders.active).toBeNull();
  });

  test("nvg shader has correct defaults", () => {
    setShader("nvg");
    
    expect(shaders.active).toBe("nvg");
    expect(shaders.parameters.greenIntensity).toBe(1.0);
    
    // Cleanup
    setShader(null);
  });

  test("PARAMETER_MAPPINGS contains expected shaders", () => {
    expect(PARAMETER_MAPPINGS.crt).toBeDefined();
    expect(PARAMETER_MAPPINGS.nvg).toBeDefined();
  });
});
