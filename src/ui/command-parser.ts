/**
 * WorldView - Command Parser
 * Parses vim-style command strings into structured command objects
 */

/** Parsed command structure */
export interface ParsedCommand {
  type: "goto" | "home" | "help";
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
  "goto": { type: "goto", prefixLen: 4, hasArgs: true },
  "go": { type: "goto", prefixLen: 2, hasArgs: true },
  "home": { type: "home", prefixLen: 4, hasArgs: false },
  "help": { type: "help", prefixLen: 4, hasArgs: false },
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
    // For commands with args, return empty string args
    // For commands without args, don't include args property
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
