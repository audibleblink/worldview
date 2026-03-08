/**
 * WorldView - Shader Manager
 * Manages post-processing shader effects for the CesiumJS viewer
 * Includes crossfade transitions between shader modes
 */

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");

import type { ViewMode, ShaderConfig, ShaderManagerInterface, ParameterMapping } from "./types.ts";
import { PARAMETER_MAPPINGS } from "./types.ts";
import { createCRTConfig, CRT_DEFAULTS } from "./crt.ts";
import { createNormalConfig } from "./normal.ts";
import { createNVGConfig, NVG_DEFAULTS } from "./nvg.ts";
import { createFLIRConfig, FLIR_DEFAULTS } from "./flir.ts";
import { createAnimeConfig, ANIME_DEFAULTS } from "./anime.ts";

// Re-export types
export type { ViewMode, ShaderConfig, ShaderManagerInterface, ParameterMapping } from "./types.ts";
export { PARAMETER_MAPPINGS } from "./types.ts";
export { CRT_DEFAULTS, createCRTConfig } from "./crt.ts";
export { NVG_DEFAULTS, createNVGConfig } from "./nvg.ts";
export { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";
export { ANIME_DEFAULTS, createAnimeConfig } from "./anime.ts";

type Viewer = import("cesium").Viewer;
type PostProcessStage = import("cesium").PostProcessStage;

/** Transition duration in milliseconds */
const TRANSITION_DURATION = 300;

/** localStorage key for persisting shader state */
const STORAGE_KEY = "worldview-shader-state";

/** Default parameters for each shader mode */
const MODE_DEFAULTS: Record<ViewMode, Record<string, number>> = {
  CRT: CRT_DEFAULTS,
  NVG: NVG_DEFAULTS,
  FLIR: FLIR_DEFAULTS,
  ANIME: ANIME_DEFAULTS,
  NORMAL: {},
  NAVI: {},
};

/** Shader config factory for each mode */
type ShaderConfigFactory = (params: Record<string, number>) => ShaderConfig | null;
const SHADER_FACTORIES: Record<ViewMode, ShaderConfigFactory> = {
  CRT: createCRTConfig,
  NVG: createNVGConfig,
  FLIR: createFLIRConfig,
  ANIME: createAnimeConfig,
  NORMAL: createNormalConfig,
  NAVI: createNormalConfig,
};

/**
 * Interface for persisted shader state
 */
interface ShaderState {
  mode: ViewMode;
  parameters: Record<ViewMode, Record<string, number>>;
}

/**
 * Interface for tracking active transitions
 */
interface TransitionState {
  fromMode: ViewMode;
  toMode: ViewMode;
  startTime: number;
  rafId: number;
  fromStage: PostProcessStage | null;
  toStage: PostProcessStage | null;
}

/**
 * ShaderManager class - manages post-processing effects with crossfade transitions
 */
class ShaderManager implements ShaderManagerInterface {
  private viewer: Viewer | null = null;
  private currentMode: ViewMode = "NORMAL";
  private currentStage: PostProcessStage | null = null;
  private transition: TransitionState | null = null;
  
  /** Store parameter values per mode */
  private modeParameters: Map<ViewMode, Record<string, number>> = new Map();
  
  /** Mode change listeners */
  private modeChangeListeners: Set<(mode: ViewMode) => void> = new Set();
  
  constructor() {
    // Initialize default parameters for each mode
    this.initializeDefaults();
  }

  /**
   * Initialize default parameters for all modes
   */
  private initializeDefaults(): void {
    for (const mode of Object.keys(MODE_DEFAULTS) as ViewMode[]) {
      this.modeParameters.set(mode, { ...MODE_DEFAULTS[mode] });
    }
  }

  /**
   * Save current state to localStorage
   */
  private saveState(): void {
    try {
      const state: ShaderState = {
        mode: this.currentMode,
        parameters: {} as Record<ViewMode, Record<string, number>>,
      };
      
      // Convert Map to plain object for JSON serialization
      for (const [mode, params] of this.modeParameters.entries()) {
        state.parameters[mode] = { ...params };
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage unavailable or quota exceeded - fail silently
    }
  }

  /**
   * Load state from localStorage
   * Returns true if state was restored, false otherwise
   */
  private loadState(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;
      
      const state: ShaderState = JSON.parse(stored);
      
      // Validate mode against known modes
      if (!state.mode || !(state.mode in MODE_DEFAULTS)) {
        return false;
      }
      
      // Restore parameters (merge with defaults to handle new parameters)
      if (state.parameters && typeof state.parameters === "object") {
        for (const mode of Object.keys(MODE_DEFAULTS) as ViewMode[]) {
          const storedParams = state.parameters[mode];
          if (storedParams && typeof storedParams === "object") {
            const defaults = this.modeParameters.get(mode) || {};
            this.modeParameters.set(mode, { ...defaults, ...storedParams });
          }
        }
      }
      
      // Restore mode
      this.currentMode = state.mode;
      return true;
    } catch {
      // Invalid JSON or other error - use defaults
      return false;
    }
  }

  /**
   * Initialize the shader manager with a Cesium viewer
   */
  init(viewer: Viewer): void {
    this.viewer = viewer;
    
    // Load persisted state before setting up shaders
    const restored = this.loadState();
    
    // If we restored a non-normal mode, apply the shader
    if (restored && this.currentMode !== "NORMAL") {
      const config = this.getShaderConfig(this.currentMode);
      if (config) {
        this.currentStage = new Cesium.PostProcessStage({
          fragmentShader: config.fragmentShader,
          uniforms: config.uniforms,
        });
        this.viewer.scene.postProcessStages.add(this.currentStage);
      }
      // Notify listeners of the restored mode
      this.notifyModeChange();
    }
  }

  /**
   * Set the current view mode with crossfade transition
   */
  setMode(mode: ViewMode): void {
    if (!this.viewer) {
      console.error("ShaderManager not initialized");
      return;
    }

    // If already in this mode and no transition, skip
    if (this.currentMode === mode && !this.transition) {
      return;
    }

    // Cancel any in-progress transition
    if (this.transition) {
      this.cancelTransition();
    }

    const fromMode = this.currentMode;
    const toMode = mode;

    // Get shader configs
    const fromConfig = this.getShaderConfig(fromMode);
    const toConfig = this.getShaderConfig(toMode);

    // If both are null (both NORMAL), just update state
    if (!fromConfig && !toConfig) {
      this.currentMode = mode;
      this.saveState();
      return;
    }

    // Start transition
    this.startTransition(fromMode, toMode, fromConfig, toConfig);
  }

  /**
   * Start a crossfade transition between two modes
   */
  private startTransition(
    fromMode: ViewMode,
    toMode: ViewMode,
    fromConfig: ShaderConfig | null,
    toConfig: ShaderConfig | null
  ): void {
    if (!this.viewer) return;

    const startTime = performance.now();
    
    // Create blend factor that we'll animate
    let blendFactor = 0;

    // Create the "from" stage with fading intensity
    let fromStage: PostProcessStage | null = null;
    if (fromConfig && fromMode !== "NORMAL") {
      // Create a modified version of the from shader that fades out
      fromStage = new Cesium.PostProcessStage({
        fragmentShader: this.createFadeableShader(fromConfig.fragmentShader),
        uniforms: {
          ...fromConfig.uniforms,
          u_fadeIntensity: () => 1 - blendFactor,
        },
      });
      this.viewer.scene.postProcessStages.add(fromStage);
    }

    // Create the "to" stage with fading in intensity
    let toStage: PostProcessStage | null = null;
    if (toConfig && toMode !== "NORMAL") {
      toStage = new Cesium.PostProcessStage({
        fragmentShader: this.createFadeableShader(toConfig.fragmentShader),
        uniforms: {
          ...toConfig.uniforms,
          u_fadeIntensity: () => blendFactor,
        },
      });
      this.viewer.scene.postProcessStages.add(toStage);
    }

    // Remove the old current stage
    this.removeCurrentStage();

    // Animation loop
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
      
      // Smooth easing (ease-in-out)
      blendFactor = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      // Request next frame if not done
      if (progress < 1) {
        this.transition!.rafId = requestAnimationFrame(animate);
      } else {
        // Transition complete
        this.completeTransition();
      }
    };

    // Store transition state
    this.transition = {
      fromMode,
      toMode,
      startTime,
      rafId: requestAnimationFrame(animate),
      fromStage,
      toStage,
    };

    // Update current mode immediately for getMode()
    this.currentMode = toMode;
    this.saveState();
  }

  /**
   * Create a fadeable version of a shader by adding u_fadeIntensity uniform
   * The shader will mix between pass-through and effect based on intensity
   */
  private createFadeableShader(originalShader: string): string {
    // Add the fade intensity uniform
    const uniformDecl = "uniform float u_fadeIntensity;\n";
    
    // Find the main function and modify the output
    // We need to mix the effect with the original color based on fade intensity
    const modifiedShader = originalShader
      .replace(
        "uniform sampler2D colorTexture;",
        "uniform sampler2D colorTexture;\n" + uniformDecl
      )
      .replace(
        /out_FragColor\s*=\s*vec4\(([^;]+)\);/g,
        (match, content) => {
          // Extract the color calculation and mix with original
          return `{
  vec4 effectColor = vec4(${content});
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  out_FragColor = mix(originalColor, effectColor, u_fadeIntensity);
}`;
        }
      );
    
    return modifiedShader;
  }

  /**
   * Complete the transition, cleaning up temporary stages
   */
  private completeTransition(): void {
    if (!this.transition || !this.viewer) return;

    const { fromStage, toStage, toMode } = this.transition;

    // Remove the from stage (it's fully faded out)
    if (fromStage) {
      this.viewer.scene.postProcessStages.remove(fromStage);
    }

    // Remove the to stage's fade wrapper and replace with final stage
    if (toStage) {
      this.viewer.scene.postProcessStages.remove(toStage);
    }

    // Create the final stage without fade uniforms
    const finalConfig = this.getShaderConfig(toMode);
    if (finalConfig) {
      this.currentStage = new Cesium.PostProcessStage({
        fragmentShader: finalConfig.fragmentShader,
        uniforms: finalConfig.uniforms,
      });
      this.viewer.scene.postProcessStages.add(this.currentStage);
    } else {
      this.currentStage = null;
    }

    this.transition = null;
    
    // Notify listeners after transition completes
    this.notifyModeChange();
  }

  /**
   * Cancel an in-progress transition
   */
  private cancelTransition(): void {
    if (!this.transition || !this.viewer) return;

    const { rafId, fromStage, toStage } = this.transition;

    // Cancel animation
    cancelAnimationFrame(rafId);

    // Remove transition stages
    if (fromStage) {
      this.viewer.scene.postProcessStages.remove(fromStage);
    }
    if (toStage) {
      this.viewer.scene.postProcessStages.remove(toStage);
    }

    this.transition = null;
  }

  /**
   * Get the current view mode
   */
  getMode(): ViewMode {
    return this.currentMode;
  }

  /**
   * Set a parameter value for the current mode
   * Updates the shader uniform in real-time
   */
  setParameter(param: string, value: number): void {
    const params = this.modeParameters.get(this.currentMode);
    if (!params) return;
    
    // Update stored value
    params[param] = value;
    
    // Update the current stage's uniform if we have one
    if (this.currentStage) {
      const uniforms = this.currentStage.uniforms as Record<string, unknown> | undefined;
      if (uniforms && param in uniforms) {
        // The uniform getter will now return the updated value
        // Since we're storing references, we need to update the stage
        this.recreateCurrentStage();
      }
    }
    
    // Persist state after parameter change
    this.saveState();
  }

  /**
   * Get parameters for the current mode
   */
  getParameters(): Record<string, number> {
    return this.modeParameters.get(this.currentMode) || {};
  }

  /**
   * Subscribe to mode change events
   * Returns unsubscribe function
   */
  onModeChange(callback: (mode: ViewMode) => void): () => void {
    this.modeChangeListeners.add(callback);
    return () => this.modeChangeListeners.delete(callback);
  }

  /**
   * Notify listeners of mode change
   */
  private notifyModeChange(): void {
    this.modeChangeListeners.forEach(cb => cb(this.currentMode));
  }

  /**
   * Recreate the current stage with updated parameters
   */
  private recreateCurrentStage(): void {
    if (!this.viewer || this.currentMode === "NORMAL") return;
    
    // Remove old stage
    if (this.currentStage) {
      this.viewer.scene.postProcessStages.remove(this.currentStage);
    }
    
    // Create new stage with current parameters
    const config = this.getShaderConfig(this.currentMode);
    if (config) {
      this.currentStage = new Cesium.PostProcessStage({
        fragmentShader: config.fragmentShader,
        uniforms: config.uniforms,
      });
      this.viewer.scene.postProcessStages.add(this.currentStage);
    }
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
    if (this.transition) {
      this.cancelTransition();
    }
    
    this.removeCurrentStage();
    this.viewer = null;
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
   * Uses stored parameters for the mode
   */
  private getShaderConfig(mode: ViewMode): ShaderConfig | null {
    const params = this.modeParameters.get(mode) || {};
    return SHADER_FACTORIES[mode](params);
  }
}

/**
 * Singleton instance of ShaderManager
 */
export const shaderManager = new ShaderManager();
