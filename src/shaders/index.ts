/**
 * WorldView - Shader System Exports
 * 
 * Exports the SolidJS reactive shader system and shader configurations.
 * The old ShaderManager class has been replaced by ShaderSystem.tsx.
 */

// Re-export types
export type { ViewMode, ShaderConfig, ShaderManagerInterface, ParameterMapping } from "./types.ts";
export { PARAMETER_MAPPINGS, createMutableShaderConfig } from "./types.ts";

// Re-export shader configs
export { CRT_DEFAULTS, createCRTConfig } from "./crt.ts";
export { NVG_DEFAULTS, createNVGConfig } from "./nvg.ts";
export { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";
export { AH64_DEFAULTS, createAH64Config, setAH64Viewer } from "./ah64.ts";
export { createNormalConfig } from "./normal.ts";

// Re-export reactive SolidJS shader system
export { useShaderSystem, ShaderSystem } from "./ShaderSystem.tsx";
