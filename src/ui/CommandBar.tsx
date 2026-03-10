/**
 * WorldView - Command Bar (SolidJS)
 * Vim-style command input for navigation and control.
 * Port from src/ui/command-bar.ts + src/ui/command-parser.ts
 */

import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import { ui, setCommandMode } from "../stores/ui";
import { setFollowTarget, setFreeCamera } from "../stores/camera";
import { selectEntity, clearSelection } from "../stores/selection";
import { geocode, getAltitudeForType } from "../geocoder";
import { flyTo } from "../globe";
import { PROXY_BASE_URL } from "../config";

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
// Command Bar Component
// ============================================

export function CommandBar() {
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [showHelp, setShowHelp] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

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
