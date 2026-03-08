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

    // Click-to-select: billboard id is set to noradId/icao24/cameraId string at creation time
    viewer.screenSpaceEventHandler.setInputAction((click: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick((click as any).position);

      // Extract entity ID - Cesium returns entity object in picked.id, string ID is in picked.id.id
      const entityId = picked?.id?.id ?? (typeof picked?.id === "string" ? picked.id : null);

      if (entityId && typeof entityId === "string") {
        // Check if it's a CCTV billboard or camera marker
        const cctvManager = groundLayer.getCCTVManager();
        if (cctvManager.isCCTVBillboard(entityId)) {
          // Check if it's a camera marker (icon on map)
          if (cctvManager.isCameraMarker(entityId)) {
            const cameraId = cctvManager.getCameraIdFromMarker(entityId);
            if (cameraId) {
              // Project the camera and open center-stage
              const camera = cctvManager.getCamera(cameraId);
              if (camera) {
                cctvManager.projectCamera(camera).then(() => {
                  cctvManager.enterCenterStage(cameraId);
                });
              }
            }
            return;
          }
          
          // Check if click hit the close button on the billboard
          if (cctvManager.handleBillboardClick(entityId, click.position, viewer)) {
            return; // Close button was clicked, billboard removed
          }
          // Toggle center-stage mode for this camera
          cctvManager.toggleCenterStage(entityId);
          return;
        }

        // Check if it's a flight (FlightLayer tracks its own icao24 set)
        if (flightLayer.hasIcao(entityId)) {
          flightLayer.selectFlight(entityId, async (record) => {
            const meta = await fetchAircraftMeta(entityId);
            showFlightInfoPanel(record, meta, flightLayer);
          });
          return;
        }

        // Otherwise handle as satellite
        satelliteLayer.selectSatellite(entityId, (record, velocity) => {
          showSatelliteInfoPanel(record, velocity, satelliteLayer);
        });
        return;
      }

      // Clicked empty space — deselect both and exit center-stage
      satelliteLayer.deselectSatellite(hideSatelliteInfoPanel);
      flightLayer.deselectFlight(hideFlightInfoPanel);
      groundLayer.getCCTVManager().exitCenterStage();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

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
