/**
 * WorldView - Shader Types
 * TypeScript interfaces for the shader pipeline
 */

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
 * Uniform getters close over the merged object by reference,
 * so mutating it updates the uniforms (avoids stage recreation).
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
