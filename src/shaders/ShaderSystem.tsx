/**
 * WorldView - Reactive Shader System
 *
 * SolidJS reactive shader management that bridges the shaders store
 * to Cesium's PostProcessStage API with crossfade transitions.
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

const TRANSITION_MS = 300;

/** Shader factory and defaults per mode */
const SHADER_MODES: Record<ShaderMode, {
  factory: (params: Record<string, number>) => ShaderConfig;
  defaults: Record<string, number>;
}> = {
  crt: { factory: createCRTConfig, defaults: CRT_DEFAULTS },
  nvg: { factory: createNVGConfig, defaults: NVG_DEFAULTS },
  flir: { factory: createFLIRConfig, defaults: FLIR_DEFAULTS },
  ah64: { factory: createAH64Config, defaults: AH64_DEFAULTS },
};

/** Wrap shader with fade support: u_fadeIntensity blends between original and effect */
function wrapWithFade(shader: string): string {
  return shader
    .replace(
      "uniform sampler2D colorTexture;",
      "uniform sampler2D colorTexture;\nuniform float u_fadeIntensity;\n"
    )
    .replace(/out_FragColor\s*=\s*vec4\(([^;]+)\);/g, (_, content) => `{
  vec4 effectColor = vec4(${content});
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  out_FragColor = mix(originalColor, effectColor, u_fadeIntensity);
}`);
}

/** Create ShaderConfig with uniform getters reading from mutable liveParams */
function createLiveConfig(mode: ShaderMode, liveParams: Record<string, number>): ShaderConfig | null {
  const modeInfo = SHADER_MODES[mode];
  if (!modeInfo) return null;

  // Seed missing defaults
  for (const key in modeInfo.defaults) {
    liveParams[key] ??= modeInfo.defaults[key] ?? 0;
  }

  const config = modeInfo.factory(liveParams);

  // Rewire uniforms: parameters read from liveParams, others preserved (e.g. u_headingDeg)
  const uniforms: Record<string, () => number | number[] | boolean> = {};
  for (const key in config.uniforms) {
    uniforms[key] = key in liveParams ? () => liveParams[key] ?? 0 : config.uniforms[key]!;
  }

  return { ...config, uniforms };
}

/** Parameters that scale with intensity slider */
const INTENSITY_SCALED: Record<ShaderMode, string[]> = {
  crt: ["scanlineIntensity", "chromaticAberration", "bloomIntensity"],
  nvg: ["noiseAmount", "bloom", "scanlines"],
  flir: ["edgeEnhancement"],
  ah64: ["edgeEnhancement"],
};

/** Ease-in-out quadratic */
const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/**
 * useShaderSystem - Reactive hook for managing post-process shaders.
 * Must be used within a CesiumProvider.
 */
export function useShaderSystem(): void {
  const { viewer, ready } = useCesium();

  let currentStage: PostProcessStage | null = null;
  let currentMode: ShaderMode | null = null;
  let transitionRafId: number | null = null;
  let transitionStages: PostProcessStage[] = [];

  // Mutable params — uniform getters read from this, avoiding stage recreation
  const liveParams: Record<string, number> = {};

  /** Sync store parameters into liveParams */
  function syncParams(): void {
    const mode = shaders.active;
    if (!mode) return;
    const defaults = SHADER_MODES[mode].defaults;
    for (const key in defaults) {
      liveParams[key] = shaders.parameters[key] ?? defaults[key] ?? 0;
    }
  }

  /** Build shader config wired to liveParams */
  function getConfig(mode: ShaderMode): ShaderConfig | null {
    syncParams();
    return createLiveConfig(mode, liveParams);
  }

  /** Create PostProcessStage with fade uniform */
  function createFadingStage(config: ShaderConfig, getBlend: () => number): PostProcessStage {
    return new Cesium.PostProcessStage({
      fragmentShader: wrapWithFade(config.fragmentShader),
      uniforms: { ...config.uniforms, u_fadeIntensity: getBlend },
    });
  }

  /** Remove stage from scene */
  function removeStage(v: Viewer, stage: PostProcessStage | null): void {
    if (stage) v.scene.postProcessStages.remove(stage);
  }

  /** Cancel in-progress transition */
  function cancelTransition(v: Viewer): void {
    if (transitionRafId !== null) cancelAnimationFrame(transitionRafId);
    transitionStages.forEach(s => removeStage(v, s));
    transitionStages = [];
    transitionRafId = null;
  }

  /** Crossfade between shader modes */
  function startTransition(v: Viewer, fromMode: ShaderMode | null, toMode: ShaderMode | null): void {
    const fromConfig = fromMode ? getConfig(fromMode) : null;
    const toConfig = toMode ? getConfig(toMode) : null;

    if (!fromConfig && !toConfig) {
      currentMode = null;
      currentStage = null;
      return;
    }

    let blend = 0;
    const fromStage = fromConfig ? createFadingStage(fromConfig, () => 1 - blend) : null;
    const toStage = toConfig ? createFadingStage(toConfig, () => blend) : null;

    transitionStages = [fromStage, toStage].filter((s): s is PostProcessStage => s !== null);
    transitionStages.forEach(s => v.scene.postProcessStages.add(s));
    removeStage(v, currentStage);
    currentStage = null;

    const startTime = performance.now();
    const animate = () => {
      const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
      blend = easeInOutQuad(t);
      v.scene.requestRender();

      if (t < 1) {
        transitionRafId = requestAnimationFrame(animate);
      } else {
        // Complete: remove fade stages, install final stage
        transitionStages.forEach(s => removeStage(v, s));
        transitionStages = [];
        transitionRafId = null;

        if (toMode) {
          const config = getConfig(toMode);
          if (config) {
            currentStage = new Cesium.PostProcessStage({
              fragmentShader: config.fragmentShader,
              uniforms: config.uniforms,
            });
            v.scene.postProcessStages.add(currentStage);
          }
        }
        currentMode = toMode;
      }
    };

    transitionRafId = requestAnimationFrame(animate);
  }

  const isTransitioning = () => transitionRafId !== null;

  // Watch for shader mode changes
  createEffect(
    on(
      () => shaders.active,
      (newMode) => {
        if (!ready()) return;
        const v = viewer();
        if (!v || v.isDestroyed()) return;

        if (newMode === "ah64") setAH64Viewer(v);
        if (currentMode === newMode && !isTransitioning()) return;
        if (isTransitioning()) cancelTransition(v);
        if (currentMode === null && newMode === null) return;

        startTransition(v, currentMode, newMode);
      }
    )
  );

  // Watch for parameter changes — mutate liveParams in place
  createEffect(
    on(
      () => ({ ...shaders.parameters }),
      () => {
        if (!shaders.active || isTransitioning()) return;
        syncParams();
      },
      { defer: true }
    )
  );

  // Watch for intensity changes — scale key visual parameters
  createEffect(
    on(
      () => shaders.intensity,
      (intensity) => {
        const mode = shaders.active;
        if (!currentStage || isTransitioning() || !mode) return;

        const defaults = SHADER_MODES[mode].defaults;
        for (const key of INTENSITY_SCALED[mode]) {
          liveParams[key] = (shaders.parameters[key] ?? defaults[key] ?? 0) * intensity;
        }
      },
      { defer: true }
    )
  );

  // Cleanup on unmount
  onCleanup(() => {
    const v = viewer();
    if (!v || v.isDestroyed()) return;

    cancelTransition(v);
    removeStage(v, currentStage);
    currentStage = null;
    currentMode = null;
    setAH64Viewer(null);
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
