/**
 * WorldView - Shaders Store
 * Manages shader/post-processing effect state with reactive SolidJS store
 * Parameter mappings ported from src/shaders/types.ts
 */
import { createStore } from "solid-js/store";

/**
 * Available shader modes
 */
export type ShaderMode = "crt" | "nvg" | "flir" | "ah64";

/**
 * Parameter mapping definition
 */
export interface ParameterDef {
  uniform: string;
  min: number;
  max: number;
  default: number;
}

/**
 * Parameter mapping for each control type
 */
export interface ParameterMapping {
  PIXELATION: ParameterDef;
  DISTORTION: ParameterDef;
  INSTABILITY: ParameterDef;
}

/**
 * Shared FLIR parameter mapping (used by both FLIR and AH64)
 */
const FLIR_PARAMETER_MAPPING: ParameterMapping = {
  PIXELATION: { uniform: "brightness", min: 0.5, max: 1.5, default: 1.0 },
  DISTORTION: { uniform: "edgeEnhancement", min: 0, max: 1.0, default: 0.3 },
  INSTABILITY: { uniform: "contrast", min: 0.8, max: 2.0, default: 1.3 },
};

/**
 * Parameter mappings for each shader mode
 * Ported from src/shaders/types.ts PARAMETER_MAPPINGS
 */
export const PARAMETER_MAPPINGS: Record<ShaderMode, ParameterMapping> = {
  crt: {
    PIXELATION: { uniform: "scanlineIntensity", min: 0, max: 0.5, default: 0.15 },
    DISTORTION: { uniform: "barrelDistortion", min: 0, max: 0.2, default: 0.05 },
    INSTABILITY: { uniform: "flickerIntensity", min: 0, max: 0.15, default: 0.03 },
  },
  nvg: {
    PIXELATION: { uniform: "greenIntensity", min: 0.5, max: 1.5, default: 1.0 },
    DISTORTION: { uniform: "vignette", min: 0.3, max: 1.5, default: 0.8 },
    INSTABILITY: { uniform: "noiseAmount", min: 0, max: 0.25, default: 0.08 },
  },
  flir: FLIR_PARAMETER_MAPPING,
  ah64: FLIR_PARAMETER_MAPPING, // Same as FLIR - AH64 just adds reticle overlay
};

/**
 * Shader-specific parameters
 */
export type ShaderParameters = Record<string, number>;

/**
 * Get default parameters for a shader mode
 */
export function getDefaultParameters(mode: ShaderMode): ShaderParameters {
  const mapping = PARAMETER_MAPPINGS[mode];
  return {
    [mapping.PIXELATION.uniform]: mapping.PIXELATION.default,
    [mapping.DISTORTION.uniform]: mapping.DISTORTION.default,
    [mapping.INSTABILITY.uniform]: mapping.INSTABILITY.default,
  };
}

/**
 * Shader state structure
 */
export interface ShaderState {
  active: ShaderMode | null;
  intensity: number;
  parameters: ShaderParameters;
}

// Initial state with no shader active
const initialState: ShaderState = {
  active: null,
  intensity: 1.0,
  parameters: {},
};

// Create the store
const [shaders, setShaders] = createStore<ShaderState>(initialState);

// Named mutation functions (for future event-sourcing)

/**
 * Set the active shader mode
 * Also resets parameters to defaults for that mode
 */
export function setShader(mode: ShaderMode | null): void {
  if (mode === null) {
    setShaders({
      active: null,
      parameters: {},
    });
  } else {
    setShaders({
      active: mode,
      parameters: getDefaultParameters(mode),
    });
  }
}

/**
 * Set the shader intensity (0-1)
 */
export function setIntensity(intensity: number): void {
  // Clamp to valid range
  const clamped = Math.max(0, Math.min(1, intensity));
  setShaders("intensity", clamped);
}

/**
 * Set a specific parameter value
 */
export function setParameter(name: string, value: number): void {
  setShaders("parameters", name, value);
}

/**
 * Set multiple parameters at once
 */
export function setParameters(params: ShaderParameters): void {
  setShaders("parameters", params);
}

/**
 * Reset parameters to defaults for the current shader
 */
export function resetParameters(): void {
  const mode = shaders.active;
  if (mode) {
    setShaders("parameters", getDefaultParameters(mode));
  }
}

// Export readonly state and parameter mappings
export { shaders };
