/**
 * WorldView - Command Parser
 * Parses vim-style command strings into structured command objects
 */

/** Parsed command structure */
export interface ParsedCommand {
  type: "goto" | "home" | "help";
  args?: string;
}

/**
 * Parse a command string into a structured command object
 * Supports: goto/go <location>, home, help/?
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim().toLowerCase();

  // Handle "goto <location>" or "go <location>"
  if (trimmed.startsWith("goto ")) {
    return { type: "goto", args: input.trim().slice(5).trim() };
  }
  if (trimmed.startsWith("go ")) {
    return { type: "goto", args: input.trim().slice(3).trim() };
  }

  // Handle "home"
  if (trimmed === "home") {
    return { type: "home" };
  }

  // Handle "help" or "?"
  if (trimmed === "help" || trimmed === "?") {
    return { type: "help" };
  }

  return null; // Unknown command
}
