/**
 * WorldView - Globe Module
 * Handles CesiumJS viewer initialization and 3D tile configuration
 */

import * as Cesium from "cesium";

// Disable Cesium Ion - we're using Google 3D Tiles directly
Cesium.Ion.defaultAccessToken = "";

// Viewer instance
let viewer: Cesium.Viewer | null = null;

// Proxy URL for Google 3D Tiles
const PROXY_URL = "http://localhost:3001";
const GOOGLE_3D_TILES_URL = `${PROXY_URL}/v1/3dtiles/root.json`;

// Default camera position: 15,000km altitude, centered on 0°N 0°E
const DEFAULT_CAMERA = {
  longitude: 0,
  latitude: 0,
  height: 15_000_000, // 15,000 km in meters
};

/**
 * Initialize the CesiumJS viewer with Google 3D Tiles
 */
export async function initGlobe(
  container: HTMLElement
): Promise<Cesium.Viewer> {
  // Create the Cesium Viewer with optimized settings for Google 3D Tiles
  viewer = new Cesium.Viewer(container, {
    // Disable default UI elements we don't need
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    animation: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    infoBox: false,

    // Disable terrain - Google 3D Tiles includes terrain
    terrain: undefined,

    // Enable standard mouse/touch controls (these are CesiumJS defaults)
    scene3DOnly: true,

    // Performance settings
    requestRenderMode: false,
    maximumRenderTimeChange: Infinity,

    // Rendering quality
    msaaSamples: 4,
  });

  // Remove default imagery layers since Google 3D Tiles provides everything
  viewer.imageryLayers.removeAll();

  // Remove default credit display
  const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
  creditContainer.style.display = "none";

  // Set default camera position
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA.longitude,
      DEFAULT_CAMERA.latitude,
      DEFAULT_CAMERA.height
    ),
  });

  // Load Google Photorealistic 3D Tiles
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(GOOGLE_3D_TILES_URL, {
      // Enable shadows for better visual quality
      shadows: Cesium.ShadowMode.DISABLED,

      // Performance optimizations
      maximumScreenSpaceError: 16,
      preloadWhenHidden: true,
      preferLeaves: true,
      skipLevelOfDetail: true,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1,
      immediatelyLoadDesiredLevelOfDetail: false,
      loadSiblings: false,
      cullWithChildrenBounds: true,
    });

    viewer.scene.primitives.add(tileset);
    console.log("Google 3D Tiles loaded successfully");
  } catch (error) {
    console.error("Failed to load Google 3D Tiles:", error);
    // Continue without 3D tiles - the globe will still work
  }

  // Configure scene settings
  viewer.scene.globe.show = false; // Hide default globe since we use 3D tiles

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
  }
  if (viewer.scene.sun) {
    viewer.scene.sun.show = true;
  }
  if (viewer.scene.moon) {
    viewer.scene.moon.show = true;
  }

  // Enable depth testing for better rendering
  viewer.scene.globe.depthTestAgainstTerrain = false;

  console.log("Globe initialized successfully");
  return viewer;
}

/**
 * Get the current viewer instance
 */
export function getViewer(): Cesium.Viewer | null {
  return viewer;
}

/**
 * Destroy the viewer and clean up resources
 */
export function destroyGlobe(): void {
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
}

/**
 * Fly to a specific location
 */
export function flyTo(
  longitude: number,
  latitude: number,
  height: number = 1_000_000,
  duration: number = 2
): void {
  if (!viewer) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
    duration,
  });
}

/**
 * Reset camera to default position
 */
export function resetCamera(): void {
  if (!viewer) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA.longitude,
      DEFAULT_CAMERA.latitude,
      DEFAULT_CAMERA.height
    ),
    duration: 2,
  });
}
