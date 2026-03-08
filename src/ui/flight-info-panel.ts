/**
 * WorldView - Flight Info Panel
 * Floating overlay shown when an aircraft is selected.
 * Injected into #cesium-container so it overlays the globe.
 */

import type { FlightLayer, FlightRecord, FlightMetadata } from "../layers/flights.ts";

const PANEL_ID = "flight-info-panel";

function getOrCreatePanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "flight-info-panel hidden";
  panel.innerHTML = `
    <div class="sat-info-header">
      <span class="sat-info-title">FLIGHT SELECTED</span>
      <button class="sat-info-close" id="flight-info-close">✕</button>
    </div>
    <div class="sat-info-body">
      <div class="sat-info-row">
        <span class="sat-info-label">CALLSIGN</span>
        <a class="sat-info-value flight-info-link" id="flight-info-callsign" href="#" target="_blank" rel="noopener">—</a>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">ALTITUDE</span>
        <span class="sat-info-value" id="flight-info-altitude">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">SPEED</span>
        <span class="sat-info-value" id="flight-info-speed">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">HEADING</span>
        <span class="sat-info-value" id="flight-info-heading">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">V/S</span>
        <span class="sat-info-value" id="flight-info-vs">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">TYPE</span>
        <span class="sat-info-value" id="flight-info-type">—</span>
      </div>
      <div class="sat-info-row">
        <span class="sat-info-label">ROUTE</span>
        <span class="sat-info-value" id="flight-info-route">—</span>
      </div>
    </div>
    <div class="sat-info-footer">
      <button class="sat-info-follow-btn" id="flight-info-follow">FOLLOW</button>
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
 * Format vertical rate for display.
 * Converts m/s to fpm with arrow indicator.
 */
function formatVerticalRate(verticalRateMS: number): string {
  const fpm = Math.round(verticalRateMS * 196.85);
  if (fpm > 0) return `↑ ${fpm} fpm`;
  if (fpm < 0) return `↓ ${Math.abs(fpm)} fpm`;
  return "— fpm";
}

/**
 * Fetch flight route from FlightAware via proxy.
 */
async function fetchFlightRoute(callsign: string): Promise<{ origin: string; destination: string } | null> {
  if (!callsign.trim()) return null;
  
  try {
    const response = await fetch(`http://localhost:3001/flight-route/${encodeURIComponent(callsign.trim())}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.origin && data.destination) {
      return { origin: data.origin, destination: data.destination };
    }
    return null;
  } catch (error) {
    console.error("[FLIGHTS] Route lookup failed:", error);
    return null;
  }
}

/**
 * Show the flight info panel with the provided data.
 */
export function showFlightInfoPanel(
  record: FlightRecord,
  meta: FlightMetadata | null,
  layer: FlightLayer
): void {
  const panel = getOrCreatePanel();

  // Populate fields
  const callsign = record.callsign.trim();
  
  // Set callsign as a clickable FlightAware link
  const callsignEl = document.getElementById("flight-info-callsign") as HTMLAnchorElement | null;
  if (callsignEl) {
    if (callsign) {
      callsignEl.textContent = callsign;
      callsignEl.href = `https://www.flightaware.com/live/flight/${callsign}`;
      callsignEl.style.pointerEvents = "auto";
    } else {
      callsignEl.textContent = "—";
      callsignEl.href = "#";
      callsignEl.style.pointerEvents = "none";
    }
  }
  setField("flight-info-altitude", `${Math.round(record.altitude * 3.28084).toLocaleString()} ft`);
  setField("flight-info-speed", `${Math.round(record.velocity * 1.94384)} kts`);
  setField("flight-info-heading", `${Math.round(record.heading)}°`);
  setField("flight-info-vs", formatVerticalRate(record.verticalRate));
  setField("flight-info-type", meta?.typecode ?? "—");
  setField("flight-info-route", "...");  // Show loading state
  
  // Fetch route asynchronously from FlightAware
  if (callsign) {
    fetchFlightRoute(callsign).then((route) => {
      if (route && route.origin !== "—" && route.destination !== "—") {
        setField("flight-info-route", `${route.origin} → ${route.destination}`);
      } else {
        setField("flight-info-route", "—");
      }
    });
  } else {
    setField("flight-info-route", "—");
  }

  // Re-wire close button (clone clears stale listeners)
  const closeBtn = replaceWithClone("flight-info-close");
  closeBtn?.addEventListener("click", () => {
    layer.deselectFlight(hideFlightInfoPanel);
  });

  // Re-wire FOLLOW/UNFOLLOW toggle button
  const followBtn = replaceWithClone<HTMLButtonElement>("flight-info-follow");
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
 * Hide the flight info panel and reset follow button state.
 */
export function hideFlightInfoPanel(): void {
  document.getElementById(PANEL_ID)?.classList.add("hidden");
  resetFlightFollowButton();
}

/**
 * Reset the FOLLOW button back to its default (not-following) state.
 * Called when the panel is hidden or Escape is pressed.
 */
export function resetFlightFollowButton(): void {
  const followBtn = document.getElementById("flight-info-follow") as HTMLButtonElement | null;
  if (followBtn) {
    followBtn.textContent = "FOLLOW";
    followBtn.dataset.following = "false";
  }
}
