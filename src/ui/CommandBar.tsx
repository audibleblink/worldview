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
import { PROXY_BASE_URL } from "../config";

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");

// ============================================
// Command Parser (from command-parser.ts)
// ============================================

/** Parsed command structure */
export interface ParsedCommand {
  type: "goto" | "home" | "help" | "follow";
  args?: string;
}

/** Command definition with prefix and argument extraction */
interface CommandDef {
  type: ParsedCommand["type"];
  prefixLen: number;
  /** Whether this command accepts arguments */
  hasArgs: boolean;
}

/** Command lookup table - maps command prefixes to their definitions */
const COMMANDS: Record<string, CommandDef> = {
  goto: { type: "goto", prefixLen: 4, hasArgs: true },
  go: { type: "goto", prefixLen: 2, hasArgs: true },
  follow: { type: "follow", prefixLen: 6, hasArgs: true },
  home: { type: "home", prefixLen: 4, hasArgs: false },
  help: { type: "help", prefixLen: 4, hasArgs: false },
  "?": { type: "help", prefixLen: 1, hasArgs: false },
};

/**
 * Parse a command string into a structured command object
 * Supports: goto/go <location>, home, help/?
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Check exact matches first (for commands without args)
  const exactMatch = COMMANDS[lower];
  if (exactMatch) {
    return exactMatch.hasArgs
      ? { type: exactMatch.type, args: "" }
      : { type: exactMatch.type };
  }

  // Check prefix matches (for commands with args like "goto austin")
  for (const [cmd, def] of Object.entries(COMMANDS)) {
    if (lower.startsWith(cmd + " ")) {
      const args = trimmed.slice(def.prefixLen).trim();
      return { type: def.type, args };
    }
  }

  return null; // Unknown command
}

/** Identifier type for follow command */
export type IdentifierType = "satellite" | "flight";

/**
 * Detect whether an identifier is a satellite NORAD ID or a flight callsign
 * - Satellite: 1-5 digits only (NORAD IDs are max 5 digits)
 * - Flight: alphanumeric or 6+ digits
 */
export function detectIdentifierType(identifier: string): IdentifierType {
  // NORAD IDs are 1-5 digit numbers only
  if (/^\d{1,5}$/.test(identifier)) {
    return "satellite";
  }
  return "flight";
}

// ============================================
// IATA to ICAO conversion (simplified)
// ============================================

const IATA_TO_ICAO: Record<string, string> = {
  AA: "AAL", UA: "UAL", DL: "DAL", WN: "SWA", AS: "ASA",
  B6: "JBU", NK: "NKS", F9: "FFT", G4: "AAY", HA: "HAL",
  AC: "ACA", WS: "WJA", AM: "AMX", BA: "BAW", LH: "DLH",
  AF: "AFR", KL: "KLM", IB: "IBE", AY: "FIN", SK: "SAS",
  LX: "SWR", OS: "AUA", TP: "TAP", TK: "THY", EI: "EIN",
  VS: "VIR", EK: "UAE", QR: "QTR", EY: "ETD", QF: "QFA",
  NZ: "ANZ", SQ: "SIA", CX: "CPA", JL: "JAL", NH: "ANA",
  KE: "KAL", OZ: "AAR", CI: "CAL", BR: "EVA", CA: "CCA",
  MU: "CES", CZ: "CSN", AI: "AIC", LA: "LAN", AV: "AVA",
};

function convertIataToIcao(callsign: string): string {
  const upper = callsign.toUpperCase();
  if (/^[A-Z]{3}\d/.test(upper)) return callsign;
  
  const match = upper.match(/^([A-Z0-9]{2})(\d+.*)$/);
  if (match) {
    const iataCode = match[1];
    const flightNumber = match[2];
    if (iataCode && flightNumber) {
      const icaoCode = IATA_TO_ICAO[iataCode];
      if (icaoCode) return icaoCode + flightNumber;
    }
  }
  return callsign;
}

// ============================================
// Geocoding (inline from geocoder.ts)
// ============================================

interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  type: "country" | "region" | "city" | "address" | "poi" | "coords" | "airport";
}

// Airport database - loaded dynamically
let airports: Record<string, { name: string; lat: number; lng: number }> = {};
let airportsLoaded = false;

async function loadAirports(): Promise<void> {
  if (airportsLoaded) return;
  try {
    const response = await fetch('/src/data/airports.json');
    airports = await response.json();
    airportsLoaded = true;
  } catch (e) {
    console.error('Failed to load airports database:', e);
  }
}

// Initialize airports on module load
loadAirports();

