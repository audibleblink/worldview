/**
 * WorldView - Cesium Provider
 *
 * SolidJS context provider that manages the Cesium Viewer lifecycle.
 * Creates viewer in onMount, destroys in onCleanup.
 * Loads Google 3D Tiles for the globe.
 */

import {
  createContext,
  createSignal,
  onMount,
  onCleanup,
  type JSX,
  type Accessor,
} from "solid-js";
import { PROXY_BASE_URL } from "../config";

declare const Cesium: typeof import("cesium");

// Google 3D Tiles URL via proxy
const GOOGLE_3D_TILES_URL = `${PROXY_BASE_URL}/v1/3dtiles/root.json`;

// Default camera position: 15,000km altitude, centered on 0°N 0°E
const DEFAULT_CAMERA = {
  longitude: 0,
  latitude: 0,
  height: 15_000_000, // 15,000 km in meters
};

export interface CesiumViewerOptions {
  /** Show selection indicator on entities */
  selectionIndicator?: boolean;
  /** Show info box when entity selected */
  infoBox?: boolean;
  /** MSAA sample count for antialiasing */
  msaaSamples?: number;
  /** Maximum screen space error for 3D tiles */
  maximumScreenSpaceError?: number;
}

export interface CesiumContextValue {
  /** Accessor for the Cesium Viewer instance (null until mounted) */
  viewer: Accessor<Cesium.Viewer | null>;
  /** Whether the viewer is fully initialized */
  ready: Accessor<boolean>;
}

export const CesiumContext = createContext<CesiumContextValue>();

export interface CesiumProviderProps {
  children?: JSX.Element;
  options?: CesiumViewerOptions;
}

/**
 * CesiumProvider - Wraps the app with Cesium viewer context
 *
 * Usage:
 * ```tsx
 * <CesiumProvider>
 *   <App />
 * </CesiumProvider>
 * ```
 */
export function CesiumProvider(props: CesiumProviderProps) {
  const [viewer, setViewer] = createSignal<Cesium.Viewer | null>(null);
  const [ready, setReady] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;

  onMount(async () => {
    if (!containerRef) {
      console.error("[CesiumProvider] Container ref not found");
      return;
    }

    // Disable Cesium Ion - we're using Google 3D Tiles directly
    Cesium.Ion.defaultAccessToken = "";

    const opts = props.options ?? {};

    // Create the Cesium Viewer with optimized settings
    const cesiumViewer = new Cesium.Viewer(containerRef, {
      // Disable default UI elements we don't need
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: opts.selectionIndicator ?? false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: opts.infoBox ?? false,

      // Disable terrain - Google 3D Tiles includes terrain
      terrain: undefined,

      // Enable standard mouse/touch controls (CesiumJS defaults)
      scene3DOnly: true,

      // Performance settings
      requestRenderMode: false,
      maximumRenderTimeChange: Infinity,

      // Rendering quality
      msaaSamples: opts.msaaSamples ?? 4,
    });

    // Remove default imagery layers since Google 3D Tiles provides everything
    cesiumViewer.imageryLayers.removeAll();

    // Remove default credit display
    const creditContainer = cesiumViewer.cesiumWidget
      .creditContainer as HTMLElement;
    creditContainer.style.display = "none";

    // Set default camera position
    cesiumViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        DEFAULT_CAMERA.longitude,
        DEFAULT_CAMERA.latitude,
        DEFAULT_CAMERA.height
      ),
    });

    // Configure scene settings
    const { scene } = cesiumViewer;
    scene.globe.show = false; // Hide default globe since we use 3D tiles
    scene.globe.depthTestAgainstTerrain = false;

    // Enable celestial bodies
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;

    setViewer(cesiumViewer);
    (window as any).__viewer = cesiumViewer; // DEBUG: expose viewer for diagnostics

    // Load Google Photorealistic 3D Tiles
    try {
      const proxyHealth = await checkProxyHealth();
      if (!proxyHealth.ok) {
        showErrorOverlay(containerRef, proxyHealth.message);
        console.error("Proxy health check failed:", proxyHealth.message);
      } else {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          GOOGLE_3D_TILES_URL,
          {
            shadows: Cesium.ShadowMode.DISABLED,
            maximumScreenSpaceError: opts.maximumScreenSpaceError ?? 16,
            preloadWhenHidden: true,
            preferLeaves: true,
            skipLevelOfDetail: true,
            baseScreenSpaceError: 1024,
            skipScreenSpaceErrorFactor: 16,
            skipLevels: 1,
            immediatelyLoadDesiredLevelOfDetail: false,
            loadSiblings: false,
            cullWithChildrenBounds: true,
          }
        );

        // Handle tile loading failures
        tileset.tileFailed.addEventListener(
          (event: { url: string; message: string }) => {
            console.warn("Tile failed to load:", event.url, event.message);
            if (
              event.message?.includes("403") ||
              event.message?.includes("401")
            ) {
              showApiKeyError(containerRef!);
            }
          }
        );

        cesiumViewer.scene.primitives.add(tileset);
        console.log("[CesiumProvider] Google 3D Tiles loaded successfully");
      }
    } catch (error) {
      console.error("[CesiumProvider] Failed to load Google 3D Tiles:", error);
      handleTileLoadError(containerRef, error);
    }

    setReady(true);
    console.log("[CesiumProvider] Cesium viewer initialized");
  });

  onCleanup(() => {
    const v = viewer();
    if (v && !v.isDestroyed()) {
      v.destroy();
      console.log("[CesiumProvider] Cesium viewer destroyed");
    }
  });

  const contextValue: CesiumContextValue = {
    viewer,
    ready,
  };

  return (
    <CesiumContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        id="cesium-container"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />
      {props.children}
    </CesiumContext.Provider>
  );
}

// ============ Helper Functions ============

async function checkProxyHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${PROXY_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok
      ? { ok: true, message: "Proxy is healthy" }
      : { ok: false, message: `Proxy returned status ${response.status}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("ECONNREFUSED")
    ) {
      return {
        ok: false,
        message:
          "Proxy server not running.\n\nStart the proxy with:\nbun run proxy",
      };
    }
    return { ok: false, message: `Proxy health check failed: ${msg}` };
  }
}

function handleTileLoadError(container: HTMLElement, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes("403") || msg.includes("401")) {
    showApiKeyError(container);
  } else if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("ECONNREFUSED")
  ) {
    showErrorOverlay(
      container,
      "Unable to connect to tile proxy server.\n\nMake sure the proxy is running:\nbun run proxy"
    );
  } else {
    showErrorOverlay(container, `Failed to load 3D tiles:\n${msg}`);
  }
}

let hasShownApiKeyError = false;

function showApiKeyError(container: HTMLElement): void {
  if (hasShownApiKeyError) return;
  hasShownApiKeyError = true;

  showErrorOverlay(
    container,
    "Google Maps API Key Error\n\n" +
      "The API key is missing or invalid.\n\n" +
      "1. Get a key from Google Cloud Console\n" +
      "2. Enable 'Map Tiles API'\n" +
      "3. Add to .env file:\n" +
      "   GOOGLE_MAPS_TILE_API_KEY=your_key"
  );
}

function showErrorOverlay(container: HTMLElement, message: string): void {
  // Remove any existing error overlay
  const existing = document.getElementById("globe-error-overlay");
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "globe-error-overlay";
  overlay.className = "globe-error-overlay";
  overlay.textContent = message;

  container.appendChild(overlay);
}

export default CesiumProvider;
