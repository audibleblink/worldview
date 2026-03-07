/**
 * WorldView - Night Vision Goggles (NVG) Shader
 * Simulates Gen 3 night vision with phosphor green display,
 * film grain noise, circular vignette, and bloom on bright areas
 */

import type { ShaderConfig } from "./types.ts";

/**
 * Default NVG effect parameters
 */
export const NVG_DEFAULTS = {
  greenIntensity: 1.0,
  noiseAmount: 0.08,
  vignette: 0.8,
  bloom: 0.4,
  brightness: 1.3,
  contrast: 1.2,
  scanlines: 0.05,
};

/**
 * NVG fragment shader (GLSL ES 1.00)
 * Phosphor green: #00ff00 / rgb(0, 1, 0)
 */
const NVG_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;
uniform float czm_frameNumber;

// Effect parameters
uniform float greenIntensity;
uniform float noiseAmount;
uniform float vignette;
uniform float bloom;
uniform float brightness;
uniform float contrast;
uniform float scanlines;

in vec2 v_textureCoordinates;

// Pseudo-random noise function
float random(vec2 st, float seed) {
  return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Film grain noise
float filmGrain(vec2 uv, float time) {
  float noise = random(uv * colorTextureDimensions, time);
  // Add temporal variation for animated grain
  noise += random(uv * colorTextureDimensions * 0.5, time + 1.0) * 0.5;
  noise += random(uv * colorTextureDimensions * 2.0, time + 2.0) * 0.25;
  return (noise / 1.75) * 2.0 - 1.0; // Normalize to -1 to 1
}

// Circular vignette for tube view simulation
float circularVignette(vec2 uv, float intensity) {
  vec2 center = uv - 0.5;
  float dist = length(center) * 2.0; // Distance from center, 0-1 at edges
  
  // Sharp circular falloff simulating NVG tube
  float vig = 1.0 - smoothstep(0.6, 1.0, dist * intensity);
  
  // Extra darkness at the very edges
  vig *= 1.0 - pow(dist * intensity, 4.0);
  
  return clamp(vig, 0.0, 1.0);
}

// Simple blur for bloom effect
vec3 blurSample(sampler2D tex, vec2 uv, vec2 texelSize) {
  vec3 sum = vec3(0.0);
  
  // 9-tap box blur
  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * texelSize * 3.0;
      sum += texture(tex, uv + offset).rgb;
    }
  }
  
  return sum / 9.0;
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 texelSize = 1.0 / colorTextureDimensions;
  float time = czm_frameNumber * 0.1;
  
  // Sample the original color
  vec4 original = texture(colorTexture, uv);
  
  // Convert to luminance (grayscale)
  float luminance = dot(original.rgb, vec3(0.299, 0.587, 0.114));
  
  // Apply contrast enhancement
  luminance = (luminance - 0.5) * contrast + 0.5;
  
  // Apply brightness
  luminance *= brightness;
  
  // Bloom effect on bright areas
  vec3 blurred = blurSample(colorTexture, uv, texelSize);
  float blurLum = dot(blurred, vec3(0.299, 0.587, 0.114));
  
  // Threshold bloom to bright areas only
  float bloomMask = smoothstep(0.4, 0.8, blurLum);
  luminance += blurLum * bloom * bloomMask;
  
  // Add film grain noise (animated)
  float grain = filmGrain(uv, time) * noiseAmount;
  luminance += grain;
  
  // Apply scanlines (subtle horizontal lines)
  float scanline = sin(uv.y * colorTextureDimensions.y * 1.5) * 0.5 + 0.5;
  luminance *= 1.0 - (scanlines * (1.0 - scanline));
  
  // Convert to phosphor green
  // Classic NVG phosphor green with slight color variation
  vec3 phosphorGreen = vec3(0.05, 1.0, 0.15) * greenIntensity;
  vec3 color = vec3(luminance) * phosphorGreen;
  
  // Apply circular vignette (tube view)
  float vig = circularVignette(uv, vignette);
  color *= vig;
  
  // Add subtle green tint to the vignette edges
  color += vec3(0.0, 0.02, 0.0) * (1.0 - vig) * vig;
  
  out_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/**
 * Create NVG shader configuration
 */
export function createNVGConfig(params: Partial<typeof NVG_DEFAULTS> = {}): ShaderConfig {
  const p = { ...NVG_DEFAULTS, ...params };
  
  return {
    fragmentShader: NVG_FRAGMENT_SHADER,
    uniforms: {
      greenIntensity: () => p.greenIntensity,
      noiseAmount: () => p.noiseAmount,
      vignette: () => p.vignette,
      bloom: () => p.bloom,
      brightness: () => p.brightness,
      contrast: () => p.contrast,
      scanlines: () => p.scanlines,
    },
    parameters: p,
  };
}
