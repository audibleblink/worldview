/**
 * WorldView - Reactive Shader System
 *
 * SolidJS reactive shader management system that integrates with the
 * shaders store and Cesium PostProcessStage API.
 *
 * Key features:
 * - Reactive shader switching based on store state
 * - Crossfade transitions between shader modes (300ms)
 * - Direct uniform mutation for parameter changes (Blocklist #9)
 * - Proper cleanup on unmount
 */

import { createEffect, onCleanup, on } from "solid-js";
import { useCesium } from "../cesium/useCesium";
import { shaders, type ShaderMode } from "../stores/shaders";
import { createCRTConfig, CRT_DEFAULTS } from "./crt";
import { createNVGConfig, NVG_DEFAULTS } from "./nvg";
import { createFLIRConfig, FLIR_DEFAULTS } from "./flir";
import { createAH64Config, AH64_DEFAULTS, setAH64Viewer } from "./ah64";
import type { ShaderConfig } from "./types";

declare const Cesium: typeof import("cesium");

type PostProcessStage = import("cesium").PostProcessStage;
type Viewer = import("cesium").Viewer;

/** Transition duration in milliseconds */
const TRANSITION_DURATION = 300;

/** Default parameters for each shader mode */
const MODE_DEFAULTS: Record<ShaderMode, Record<string, number>> = {
  crt: CRT_DEFAULTS,
  nvg: NVG_DEFAULTS,
  flir: FLIR_DEFAULTS,
  ah64: AH64_DEFAULTS,
};

interface TransitionState {
  fromStage: PostProcessStage | null;
  toStage: PostProcessStage | null;
  startTime: number;
  rafId: number;
}

/**
 * Create a fadeable version of a shader by adding u_fadeIntensity uniform.
 * The shader will mix between pass-through and effect based on intensity.
 */
function createFadeableShader(originalShader: string): string {
  const uniformDecl = "uniform float u_fadeIntensity;\n";

  const modifiedShader = originalShader
    .replace(
      "uniform sampler2D colorTexture;",
      "uniform sampler2D colorTexture;\n" + uniformDecl
    )
    .replace(/out_FragColor\s*=\s*vec4\(([^;]+)\);/g, (_match, content) => {
      return `{
  vec4 effectColor = vec4(${content});
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  out_FragColor = mix(originalColor, effectColor, u_fadeIntensity);
}`;
    });

  return modifiedShader;
}

/**
 * Create a shader config with live uniform getters that read from a mutable
 * parameters object. This ensures parameter changes update uniforms without
 * recreating the PostProcessStage (Blocklist #9).
 */
function createLiveShaderConfig(
  mode: ShaderMode,
  liveParams: Record<string, number>
): ShaderConfig | null {
  // Get the base config from the factory
  const defaults = MODE_DEFAULTS[mode];

  // Initialize liveParams with defaults if empty
  for (const key in defaults) {
    if (!(key in liveParams)) {
      const defaultValue = defaults[key];
      if (defaultValue !== undefined) {
        liveParams[key] = defaultValue;
      }
    }
  }

  // Create config based on mode
  switch (mode) {
    case "crt": {
      const config = createCRTConfig(liveParams);
      // Replace uniform getters with live readers
      return createLiveUniforms(config, liveParams);
    }
    case "nvg": {
      const config = createNVGConfig(liveParams);
      return createLiveUniforms(config, liveParams);
    }
    case "flir": {
      const config = createFLIRConfig(liveParams);
      return createLiveUniforms(config, liveParams);
    }
    case "ah64": {
      const config = createAH64Config(liveParams);
      // AH64 has special uniforms (u_headingDeg), so handle carefully
      return createLiveUniforms(config, liveParams);
    }
    default:
      return null;
  }
}

/**
 * Replace static uniform getters with live readers from the mutable params object
 */
function createLiveUniforms(
  config: ShaderConfig,
  liveParams: Record<string, number>
): ShaderConfig {
  const liveUniforms: Record<string, () => number | number[] | boolean> = {};

  for (const key in config.uniforms) {
    const originalGetter = config.uniforms[key];
    if (key in liveParams) {
      // Create a getter that reads from liveParams at call time
      liveUniforms[key] = () => liveParams[key] ?? 0;
    } else if (originalGetter) {
      // Keep original getter for non-parameter uniforms (e.g., u_headingDeg)
      liveUniforms[key] = originalGetter;
    }
  }

  return {
    ...config,
    uniforms: liveUniforms,
  };
}

