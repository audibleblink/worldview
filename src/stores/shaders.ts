/**
 * WorldView - Shaders Store
 * Manages shader/post-processing effect state with reactive SolidJS store
 * Parameter mappings ported from src/shaders/types.ts
 */
import { createStore } from "solid-js/store";

export type ShaderMode = "crt" | "nvg" | "flir" | "ah64";

export interface ParameterDef {
  uniform: string;
  min: number;
  max: number;
  default: number;
}

export interface ParameterMapping {
  PIXELATION: ParameterDef;
  DISTORTION: ParameterDef;
  INSTABILITY: ParameterDef;
}

/** Shared FLIR parameter mapping (used by both FLIR and AH64) */
const FLIR_PARAMS: ParameterMapping = {
  PIXELATION: { uniform: "brightness", min: 0.5, max: 1.5, default: 1.0 },
  DISTORTION: { uniform: "edgeEnhancement", min: 0, max: 1.0, default: 0.3 },
  INSTABILITY: { uniform: "contrast", min: 0.8, max: 2.0, default: 1.3 },
};

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
  flir: FLIR_PARAMS,
  ah64: FLIR_PARAMS, // Same as FLIR — AH64 just adds reticle overlay
};

export type ShaderParameters = Record<string, number>;

/** Build default parameter values from a shader's mapping */
export function getDefaultParameters(mode: ShaderMode): ShaderParameters {
  const m = PARAMETER_MAPPINGS[mode];
  const defs = [m.PIXELATION, m.DISTORTION, m.INSTABILITY];
  return Object.fromEntries(defs.map((d) => [d.uniform, d.default]));
}

export interface ShaderState {
  active: ShaderMode | null;
  intensity: number;
  parameters: ShaderParameters;
}

const [shaders, setShaders] = createStore<ShaderState>({
  active: null,
  intensity: 1.0,
  parameters: {},
});

// --- Mutations (named for future event-sourcing) ---

/** Activate a shader (resets params to defaults) or deactivate with null */
export function setShader(mode: ShaderMode | null): void {
  setShaders({
    active: mode,
    parameters: mode ? getDefaultParameters(mode) : {},
  });
}

/** Set shader intensity, clamped to [0, 1] */
export function setIntensity(intensity: number): void {
  setShaders("intensity", Math.max(0, Math.min(1, intensity)));
}

/** Set a specific parameter value */
export function setParameter(name: string, value: number): void {
  setShaders("parameters", name, value);
}

/** Set multiple parameters at once */
export function setParameters(params: ShaderParameters): void {
  setShaders("parameters", params);
}

/** Reset parameters to defaults for the current shader */
export function resetParameters(): void {
  if (shaders.active) {
    setShaders("parameters", getDefaultParameters(shaders.active));
  }
}

export { shaders };
