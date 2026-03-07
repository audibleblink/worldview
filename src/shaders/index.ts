/**
 * WorldView - Shader Manager
 * Manages post-processing shader effects for the CesiumJS viewer
 */

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");

import type { ViewMode, ShaderConfig, ShaderManagerInterface } from "./types.ts";
import { createCRTConfig } from "./crt.ts";
import { createNormalConfig } from "./normal.ts";
import { createNVGConfig } from "./nvg.ts";
import { createFLIRConfig } from "./flir.ts";

// Re-export types
export type { ViewMode, ShaderConfig, ShaderManagerInterface } from "./types.ts";
export { CRT_DEFAULTS, createCRTConfig } from "./crt.ts";
export { NVG_DEFAULTS, createNVGConfig } from "./nvg.ts";
export { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";

type Viewer = import("cesium").Viewer;
type PostProcessStage = import("cesium").PostProcessStage;

/**
 * ShaderManager class - manages post-processing effects
 */
class ShaderManager implements ShaderManagerInterface {
  private viewer: Viewer | null = null;
  private currentMode: ViewMode = "NORMAL";
  private currentStage: PostProcessStage | null = null;
  private removeListener: (() => void) | null = null;

  /**
   * Initialize the shader manager with a Cesium viewer
   */
  init(viewer: Viewer): void {
    this.viewer = viewer;
    console.log("ShaderManager initialized");
  }

  /**
   * Set the current view mode
   */
  setMode(mode: ViewMode): void {
    if (!this.viewer) {
      console.error("ShaderManager not initialized");
      return;
    }

    // Remove existing stage
    this.removeCurrentStage();

    // Get shader config for the mode
    const config = this.getShaderConfig(mode);

    if (config) {
      // Create and add new post-process stage
      this.currentStage = new Cesium.PostProcessStage({
        fragmentShader: config.fragmentShader,
        uniforms: config.uniforms,
      });

      this.viewer.scene.postProcessStages.add(this.currentStage);
    }

    this.currentMode = mode;
    console.log(`Shader mode set to: ${mode}`);
  }

  /**
   * Get the current view mode
   */
  getMode(): ViewMode {
    return this.currentMode;
  }

  /**
   * Get the current PostProcessStage if any
   */
  getCurrentStage(): PostProcessStage | null {
    return this.currentStage;
  }

  /**
   * Dispose of all shader resources
   */
  dispose(): void {
    this.removeCurrentStage();

    if (this.removeListener) {
      this.removeListener();
      this.removeListener = null;
    }

    this.viewer = null;
    console.log("ShaderManager disposed");
  }

  /**
   * Remove the current post-process stage
   */
  private removeCurrentStage(): void {
    if (this.currentStage && this.viewer) {
      this.viewer.scene.postProcessStages.remove(this.currentStage);
      this.currentStage = null;
    }
  }

  /**
   * Get shader configuration for a given mode
   */
  private getShaderConfig(mode: ViewMode): ShaderConfig | null {
    switch (mode) {
      case "CRT":
        return createCRTConfig();
      case "NVG":
        return createNVGConfig();
      case "FLIR":
        return createFLIRConfig();
      case "NORMAL":
        return createNormalConfig();
      // Placeholder for future modes
      case "ANIME":
      case "NAVI":
        console.log(`Mode ${mode} not yet implemented, using NORMAL`);
        return createNormalConfig();
      default:
        return createNormalConfig();
    }
  }
}

/**
 * Singleton instance of ShaderManager
 */
export const shaderManager = new ShaderManager();
