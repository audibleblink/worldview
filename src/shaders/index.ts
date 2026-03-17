/**
 * WorldView - Shader System Exports
 */

// Types
export type { ShaderConfig } from "./types.ts";

// Shader configs
export { CRT_DEFAULTS, createCRTConfig } from "./crt.ts";
export { NVG_DEFAULTS, createNVGConfig } from "./nvg.ts";
export { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";
export { AH64_DEFAULTS, createAH64Config, setAH64Viewer } from "./ah64.ts";

// Reactive SolidJS shader system
export { useShaderSystem, ShaderSystem } from "./ShaderSystem.tsx";
