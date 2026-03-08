/**
 * WorldView - Main Entry Point
 * Initializes the globe and UI shell
 */

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");
import { initGlobe } from "./globe.ts";
import { initShell, updateSatelliteCount, updateFlightCount, updateCameraCount, addEscapeHandler } from "./ui/shell.ts";
import { setViewer, flyToPOIByIndex } from "./pois.ts";
import { shaderManager } from "./shaders/index.ts";
import { SatelliteLayer, loadAllTLEs } from "./layers/satellites.ts";
import { FlightLayer, fetchAircraftMeta } from "./layers/flights.ts";
import { showSatelliteInfoPanel, hideSatelliteInfoPanel, resetFollowButton } from "./ui/sat-info-panel.ts";
import { showFlightInfoPanel, hideFlightInfoPanel, resetFlightFollowButton } from "./ui/flight-info-panel.ts";
import { GroundLayer } from "./ground/index.ts";

// POI navigation key mappings: q→0, w→1, e→2, r→3, t→4
const POI_KEY_MAP: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4 };

function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    const el = document.activeElement;
    const tag = el?.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement)?.isContentEditable) return;
    
    const poiIndex = POI_KEY_MAP[event.key.toLowerCase()];
    if (poiIndex !== undefined) flyToPOIByIndex(poiIndex);
  });
}

/** Extract entity ID from Cesium pick result */
function extractEntityId(picked: any): string | null {
  const entityId = picked?.id?.id ?? (typeof picked?.id === "string" ? picked.id : null);
  return typeof entityId === "string" ? entityId : null;
}

/** Click handler context for layer interactions */
interface ClickContext {
  groundLayer: GroundLayer;
  flightLayer: FlightLayer;
  satelliteLayer: SatelliteLayer;
  viewer: import("cesium").Viewer;
}

/** Handle CCTV camera/marker clicks */
function handleCCTVClick(
  entityId: string,
  clickPosition: { x: number; y: number },
  ctx: ClickContext
): boolean {
  const cctvManager = ctx.groundLayer.getCCTVManager();
  
  if (!cctvManager.isCCTVBillboard(entityId)) return false;

  // Camera marker (icon on map) - project and open center-stage
  if (cctvManager.isCameraMarker(entityId)) {
    const cameraId = cctvManager.getCameraIdFromMarker(entityId);
    const camera = cameraId ? cctvManager.getCamera(cameraId) : null;
    if (camera) {
      cctvManager.projectCamera(camera).then(() => {
        cctvManager.enterCenterStage(cameraId!);
      });
    }
    return true;
  }

  // Billboard close button
  if (cctvManager.handleBillboardClick(entityId, clickPosition, ctx.viewer)) {
    return true;
  }

  // Toggle center-stage mode
  cctvManager.toggleCenterStage(entityId);
  return true;
}

/** Handle flight clicks */
function handleFlightClick(entityId: string, ctx: ClickContext): boolean {
  if (!ctx.flightLayer.hasIcao(entityId)) return false;

  ctx.flightLayer.selectFlight(entityId, async (record) => {
    const meta = await fetchAircraftMeta(entityId);
    showFlightInfoPanel(record, meta, ctx.flightLayer);
  });
  return true;
}

/** Handle satellite clicks */
function handleSatelliteClick(entityId: string, ctx: ClickContext): boolean {
  ctx.satelliteLayer.selectSatellite(entityId, (record, velocity) => {
    showSatelliteInfoPanel(record, velocity, ctx.satelliteLayer);
  });
  return true;
}

/** Handle click on empty space - deselect all */
function handleEmptyClick(ctx: ClickContext): void {
  ctx.satelliteLayer.deselectSatellite(hideSatelliteInfoPanel);
  ctx.flightLayer.deselectFlight(hideFlightInfoPanel);
  ctx.groundLayer.getCCTVManager().exitCenterStage();
}

export async function init(): Promise<void> {
  const container = document.getElementById("cesium-container");
  if (!container) {
    console.error("Cesium container not found");
    return;
  }

  try {
    const viewer = await initGlobe(container);
    setViewer(viewer);

    const satelliteLayer = new SatelliteLayer(viewer, updateSatelliteCount);
    const flightLayer = new FlightLayer(viewer, updateFlightCount);

    // Initialize ground layer
    const groundLayer = new GroundLayer();
    await groundLayer.initialize(viewer);
    
    // Set up camera count updates
    groundLayer.setOnCameraCountChange((count) => {
      updateCameraCount(count > 0 ? count : null);
    });

    // When a category filter hides the selected satellite, close the panel
    satelliteLayer.setExternalDeselectCallback(() => {
      hideSatelliteInfoPanel();
      resetFollowButton();
    });

    // When a flight is deselected externally, close the flight panel
    flightLayer.setExternalDeselectCallback(() => {
      hideFlightInfoPanel();
    });

    initShell(viewer, { satelliteLayer, loadAllTLEs, flightLayer, groundLayer });

    // Escape stops follow mode for both satellites and flights, and exits center-stage
    addEscapeHandler(() => {
      satelliteLayer.stopFollow();
      resetFollowButton();
      flightLayer.stopFollow();
      resetFlightFollowButton();
      groundLayer.getCCTVManager().exitCenterStage();
    });

    setupKeyboardNavigation();

    shaderManager.init(viewer);
    (window as Window & { shaderManager?: typeof shaderManager }).shaderManager = shaderManager;

    // Click-to-select handler
    const clickCtx: ClickContext = { groundLayer, flightLayer, satelliteLayer, viewer };

    viewer.screenSpaceEventHandler.setInputAction(
      (click: { position: { x: number; y: number } }) => {
        const picked = viewer.scene.pick((click as any).position);
        const entityId = extractEntityId(picked);

        if (!entityId) {
          handleEmptyClick(clickCtx);
          return;
        }

        // Try each handler in order - first match wins
        if (handleCCTVClick(entityId, click.position, clickCtx)) return;
        if (handleFlightClick(entityId, clickCtx)) return;
        handleSatelliteClick(entityId, clickCtx);
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    console.log("WorldView initialized");
  } catch (error) {
    console.error("Failed to initialize WorldView:", error);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
