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
export type ViewMode = "NORMAL" | "CRT" | "NVG" | "FLIR" | "ANIME" | "NAVI";

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
}
