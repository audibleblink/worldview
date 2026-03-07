/**
 * WorldView - Shader Manager
 * Manages post-processing shader effects for the CesiumJS viewer
 * Includes crossfade transitions between shader modes
 */

// Use global Cesium from script tag
declare const Cesium: typeof import("cesium");

import type { ViewMode, ShaderConfig, ShaderManagerInterface } from "./types.ts";
import { createCRTConfig } from "./crt.ts";
import { createNormalConfig } from "./normal.ts";
import { createNVGConfig } from "./nvg.ts";
import { createFLIRConfig } from "./flir.ts";
import { createAnimeConfig } from "./anime.ts";

// Re-export types
export type { ViewMode, ShaderConfig, ShaderManagerInterface } from "./types.ts";
export { CRT_DEFAULTS, createCRTConfig } from "./crt.ts";
export { NVG_DEFAULTS, createNVGConfig } from "./nvg.ts";
export { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";
export { ANIME_DEFAULTS, createAnimeConfig } from "./anime.ts";

type Viewer = import("cesium").Viewer;
type PostProcessStage = import("cesium").PostProcessStage;

/** Transition duration in milliseconds */
const TRANSITION_DURATION = 300;

/**
 * Transition shader that blends two textures based on u_blend factor
 */
const TRANSITION_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform float u_blend;

in vec2 v_textureCoordinates;

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  // Blend factor controls opacity - we use this to fade between shaders
  // When u_blend = 0, full original; when u_blend = 1, full effect
  out_FragColor = color;
}
`;

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
  blendStage: PostProcessStage;
}

/**
 * ShaderManager class - manages post-processing effects with crossfade transitions
 */
class ShaderManager implements ShaderManagerInterface {
  private viewer: Viewer | null = null;
  private currentMode: ViewMode = "NORMAL";
  private currentStage: PostProcessStage | null = null;
  private transition: TransitionState | null = null;

  /**
   * Initialize the shader manager with a Cesium viewer
   */
  init(viewer: Viewer): void {
    this.viewer = viewer;
    console.log("ShaderManager initialized");
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
      console.log(`Shader mode set to: ${mode}`);
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

    // Create blend stage (simple passthrough, the fading is done in individual shaders)
    const blendStage = new Cesium.PostProcessStage({
      fragmentShader: TRANSITION_FRAGMENT_SHADER,
      uniforms: {
        u_blend: () => blendFactor,
      },
    });

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
      blendStage,
    };

    // Update current mode immediately for getMode()
    this.currentMode = toMode;
    console.log(`Transitioning from ${fromMode} to ${toMode}`);
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

    console.log(`Shader mode set to: ${toMode}`);
    this.transition = null;
  }

  /**
   * Cancel an in-progress transition
   */
  private cancelTransition(): void {
    if (!this.transition || !this.viewer) return;

    const { rafId, fromStage, toStage, blendStage } = this.transition;

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
    console.log("Transition cancelled");
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
    if (this.transition) {
      this.cancelTransition();
    }
    
    this.removeCurrentStage();
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
      case "ANIME":
        return createAnimeConfig();
      case "NORMAL":
        return createNormalConfig();
      // Placeholder for future modes
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