// Coordinate parsing patterns
const DECIMAL_WITH_COMMA = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
const DECIMAL_WITH_DIRECTION = /^(\d+\.?\d*)\s*([NS])\s*,?\s*(\d+\.?\d*)\s*([EW])$/i;
const SIGNED_DECIMAL_NO_COMMA = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  let match = trimmed.match(DECIMAL_WITH_COMMA);
  if (match && match[1] && match[2]) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  match = trimmed.match(DECIMAL_WITH_DIRECTION);
  if (match && match[1] && match[2] && match[3] && match[4]) {
    let lat = parseFloat(match[1]);
    let lng = parseFloat(match[3]);
    if (match[2].toUpperCase() === "S") lat = -lat;
    if (match[4].toUpperCase() === "W") lng = -lng;
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  match = trimmed.match(SIGNED_DECIMAL_NO_COMMA);
  if (match && match[1] && match[2]) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

function lookupAirport(code: string): { lat: number; lng: number; name: string } | null {
  const upperCode = code.trim().toUpperCase();
  const airport = airports[upperCode];
  return airport ? { lat: airport.lat, lng: airport.lng, name: airport.name } : null;
}

function mapGoogleTypeToGeoType(types: string[]): GeoResult["type"] {
  for (const type of types) {
    switch (type) {
      case "country": return "country";
      case "administrative_area_level_1": return "region";
      case "locality":
      case "postal_code":
      case "sublocality": return "city";
      case "street_address":
      case "route":
      case "premise": return "address";
      case "point_of_interest":
      case "establishment": return "poi";
    }
  }
  return "city";
}

function getAltitudeForType(type: GeoResult["type"]): number {
  switch (type) {
    case "country":
    case "region": return 500_000;
    case "city": return 50_000;
    case "address":
    case "poi": return 1_000;
    case "coords": return 10_000;
    case "airport": return 5_000;
    default: return 50_000;
  }
}

async function geocode(query: string): Promise<GeoResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const coords = parseCoordinates(trimmed);
  if (coords) {
    return { lat: coords.lat, lng: coords.lng, name: trimmed, type: "coords" };
  }

  if (/^[a-zA-Z]{3}$/.test(trimmed)) {
    const airport = lookupAirport(trimmed);
    if (airport) {
      return { lat: airport.lat, lng: airport.lng, name: airport.name, type: "airport" };
    }
  }

  try {
    const response = await fetch(`${PROXY_BASE_URL}/geocode?address=${encodeURIComponent(trimmed)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.results?.[0];
    const location = result?.geometry?.location;
    if (!data.ok || !location?.lat || !location?.lng) return null;
    return {
      lat: location.lat,
      lng: location.lng,
      name: result.formatted_address || trimmed,
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

  /**
   * Fly to a location using the Cesium viewer
   */
  function flyTo(longitude: number, latitude: number, height: number, duration = 2, pitch = -45): void {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Offset latitude south to compensate for oblique pitch looking north
    const latOffset = pitch === -90 ? 0 : (height / 111000) * Math.tan(Math.abs(pitch) * Math.PI / 180);
    
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude - latOffset, height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0,
      },
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

  /**
   * Handle goto command - geocode location and fly to it
   */
  async function handleGoto(location: string): Promise<void> {
    if (!location.trim()) {
      setError("Usage: goto <location>");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await geocode(location);

      if (!result) {
        setLoading(false);
        setError("Location not found");
        console.log("[NAV] Location not found:", location);
        return;
      }

      const altitude = getAltitudeForType(result.type);
      console.log("[NAV] Flying to", result.name);
      
      // Fly to location (flyTo takes longitude first, then latitude)
      flyTo(result.lng, result.lat, altitude);

      setLoading(false);
      setCommandMode(false);
    } catch (err) {
      setLoading(false);
      if (err instanceof Error) {
        if (err.message.includes("timeout")) {
          setError("Request timed out");
        } else if (err.message.includes("fetch")) {
          setError("Network error");
        } else {
          setError(err.message);
        }
      } else {
        setError("Unknown error");
      }
    }
  }

  /**
   * Handle follow command - follow satellite or flight
   */
  async function handleFollow(identifier: string): Promise<void> {
    if (!identifier.trim()) {
      setError("Usage: follow <id>");
      return;
    }

    const idType = detectIdentifierType(identifier);

    if (idType === "satellite") {
      const noradId = parseInt(identifier, 10);
      if (noradId === 0 || isNaN(noradId)) {
        setError("Invalid NORAD ID");
        return;
      }

      // Select and follow satellite
      selectEntity("satellite", identifier);
      setFollowTarget("satellite", identifier);
      console.log("[FOLLOW] Following satellite", noradId);
      setCommandMode(false);
    } else {
      // Flight - convert IATA to ICAO if needed
      const icaoCallsign = convertIataToIcao(identifier);
      
      // Select and follow flight
      selectEntity("flight", icaoCallsign);
      setFollowTarget("flight", icaoCallsign);
      console.log("[FOLLOW] Following flight", icaoCallsign);
      setCommandMode(false);
    }
  }

  /**
   * Handle home command - reset to default view
   */
  function handleHome(): void {
    // Reset to default view: 0°, 0°, 15,000km
    flyTo(0, 0, 15_000_000);
    setFreeCamera();
    clearSelection();
    console.log("[NAV] Flying to Home (0°, 0°)");
    setCommandMode(false);
  }

  /**
   * Handle help command - show available commands
   */
  function handleHelp(): void {
    setShowHelp(true);
    setError("");
  }

  /**
   * Execute a parsed command
   */
  async function executeCommand(inputValue: string): Promise<void> {
    if (!inputValue.trim()) return;

    const cmd = parseCommand(inputValue);

    if (!cmd) {
      setError("Unknown command. Type :help");
      return;
    }

    switch (cmd.type) {
      case "goto":
        await handleGoto(cmd.args || "");
        break;
      case "follow":
        await handleFollow(cmd.args || "");
        break;
      case "home":
        handleHome();
        break;
      case "help":
        handleHelp();
        break;
    }
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
