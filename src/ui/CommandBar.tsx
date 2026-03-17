/**
 * WorldView - Command Bar (SolidJS)
 * Vim-style command input for navigation and control.
 * Port from src/ui/command-bar.ts + src/ui/command-parser.ts
 */

import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import { ui, setCommandMode } from "../stores/ui";
import { setFollowTarget, setFreeCamera } from "../stores/camera";
import { selectEntity, clearSelection } from "../stores/selection";
import { useCesium } from "../cesium/useCesium";
import { PROXY_ENDPOINTS } from "../config";
import { convertIataToIcao } from "../utils/airline-codes";
import { parseCoordinates, lookupAirport, getAltitudeForType, type GeoResult } from "../utils/geocoder";

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");

// ============================================
// Command Parser
// ============================================

export interface ParsedCommand {
  type: "goto" | "home" | "help" | "follow";
  args?: string;
}

/** Command definitions: [type, hasArgs] */
const COMMANDS: Record<string, [ParsedCommand["type"], boolean]> = {
  goto: ["goto", true],
  go: ["goto", true],
  follow: ["follow", true],
  home: ["home", false],
  help: ["help", false],
  "?": ["help", false],
};

/** Parse a command string (e.g., "goto austin", "home", "follow 25544") */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const spaceIdx = lower.indexOf(" ");

  // Extract command name and potential args
  const cmdName = spaceIdx === -1 ? lower : lower.slice(0, spaceIdx);
  const def = COMMANDS[cmdName];
  if (!def) return null;

  const [type, hasArgs] = def;
  if (!hasArgs) return { type };

  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  return { type, args };
}

export type IdentifierType = "satellite" | "flight";

/** Detect if identifier is a satellite NORAD ID (1-5 digits) or flight callsign */
export function detectIdentifierType(id: string): IdentifierType {
  return /^\d{1,5}$/.test(id) ? "satellite" : "flight";
}

// ============================================
// Geocoding
// ============================================

const GOOGLE_TYPE_MAP: Record<string, GeoResult["type"]> = {
  country: "country",
  administrative_area_level_1: "region",
  locality: "city",
  postal_code: "city",
  sublocality: "city",
  street_address: "address",
  route: "address",
  premise: "address",
  point_of_interest: "poi",
  establishment: "poi",
};

function mapGoogleTypeToGeoType(types: string[]): GeoResult["type"] {
  for (const t of types) {
    if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  }
  return "city";
}

/** Unified geocode: tries coordinates → airport code → Google API */
async function geocodeLocation(query: string): Promise<GeoResult | null> {
  const q = query.trim();
  if (!q) return null;

  // 1. Try parsing as coordinates
  const coords = parseCoordinates(q);
  if (coords) return { lat: coords.lat, lng: coords.lng, name: q, type: "coords" };

  // 2. Try 3-letter airport code
  if (/^[a-zA-Z]{3}$/.test(q)) {
    const airport = lookupAirport(q);
    if (airport) return { lat: airport.lat, lng: airport.lng, name: airport.name, type: "airport" };
  }

  // 3. Fall back to Google Geocode API
  try {
    const res = await fetch(PROXY_ENDPOINTS.geocode(q));
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    const loc = result?.geometry?.location;
    if (!data.ok || !loc?.lat || !loc?.lng) return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      name: result.formatted_address || q,
      type: mapGoogleTypeToGeoType(result.types || []),
    };
  } catch {
    return null;
  }
}

// ============================================
// Command Bar Component
// ============================================

