/**
 * WorldView - Ship Info Panel
 * Floating overlay shown when a ship is selected.
 * Injected into #cesium-container so it overlays the globe.
 */

import type { ShipLayer } from "../layers/ships.ts";
import type { ShipRecord, ShipTypeCategory } from "../proxy/aisstream.ts";

const PANEL_ID = "ship-info-panel";

/**
 * Maps AIS navigation status code to human-readable string
 */
function navStatusToString(status: number): string {
  switch (status) {
    case 0: return "Under way using engine";
    case 1: return "At anchor";
    case 2: return "Not under command";
    case 3: return "Restricted maneuverability";
    case 4: return "Constrained by draught";
    case 5: return "Moored";
    case 6: return "Aground";
    case 7: return "Engaged in fishing";
    case 8: return "Under way sailing";
    case 14: return "AIS-SART active";
    default: return "Not defined";
  }
}

/**
 * Converts ship type category to display text
 */
function shipTypeToDisplayText(category: ShipTypeCategory): string {
  switch (category) {
    case "cargo": return "Cargo Vessel";
    case "tanker": return "Tanker";
    case "passenger": return "Passenger Vessel";
    case "fishing": return "Fishing Vessel";
    case "other": return "Vessel";
  }
}

/**
 * Formats latitude/longitude for display
 */
function formatPosition(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

function getOrCreatePanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "ship-info-panel hidden";
  panel.innerHTML = `
    <div class="sat-info-header ship-info-header">
      <span class="sat-info-title ship-info-title" id="ship-info-name">VESSEL</span>
      <button class="sat-info-close" id="ship-info-close">✕</button>
    </div>
    <div class="sat-info-body">
      <div class="sat-info-row">
        <span class="sat-info-label">MMSI</span>
        <a class="sat-info-value ship-info-link" id="ship-info-mmsi" href="#" target="_blank" rel="noopener">—</a>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">TYPE</span>
        <span class="sat-info-value" id="ship-info-type">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">POSITION</span>
        <span class="sat-info-value" id="ship-info-position">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">SPEED</span>
        <span class="sat-info-value" id="ship-info-speed">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">COURSE</span>
        <span class="sat-info-value" id="ship-info-course">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">HEADING</span>
        <span class="sat-info-value" id="ship-info-heading">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">STATUS</span>
        <span class="sat-info-value" id="ship-info-status">—</span>
      </div>
    </div>
    <div class="sat-info-footer ship-info-footer">
      <button class="sat-info-follow-btn" id="ship-info-follow">FOLLOW</button>
      <a class="ship-info-external-link" id="ship-info-marinetraffic" href="#" target="_blank" rel="noopener">View on MarineTraffic ↗</a>
    </div>
  `;

  const container =
    document.getElementById("cesium-container") ??
    document.getElementById("app") ??
    document.body;
  container.appendChild(panel);

  return panel;
}

/** Set a text field by element ID. */
function setField(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Replace an element with a fresh clone to clear all event listeners,
 * then return the new element.
 */
function replaceWithClone<T extends HTMLElement>(id: string): T | null {
  const el = document.getElementById(id) as T | null;
  if (!el) return null;
  const clone = el.cloneNode(true) as T;
  el.parentNode?.replaceChild(clone, el);
  return clone;
}

/**
 * Show the ship info panel with the provided data.
 */
export function showShipInfoPanel(
  record: ShipRecord,
  layer: ShipLayer
): void {
  const panel = getOrCreatePanel();

  // Populate header with vessel name
  const vesselName = record.name || record.mmsi;
  setField("ship-info-name", vesselName);

  // Populate MMSI with link to myshiptracking.com
  const mmsiLink = document.getElementById("ship-info-mmsi") as HTMLAnchorElement | null;
  if (mmsiLink) {
    mmsiLink.textContent = record.mmsi;
    mmsiLink.href = `https://myshiptracking.com/da/?mmsi=${record.mmsi}`;
  }
  setField("ship-info-type", shipTypeToDisplayText(record.shipTypeCategory));
  setField("ship-info-position", formatPosition(record.latitude, record.longitude));
  setField("ship-info-speed", `${record.sog.toFixed(1)} kn`);
  setField("ship-info-course", `${record.cog.toFixed(1)}°`);
  
  // Display heading - 511 means "not available" in AIS
  const headingDisplay = record.trueHeading === 511 ? "N/A" : `${record.trueHeading}°`;
  setField("ship-info-heading", headingDisplay);
  
  setField("ship-info-status", navStatusToString(record.navStatus));

  // Set MarineTraffic link
  const mtLink = document.getElementById("ship-info-marinetraffic") as HTMLAnchorElement | null;
  if (mtLink) {
    mtLink.href = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${record.mmsi}`;
  }

  // Re-wire close button (clone clears stale listeners)
  const closeBtn = replaceWithClone("ship-info-close");
  closeBtn?.addEventListener("click", () => {
    layer.deselectShip(hideShipInfoPanel);
  });

  // Re-wire FOLLOW/UNFOLLOW toggle button
  const followBtn = replaceWithClone<HTMLButtonElement>("ship-info-follow");
  
  // Set initial button state based on current follow status
  if (layer.isFollowing()) {
    followBtn!.textContent = "UNFOLLOW";
    followBtn!.dataset.following = "true";
  } else {
    followBtn!.textContent = "FOLLOW";
    followBtn!.dataset.following = "false";
  }
  
  followBtn?.addEventListener("click", () => {
    const following = followBtn.dataset.following === "true";
    if (following) {
      layer.stopFollow();
      followBtn.textContent = "FOLLOW";
      followBtn.dataset.following = "false";
    } else {
      layer.startFollow();
      followBtn.textContent = "UNFOLLOW";
      followBtn.dataset.following = "true";
    }
  });

  panel.classList.remove("hidden");
}

/**
 * Hide the ship info panel and reset follow button state.
 */
export function hideShipInfoPanel(): void {
  document.getElementById(PANEL_ID)?.classList.add("hidden");
  resetShipFollowButton();
}

/**
 * Reset the FOLLOW button back to its default (not-following) state.
 * Called when the panel is hidden or Escape is pressed.
 */
export function resetShipFollowButton(): void {
  const followBtn = document.getElementById("ship-info-follow") as HTMLButtonElement | null;
  if (followBtn) {
    followBtn.textContent = "FOLLOW";
    followBtn.dataset.following = "false";
  }
}
