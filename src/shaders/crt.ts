/**
 * WorldView - CRT Shader
 * Retro CRT monitor effect with scanlines, chromatic aberration,
 * barrel distortion, phosphor bloom, and flicker
 */

import { createShaderConfig } from "./types.ts";

/**
 * Default CRT effect parameters
 */
export const CRT_DEFAULTS = {
  scanlineIntensity: 0.15,
  scanlinePeriod: 2.0,
  chromaticAberration: 0.002,
  barrelDistortion: 0.05,
  bloomIntensity: 0.15,
  bloomRadius: 2.0,
  flickerIntensity: 0.03,
  flickerSpeed: 8.0,
  vignetteIntensity: 0.3,
  brightness: 1.1,
  contrast: 1.1,
};

/**
 * CRT fragment shader (GLSL ES 1.00)
 */
const CRT_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;
uniform float czm_frameNumber;

// Effect parameters
uniform float scanlineIntensity;
uniform float scanlinePeriod;
uniform float chromaticAberration;
uniform float barrelDistortion;
uniform float bloomIntensity;
uniform float bloomRadius;
uniform float flickerIntensity;
uniform float flickerSpeed;
uniform float vignetteIntensity;
uniform float brightness;
uniform float contrast;

in vec2 v_textureCoordinates;

// Barrel distortion function
vec2 barrelDistort(vec2 uv, float amount) {
  vec2 center = uv - 0.5;
  float dist = dot(center, center);
  return uv + center * dist * amount;
}

// Sample with chromatic aberration
vec3 sampleChromatic(sampler2D tex, vec2 uv, float offset) {
  float r = texture(tex, uv + vec2(offset, 0.0)).r;
  float g = texture(tex, uv).g;
  float b = texture(tex, uv - vec2(offset, 0.0)).b;
  return vec3(r, g, b);
}

// Simple box blur for bloom
vec3 blur(sampler2D tex, vec2 uv, vec2 texelSize, float radius) {
  vec3 sum = vec3(0.0);
  float count = 0.0;
  
  for (float x = -2.0; x <= 2.0; x += 1.0) {
    for (float y = -2.0; y <= 2.0; y += 1.0) {
      vec2 offset = vec2(x, y) * texelSize * radius;
      sum += texture(tex, uv + offset).rgb;
      count += 1.0;
    }
  }
  
  return sum / count;
}

void main() {
  vec2 texelSize = 1.0 / colorTextureDimensions;
  
  // Apply barrel distortion
  vec2 uv = barrelDistort(v_textureCoordinates, barrelDistortion);
  
  // Check if we're outside the valid texture range after distortion
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  
  // Sample with chromatic aberration
  vec3 color = sampleChromatic(colorTexture, uv, chromaticAberration);
  
  // Add bloom effect (blur bright areas)
  vec3 blurred = blur(colorTexture, uv, texelSize, bloomRadius);
  float luminance = dot(blurred, vec3(0.299, 0.587, 0.114));
  color += blurred * bloomIntensity * luminance;
  
  // Scanlines
  float scanline = sin(uv.y * colorTextureDimensions.y * 3.14159 / scanlinePeriod);
  scanline = scanline * 0.5 + 0.5; // Normalize to 0-1
  color *= 1.0 - (scanlineIntensity * (1.0 - scanline));
  
  // Frame flicker
  float time = czm_frameNumber * 0.016667; // ~60fps to seconds
  float flicker = 1.0 + sin(time * flickerSpeed) * flickerIntensity;
  color *= flicker;
  
  // Vignette (darken edges)
  vec2 vignetteUV = uv * (1.0 - uv);
  float vignette = vignetteUV.x * vignetteUV.y * 15.0;
  vignette = pow(vignette, vignetteIntensity);
  color *= vignette;
  
  // Brightness and contrast
  color = (color - 0.5) * contrast + 0.5;
  color *= brightness;
  
  // Slight green/phosphor tint for authentic CRT look
  color *= vec3(0.95, 1.0, 0.92);
  
  out_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/**
 * Create CRT shader configuration
 */
export function createCRTConfig(params: Partial<typeof CRT_DEFAULTS> = {}) {
  return createShaderConfig(CRT_FRAGMENT_SHADER, CRT_DEFAULTS, params);
}
