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

// Error state tracking
let hasShownApiKeyError = false;

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
    // First check if the proxy server is reachable
    const proxyHealth = await checkProxyHealth();
    if (!proxyHealth.ok) {
      showErrorOverlay(proxyHealth.message);
      console.error("Proxy health check failed:", proxyHealth.message);
    } else {
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

      // Handle tile loading failures
      tileset.tileFailed.addEventListener((event: { url: string; message: string }) => {
        console.warn("Tile failed to load:", event.url, event.message);
        // Check if this might be an API key issue
        if (event.message?.includes("403") || event.message?.includes("401")) {
          showApiKeyError();
        }
      });

      viewer.scene.primitives.add(tileset);
      console.log("Google 3D Tiles loaded successfully");
    }
  } catch (error) {
    console.error("Failed to load Google 3D Tiles:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for specific error types
    if (errorMessage.includes("403") || errorMessage.includes("401")) {
      showApiKeyError();
    } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
      showErrorOverlay("Unable to connect to tile proxy server.\n\nMake sure the proxy is running:\nbun run proxy");
    } else {
      showErrorOverlay(`Failed to load 3D tiles:\n${errorMessage}`);
    }
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

/**
 * Check if the proxy server is healthy and has API key configured
 */
async function checkProxyHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${PROXY_URL}/health`, { 
      signal: AbortSignal.timeout(5000) 
    });
    if (response.ok) {
      return { ok: true, message: "Proxy is healthy" };
    }
    return { ok: false, message: `Proxy returned status ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("ECONNREFUSED")) {
      return { 
        ok: false, 
        message: "Proxy server not running.\n\nStart the proxy with:\nbun run proxy" 
      };
    }
    return { ok: false, message: `Proxy health check failed: ${message}` };
  }
}

/**
 * Show an API key error message on screen
 */
function showApiKeyError(): void {
  if (hasShownApiKeyError) return;
  hasShownApiKeyError = true;
  
  showErrorOverlay(
    "Google Maps API Key Error\n\n" +
    "The API key is missing or invalid.\n\n" +
    "1. Get a key from Google Cloud Console\n" +
    "2. Enable 'Map Tiles API'\n" +
    "3. Add to .env file:\n" +
    "   GOOGLE_MAPS_TILE_API_KEY=your_key"
  );
}

/**
 * Show an error overlay on the globe container
 */
function showErrorOverlay(message: string): void {
  // Remove any existing error overlay
  const existing = document.getElementById("globe-error-overlay");
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "globe-error-overlay";
  overlay.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid #ff4444;
    color: #ff4444;
    padding: 24px 32px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    white-space: pre-wrap;
    text-align: center;
    z-index: 1000;
    max-width: 400px;
    line-height: 1.6;
  `;
  overlay.textContent = message;

  const container = document.getElementById("cesium-container");
  if (container) {
    container.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }
}