/**
 * useShaderSystem - Reactive hook for managing post-process shaders
 *
 * Must be used within a CesiumProvider. Watches the shaders store
 * and applies/removes PostProcessStages reactively.
 *
 * Usage:
 * ```tsx
 * function App() {
 *   useShaderSystem();
 *   return <div>...</div>;
 * }
 * ```
 */
export function useShaderSystem(): void {
  const { viewer, ready } = useCesium();

  // Track current stage for cleanup and uniform updates
  let currentStage: PostProcessStage | null = null;
  let currentMode: ShaderMode | null = null;
  let transition: TransitionState | null = null;

  // Mutable parameters object - updated in place, read by uniform getters
  // This is the key to avoiding stage recreation (Blocklist #9)
  const liveParams: Record<string, number> = {};

  /**
   * Sync store parameters to liveParams object
   */
  function syncParameters(): void {
    const mode = shaders.active;
    if (!mode) return;

    const defaults = MODE_DEFAULTS[mode];
    const storeParams = shaders.parameters;

    // Update liveParams in place (mutation, not replacement)
    for (const key in defaults) {
      const defaultValue = defaults[key];
      const storeValue = storeParams[key];
      liveParams[key] = storeValue ?? defaultValue ?? 0;
    }
  }

  /**
   * Get shader config for a mode using liveParams
   */
  function getShaderConfig(mode: ShaderMode): ShaderConfig | null {
    syncParameters();
    return createLiveShaderConfig(mode, liveParams);
  }

  /**
   * Create a fadeable post-process stage for transitions
   */
  function createFadeableStage(
    config: ShaderConfig,
    getIntensity: () => number
  ): PostProcessStage {
    return new Cesium.PostProcessStage({
      fragmentShader: createFadeableShader(config.fragmentShader),
      uniforms: {
        ...config.uniforms,
        u_fadeIntensity: getIntensity,
      },
    });
  }

  /**
   * Complete a transition, cleaning up temporary stages
   */
  function completeTransition(v: Viewer, toMode: ShaderMode | null): void {
    if (!transition) return;

    const { fromStage, toStage } = transition;

    // Remove transition stages
    if (fromStage) {
      v.scene.postProcessStages.remove(fromStage);
    }
    if (toStage) {
      v.scene.postProcessStages.remove(toStage);
    }

    // Create final stage without fade uniforms
    if (toMode) {
      const finalConfig = getShaderConfig(toMode);
      if (finalConfig) {
        currentStage = new Cesium.PostProcessStage({
          fragmentShader: finalConfig.fragmentShader,
          uniforms: finalConfig.uniforms,
        });
        v.scene.postProcessStages.add(currentStage);
      }
    } else {
      currentStage = null;
    }

    currentMode = toMode;
    transition = null;
  }

  /**
   * Cancel an in-progress transition
   */
  function cancelTransition(v: Viewer): void {
    if (!transition) return;

    const { rafId, fromStage, toStage } = transition;

    cancelAnimationFrame(rafId);

    if (fromStage) {
      v.scene.postProcessStages.remove(fromStage);
    }
    if (toStage) {
      v.scene.postProcessStages.remove(toStage);
    }

    transition = null;
  }

  /**
   * Start a crossfade transition between two shader modes
   */
  function startTransition(
    v: Viewer,
    fromMode: ShaderMode | null,
    toMode: ShaderMode | null
  ): void {
    const startTime = performance.now();
    let blendFactor = 0;

    // Get configs
    const fromConfig = fromMode ? getShaderConfig(fromMode) : null;
    const toConfig = toMode ? getShaderConfig(toMode) : null;

    // If both are null, nothing to do
    if (!fromConfig && !toConfig) {
      currentMode = null;
      currentStage = null;
      return;
    }

    // Create fade stages for non-null modes
    const fromStage = fromConfig
      ? createFadeableStage(fromConfig, () => 1 - blendFactor)
      : null;
    const toStage = toConfig
      ? createFadeableStage(toConfig, () => blendFactor)
      : null;

    // Add stages to scene
    if (fromStage) v.scene.postProcessStages.add(fromStage);
    if (toStage) v.scene.postProcessStages.add(toStage);

    // Remove existing current stage
    if (currentStage) {
      v.scene.postProcessStages.remove(currentStage);
      currentStage = null;
    }

    // Animation loop with easing
    const animate = () => {
      const progress = Math.min(
        (performance.now() - startTime) / TRANSITION_DURATION,
        1
      );

      // Ease-in-out quadratic
      blendFactor =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (progress < 1) {
        transition!.rafId = requestAnimationFrame(animate);
      } else {
        completeTransition(v, toMode);
      }
    };

    transition = {
      fromStage,
      toStage,
      startTime,
      rafId: requestAnimationFrame(animate),
    };
  }

  // Effect: Watch for shader mode changes
  createEffect(
    on(
      () => shaders.active,
      (newMode) => {
        if (!ready()) return;
        const v = viewer();
        if (!v || v.isDestroyed()) return;

        // Set AH64 viewer reference if needed
        if (newMode === "ah64") {
          setAH64Viewer(v);
        }

        // If already in this mode and no transition, skip
        if (currentMode === newMode && !transition) {
          return;
        }

        // Cancel any in-progress transition
        if (transition) {
          cancelTransition(v);
        }

        // Instant switch for initial load or if no current shader
        if (currentMode === null && newMode === null) {
          return;
        }

        // Start crossfade transition
        startTransition(v, currentMode, newMode);
      }
    )
  );

  // Effect: Watch for parameter changes - mutate liveParams in place (Blocklist #9)
  // The uniform getters read from liveParams, so this triggers visual updates
  // without recreating the PostProcessStage
  createEffect(
    on(
      () => ({ ...shaders.parameters }),
      () => {
        // Skip if no active shader or during transition
        if (!shaders.active || transition) return;

        // Sync store params to liveParams (mutation in place)
        syncParameters();

        // The uniform getters in currentStage already read from liveParams,
        // so no further action needed - Cesium will read updated values next frame
      },
      { defer: true }
    )
  );

  // Effect: Watch for intensity changes
  createEffect(
    on(
      () => shaders.intensity,
      (intensity) => {
        if (!currentStage || transition || !shaders.active) return;

        // Apply intensity as a multiplier to relevant parameters
        // This modifies liveParams which the uniform getters read
        const mode = shaders.active;
        const defaults = MODE_DEFAULTS[mode];

        // Helper to safely get parameter value
        const getParam = (key: string): number => {
          return shaders.parameters[key] ?? defaults[key] ?? 0;
        };

        // Scale key visual parameters by intensity
        // Each shader has different primary effect parameters
        switch (mode) {
          case "crt":
            liveParams.scanlineIntensity = getParam("scanlineIntensity") * intensity;
            liveParams.chromaticAberration = getParam("chromaticAberration") * intensity;
            liveParams.bloomIntensity = getParam("bloomIntensity") * intensity;
            break;

          case "nvg":
            liveParams.noiseAmount = getParam("noiseAmount") * intensity;
            liveParams.bloom = getParam("bloom") * intensity;
            liveParams.scanlines = getParam("scanlines") * intensity;
            break;

          case "flir":
          case "ah64":
            liveParams.edgeEnhancement = getParam("edgeEnhancement") * intensity;
            break;
        }
      },
      { defer: true }
    )
  );

  // Cleanup on unmount
  onCleanup(() => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    // Cancel any running transition
    if (transition) {
      cancelTransition(v);
    }

    // Remove current stage
    if (currentStage) {
      v.scene.postProcessStages.remove(currentStage);
      currentStage = null;
    }

    // Clear AH64 viewer reference
    setAH64Viewer(null);

    currentMode = null;
  });
}

/**
 * ShaderSystem component - Alternative to hook for component-based usage
 *
 * Usage:
 * ```tsx
 * <CesiumProvider>
 *   <ShaderSystem />
 *   <App />
 * </CesiumProvider>
 * ```
 */
export function ShaderSystem(): null {
  useShaderSystem();
  return null;
}

export default ShaderSystem;
