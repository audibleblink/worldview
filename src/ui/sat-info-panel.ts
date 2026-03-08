/**
 * WorldView - Satellite Info Panel
 * Floating overlay shown when a satellite is selected.
 * Injected into #cesium-container so it overlays the globe.
 */

import type { SatelliteLayer, SatelliteRecord } from "../layers/satellites.ts";

const PANEL_ID = "sat-info-panel";

function getOrCreatePanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("div");
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
        <a class="sat-info-value sat-info-link" id="sat-info-norad" href="#" target="_blank" rel="noopener">—</a>
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
 * Show the satellite info panel with the provided data.
 */
export function showSatelliteInfoPanel(
  record: SatelliteRecord,
  velocityKmS: number,
  satelliteLayer: SatelliteLayer
): void {
  const panel = getOrCreatePanel();

  setField("sat-info-name", record.name);
  setField("sat-info-vel", `${velocityKmS.toFixed(3)} KM/S`);
  setField("sat-info-cat", record.category.toUpperCase());

  // Set NORAD ID as a clickable satcat.com link
  const noradEl = document.getElementById("sat-info-norad") as HTMLAnchorElement | null;
  if (noradEl) {
    if (record.noradId) {
      noradEl.textContent = record.noradId;
      noradEl.href = `https://www.satcat.com/sats/${record.noradId}`;
      noradEl.style.pointerEvents = "auto";
    } else {
      noradEl.textContent = "—";
      noradEl.href = "#";
      noradEl.style.pointerEvents = "none";
    }
  }

  // Re-wire close button (clone clears stale listeners)
  const closeBtn = replaceWithClone("sat-info-close");
  closeBtn?.addEventListener("click", () => {
    satelliteLayer.deselectSatellite(hideSatelliteInfoPanel);
  });

  // Re-wire FOLLOW/UNFOLLOW toggle button
  const followBtn = replaceWithClone<HTMLButtonElement>("sat-info-follow");
  followBtn?.addEventListener("click", () => {
    const following = followBtn.dataset.following === "true";
    if (following) {
      satelliteLayer.stopFollow();
      followBtn.textContent = "FOLLOW";
      followBtn.dataset.following = "false";
    } else {
      satelliteLayer.startFollow();
      followBtn.textContent = "UNFOLLOW";
      followBtn.dataset.following = "true";
    }
  });

  panel.classList.remove("hidden");
}

/**
 * Hide the satellite info panel and reset follow button state.
 */
export function hideSatelliteInfoPanel(): void {
  document.getElementById(PANEL_ID)?.classList.add("hidden");
  resetFollowButton();
}

/**
 * Reset the FOLLOW button back to its default (not-following) state.
 * Called when the panel is hidden or Escape is pressed.
 */
export function resetFollowButton(): void {
  const followBtn = document.getElementById("sat-info-follow") as HTMLButtonElement | null;
  if (followBtn) {
    followBtn.textContent = "FOLLOW";
    followBtn.dataset.following = "false";
  }
}
