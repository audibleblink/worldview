/**
 * WorldView - Shader Types
 * TypeScript interfaces for the shader pipeline
 */

// Use global Cesium type
type Viewer = import("cesium").Viewer;
type PostProcessStage = import("cesium").PostProcessStage;

/**
 * Available view modes for the globe visualization
 */
export type ViewMode = "NORMAL" | "CRT" | "NVG" | "FLIR" | "AH64";

/**
 * Uniform values that can be passed to shaders
 */
export type UniformValue = number | number[] | boolean;

/**
 * Configuration for a shader effect
 */
export interface ShaderConfig {
  /** GLSL fragment shader source code */
  fragmentShader: string;
  /** Uniform values for the shader */
  uniforms: Record<string, () => UniformValue>;
  /** Default parameter values for UI controls */
  parameters: Record<string, number>;
}

/**
 * Create a ShaderConfig from a fragment shader and parameters.
 * Automatically generates uniform getters from the parameters object.
 */
export function createShaderConfig<T extends Record<string, number>>(
  fragmentShader: string,
  defaults: T,
  params: Partial<T> = {}
): ShaderConfig {
  const merged = { ...defaults, ...params };
  const uniforms: Record<string, () => number> = {};
  
  for (const key in merged) {
    uniforms[key] = () => merged[key];
  }
  
  return { fragmentShader, uniforms, parameters: merged };
}

/**
 * Interface for the ShaderManager
 */
export interface ShaderManagerInterface {
  /** Initialize the shader manager with a Cesium viewer */
  init(viewer: Viewer): void;
  /** Set the current view mode */
  setMode(mode: ViewMode): void;
  /** Get the current view mode */
  getMode(): ViewMode;
  /** Dispose of all shader resources */
  dispose(): void;
  /** Get the current PostProcessStage if any */
  getCurrentStage(): PostProcessStage | null;
  /** Set a parameter value for the current mode */
  setParameter(param: string, value: number): void;
  /** Get parameters for the current mode */
  getParameters(): Record<string, number>;
  /** Subscribe to mode change events */
  onModeChange(callback: (mode: ViewMode) => void): () => void;
}

/**
 * Parameter mapping for generic sliders to mode-specific uniforms
 * Maps: PIXELATION, DISTORTION, INSTABILITY to shader uniforms
 */
export interface ParameterMapping {
  /** Slider name -> { uniform name, min value, max value, default value } */
  PIXELATION: { uniform: string; min: number; max: number; default: number };
  DISTORTION: { uniform: string; min: number; max: number; default: number };
  INSTABILITY: { uniform: string; min: number; max: number; default: number };
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
 */
export const PARAMETER_MAPPINGS: Record<Exclude<ViewMode, "NORMAL">, ParameterMapping> = {
  CRT: {
    PIXELATION: { uniform: "scanlineIntensity", min: 0, max: 0.5, default: 0.15 },
    DISTORTION: { uniform: "barrelDistortion", min: 0, max: 0.2, default: 0.05 },
    INSTABILITY: { uniform: "flickerIntensity", min: 0, max: 0.15, default: 0.03 },
  },
  NVG: {
    PIXELATION: { uniform: "greenIntensity", min: 0.5, max: 1.5, default: 1.0 },
    DISTORTION: { uniform: "vignette", min: 0.3, max: 1.5, default: 0.8 },
    INSTABILITY: { uniform: "noiseAmount", min: 0, max: 0.25, default: 0.08 },
  },
  FLIR: FLIR_PARAMETER_MAPPING,
  AH64: FLIR_PARAMETER_MAPPING, // Same as FLIR - AH64 just adds reticle overlay
};
