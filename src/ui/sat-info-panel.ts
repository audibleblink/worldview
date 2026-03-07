/**
 * WorldView - Satellite Info Panel
 * Floating overlay shown when a satellite is selected.
 * Injected into #cesium-container so it overlays the globe.
 */

import type { SatelliteLayer, SatelliteRecord } from "../layers/satellites.ts";

const PANEL_ID = "sat-info-panel";

/**
 * Create the panel DOM element and inject it once into the document.
 */
function getOrCreatePanel(): HTMLElement {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "sat-info-panel hidden";
  panel.innerHTML = `
    <div class="sat-info-header">
      <span class="sat-info-title">SAT SELECTED</span>
      <button class="sat-info-close" id="sat-info-close">✕</button>
    </div>
    <div class="sat-info-body">
      <div class="sat-info-row">
        <span class="sat-info-label">NAME</span>
        <span class="sat-info-value" id="sat-info-name">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">NORAD</span>
        <span class="sat-info-value" id="sat-info-norad">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">VEL</span>
        <span class="sat-info-value" id="sat-info-vel">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">CAT</span>
        <span class="sat-info-value" id="sat-info-cat">—</span>
      </div>
    </div>
    <div class="sat-info-footer">
      <button class="sat-info-follow-btn" id="sat-info-follow">FOLLOW</button>
    </div>
  `;

  // Inject into cesium container so it sits over the globe
  const container = document.getElementById("cesium-container") ?? document.getElementById("app") ?? document.body;
  container.appendChild(panel);

  return panel;
}

/**
 * Show the satellite info panel with the provided data.
 */
export function showSatelliteInfoPanel(
  record: SatelliteRecord,
  velocityKmS: number,
  satelliteLayer: SatelliteLayer
): void {
  const panel = getOrCreatePanel();

  // Populate fields
  const setField = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setField("sat-info-name", record.name);
  setField("sat-info-norad", record.noradId);
  setField("sat-info-vel", `${velocityKmS.toFixed(3)} KM/S`);
  setField("sat-info-cat", record.category.toUpperCase());

  // Wire close button (deselects satellite)
  const closeBtn = document.getElementById("sat-info-close");
  if (closeBtn) {
    // Replace to clear old listeners
    const newClose = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(newClose, closeBtn);
    newClose.addEventListener("click", () => {
      satelliteLayer.deselectSatellite(() => hideSatelliteInfoPanel());
    });
  }

  // Wire FOLLOW button — Phase 5 wiring placeholder
  const followBtn = document.getElementById("sat-info-follow");
  if (followBtn) {
    const newFollow = followBtn.cloneNode(true) as HTMLElement;
    followBtn.parentNode?.replaceChild(newFollow, followBtn);
    newFollow.addEventListener("click", () => {
      // TODO Phase 5: toggle follow mode
      console.log("[SAT] FOLLOW clicked for", record.noradId, "— Phase 5 wiring pending");
      satelliteLayer.startFollow();
    });
  }

  // Show the panel
  panel.classList.remove("hidden");
}

/**
 * Hide the satellite info panel.
 */
export function hideSatelliteInfoPanel(): void {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.add("hidden");
}
