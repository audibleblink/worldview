/**
 * WorldView - Command Bar
 * Vim-style command input bar for executing commands
 */

import { geocode, getAltitudeForType } from "../geocoder";
import { flyTo } from "../globe";
import { addLogEntry } from "./left-panel";
import { parseCommand } from "./command-parser";

// Re-export for convenience
export { parseCommand, type ParsedCommand } from "./command-parser";

export class CommandBar {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private errorDisplay: HTMLElement;
  private isVisible: boolean = false;
  private onExecute: ((command: string) => void) | null = null;
  private isExecuting: boolean = false;
  private abortController: AbortController | null = null;

  constructor() {
    // Create DOM structure
    this.container = document.createElement("div");
    this.container.className = "command-bar";

    const prefix = document.createElement("span");
    prefix.className = "command-bar-prefix";
    prefix.textContent = ":";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "command-bar-input";
    this.input.placeholder = "";

    this.errorDisplay = document.createElement("div");
    this.errorDisplay.className = "command-bar-error";

    this.container.appendChild(prefix);
    this.container.appendChild(this.input);
    this.container.appendChild(this.errorDisplay);

    // Append to document body
    document.body.appendChild(this.container);

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Keyboard handlers on input
    this.input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const value = this.input.value.trim();
        if (value && this.onExecute) {
          this.onExecute(value);
        }
        return;
      }

      // Clear error on any other keypress
      this.clearError();
    });

    // Click outside handler
    document.addEventListener("click", (event: MouseEvent) => {
      if (!this.isVisible) return;

      const target = event.target as Node;
      if (!this.container.contains(target)) {
        this.hide();
      }
    });
  }

  show(): void {
    if (this.isVisible) return;

    this.isVisible = true;
    this.container.classList.add("visible");
    this.container.classList.remove("loading", "error", "success");
    this.input.value = "";
    this.clearError();
    this.input.focus();
  }

  hide(): void {
    if (!this.isVisible) return;

    // Cancel any pending request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.isExecuting = false;
    this.isVisible = false;
    this.container.classList.remove("visible", "loading", "error", "success");
    this.input.value = "";
    this.clearError();
    this.input.blur();
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.container.classList.add("loading");
      this.container.classList.remove("error", "success");
    } else {
      this.container.classList.remove("loading");
    }
  }

  showError(message: string): void {
    this.errorDisplay.textContent = message;
    this.container.classList.add("error");
    this.container.classList.remove("loading", "success");
  }

  showSuccess(): void {
    this.container.classList.add("success");
    this.container.classList.remove("loading", "error");

    // Brief green flash, then hide
    setTimeout(() => {
      this.hide();
    }, 300);
  }

  clearError(): void {
    this.errorDisplay.textContent = "";
    this.container.classList.remove("error");
  }

  setOnExecute(callback: (command: string) => void): void {
    this.onExecute = callback;
  }

  /** Check if the command bar is currently visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /** Get the current input value */
  getValue(): string {
    return this.input.value;
  }

  /**
   * Initialize the command bar with default command execution
   * Call this after construction to wire up command handling
   */
  init(): void {
    this.setOnExecute((command) => this.executeCommand(command));
  }

  /**
   * Execute a parsed command
   */
  async executeCommand(input: string): Promise<void> {
    // Empty input - do nothing, keep bar open
    if (!input.trim()) return;

    // Prevent rapid submissions while executing
    if (this.isExecuting) return;

    const cmd = parseCommand(input);

    if (!cmd) {
      this.showError("Unknown command. Type :help");
      return;
    }

    // Handle goto with no args
    if (cmd.type === "goto" && (!cmd.args || !cmd.args.trim())) {
      this.showError("Usage: goto <location>");
      return;
    }

    switch (cmd.type) {
      case "goto":
        this.isExecuting = true;
        try {
          await this.handleGoto(cmd.args || "");
        } finally {
          this.isExecuting = false;
        }
        break;
      case "home":
        this.handleHome();
        break;
      case "help":
        this.handleHelp();
        break;
    }
  }

  /**
   * Handle goto command - geocode location and fly to it
   */
  private async handleGoto(location: string): Promise<void> {
    // Empty location - show usage
    if (!location.trim()) {
      this.showError("Usage: goto <location>");
      return;
    }

    // Cancel previous request if any
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.setLoading(true);
    this.clearError();

    try {
      const result = await geocode(location);

      // Check if we were aborted while waiting
      if (this.abortController?.signal.aborted) {
        return;
      }

      if (!result) {
        this.setLoading(false);
        this.showError("Location not found");
        addLogEntry("[NAV] Location not found: " + location, "error");
        return;
      }

      const altitude = getAltitudeForType(result.type);

      // Log to system log
      addLogEntry("[NAV] Flying to " + result.name, "info");

      // Fly to location (note: flyTo takes longitude first, then latitude)
      flyTo(result.lng, result.lat, altitude);

      this.showSuccess();
    } catch (error) {
      // Check if we were aborted - don't show error in that case
      if (this.abortController?.signal.aborted) {
        return;
      }

      this.setLoading(false);

      // Check for specific error types
      if (error instanceof Error) {
        if (error.name === "AbortError" || error.message.includes("timeout")) {
          this.showError("Request timed out");
          addLogEntry("[NAV] Request timed out for: " + location, "error");
        } else if (
          error.message.includes("network") ||
          error.message.includes("fetch") ||
          error.message.includes("Failed to fetch")
        ) {
          this.showError("Network error");
          addLogEntry("[NAV] Network error for: " + location, "error");
        } else {
          this.showError("Error: " + error.message);
        }
      } else {
        this.showError("Network error");
        addLogEntry("[NAV] Network error for: " + location, "error");
      }
    }
  }

  /**
   * Handle home command - reset to default view
   */
  private handleHome(): void {
    // Reset to default view: 0°, 0°, 15,000km
    flyTo(0, 0, 15_000_000); // 15,000 km in meters
    addLogEntry("[NAV] Flying to Home (0°, 0°)", "info");
    this.showSuccess();
  }

  /**
   * Handle help command - show available commands
   */
  private handleHelp(): void {
    // Show help in error display area (repurposed for info)
    this.showHelpText();
  }

  /**
   * Display help text in the command bar
   */
  private showHelpText(): void {
    // Show help in the error display area
    this.errorDisplay.textContent =
      "Commands: goto <location>, home, help";
    this.container.classList.remove("error", "loading", "success");
    // Don't auto-hide - let user read and dismiss with Escape
  }
}