export function CommandBar() {
  const { viewer } = useCesium();

  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [showHelp, setShowHelp] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  /** Fly camera to location with oblique pitch compensation */
  function flyTo(lng: number, lat: number, height: number, duration = 2, pitch = -45): void {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Offset latitude south so target appears centered at the given pitch angle
    const latOffset = pitch === -90 ? 0 : (height / 111000) * Math.tan(Math.abs(pitch) * Math.PI / 180);

    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat - latOffset, height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 },
      duration,
    });
  }

  // Focus input when command mode becomes active
  createEffect(() => {
    if (ui.commandMode && inputRef) {
      inputRef.focus();
      setInput("");
      setError("");
      setShowHelp(false);
    }
  });

  async function handleGoto(location: string): Promise<void> {
    if (!location.trim()) {
      setError("Usage: goto <location>");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await geocodeLocation(location);
      setLoading(false);

      if (!result) {
        setError("Location not found");
        console.log("[NAV] Location not found:", location);
        return;
      }

      console.log("[NAV] Flying to", result.name);
      flyTo(result.lng, result.lat, getAltitudeForType(result.type));
      setCommandMode(false);
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg.includes("timeout") ? "Request timed out" : msg.includes("fetch") ? "Network error" : msg);
    }
  }

  function handleFollow(identifier: string): void {
    if (!identifier.trim()) {
      setError("Usage: follow <id>");
      return;
    }

    const idType = detectIdentifierType(identifier);

    if (idType === "satellite") {
      const noradId = parseInt(identifier, 10);
      if (!noradId) {
        setError("Invalid NORAD ID");
        return;
      }
      selectEntity("satellite", identifier);
      setFollowTarget("satellite", identifier);
      console.log("[FOLLOW] Following satellite", noradId);
    } else {
      const icaoCallsign = convertIataToIcao(identifier);
      selectEntity("flight", icaoCallsign);
      setFollowTarget("flight", icaoCallsign);
      console.log("[FOLLOW] Following flight", icaoCallsign);
    }
    setCommandMode(false);
  }

  function handleHome(): void {
    flyTo(0, 0, 15_000_000);
    setFreeCamera();
    clearSelection();
    console.log("[NAV] Flying to Home (0°, 0°)");
    setCommandMode(false);
  }

  function handleHelp(): void {
    setShowHelp(true);
    setError("");
  }

  async function executeCommand(inputValue: string): Promise<void> {
    if (!inputValue.trim()) return;

    const cmd = parseCommand(inputValue);
    if (!cmd) {
      setError("Unknown command. Type :help");
      return;
    }

    const handlers: Record<string, () => void | Promise<void>> = {
      goto: () => handleGoto(cmd.args || ""),
      follow: () => handleFollow(cmd.args || ""),
      home: handleHome,
      help: handleHelp,
    };
    await handlers[cmd.type]?.();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      executeCommand(input());
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCommandMode(false);
    } else {
      // Clear error on typing
      setError("");
      setShowHelp(false);
    }
  }

  function handleClickOutside(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest(".command-bar")) {
      setCommandMode(false);
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  return (
    <Show when={ui.commandMode}>
      <div
        class="command-bar visible"
        classList={{
          loading: loading(),
          error: !!error() && !showHelp(),
        }}
      >
        <span class="command-bar-prefix">:</span>
        <input
          ref={inputRef}
          type="text"
          class="command-bar-input"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder=""
        />
        <Show when={loading()}>
          <span class="command-bar-loading visible">SEARCHING...</span>
        </Show>
        <Show when={error() && !showHelp()}>
          <div class="command-bar-error">{error()}</div>
        </Show>
        <Show when={showHelp()}>
          <div class="command-bar-error" style={{ "text-align": "left" }}>
            <div style={{ "margin-bottom": "4px" }}>Commands:</div>
            <div style={{ "padding-left": "8px" }}>
              :goto &lt;place|zip|coords|airport&gt; - Navigate to location
            </div>
            <div style={{ "padding-left": "8px" }}>
              :follow &lt;id&gt; - Follow satellite (NORAD ID) or flight (callsign)
            </div>
            <div style={{ "padding-left": "24px", "font-size": "0.9em", opacity: "0.8" }}>
              Examples: :follow 25544, :follow UAL123, :follow AA100
            </div>
            <div style={{ "padding-left": "8px" }}>:home - Reset camera view</div>
            <div style={{ "padding-left": "8px" }}>:help - Show this help</div>
          </div>
        </Show>
      </div>
    </Show>
  );
}

export default CommandBar;
