/**
 * WorldView - Normal Mode Shader
 * Pass-through mode that removes all post-processing effects
 */

import type { ShaderConfig } from "./types.ts";

/**
 * Normal mode has no parameters
 */
export const NORMAL_DEFAULTS = {};

/**
 * Create Normal (pass-through) shader configuration
 * Returns null to indicate all stages should be removed
 */
export function createNormalConfig(): ShaderConfig | null {
  return null;
}
