/**
 * WorldView - FLIR (Forward Looking Infrared) Shader
 * Simulates thermal imaging with false color palettes,
 * edge enhancement, and optional targeting reticle
 */

import type { ShaderConfig } from "./types.ts";

/**
 * Palette types for thermal visualization
 * 0 = White-hot (default)
 * 1 = Black-hot
 * 2 = Iron
 * 3 = Rainbow
 */
export type FLIRPalette = 0 | 1 | 2 | 3;

/**
 * Default FLIR effect parameters
 */
export const FLIR_DEFAULTS = {
  contrast: 1.3,
  edgeEnhancement: 0.3,
  palette: 0 as number, // White-hot
  reticle: 0.0, // 0 = off, 1 = on
  brightness: 1.0,
  hotspotThreshold: 0.7,
  coldspotThreshold: 0.3,
};

/**
 * FLIR fragment shader (GLSL ES 1.00)
 */
const FLIR_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;
uniform float czm_frameNumber;

// Effect parameters
uniform float contrast;
uniform float edgeEnhancement;
uniform float palette;
uniform float reticle;
uniform float brightness;
uniform float hotspotThreshold;
uniform float coldspotThreshold;

in vec2 v_textureCoordinates;

// Convert RGB to thermal luminance
float thermalLuminance(vec3 color) {
  // Weighted luminance favoring warmer colors (red/yellow indicate heat)
  return dot(color, vec3(0.35, 0.45, 0.20));
}

// Sobel edge detection
float sobelEdge(sampler2D tex, vec2 uv, vec2 texelSize) {
  // Sobel kernels
  float tl = thermalLuminance(texture(tex, uv + vec2(-1.0, -1.0) * texelSize).rgb);
  float t  = thermalLuminance(texture(tex, uv + vec2( 0.0, -1.0) * texelSize).rgb);
  float tr = thermalLuminance(texture(tex, uv + vec2( 1.0, -1.0) * texelSize).rgb);
  float l  = thermalLuminance(texture(tex, uv + vec2(-1.0,  0.0) * texelSize).rgb);
  float r  = thermalLuminance(texture(tex, uv + vec2( 1.0,  0.0) * texelSize).rgb);
  float bl = thermalLuminance(texture(tex, uv + vec2(-1.0,  1.0) * texelSize).rgb);
  float b  = thermalLuminance(texture(tex, uv + vec2( 0.0,  1.0) * texelSize).rgb);
  float br = thermalLuminance(texture(tex, uv + vec2( 1.0,  1.0) * texelSize).rgb);
  
  // Sobel operator
  float gx = tl + 2.0*l + bl - tr - 2.0*r - br;
  float gy = tl + 2.0*t + tr - bl - 2.0*b - br;
  
  return sqrt(gx*gx + gy*gy);
}

// White-hot palette: Black -> White
vec3 paletteWhiteHot(float t) {
  return vec3(t);
}

// Black-hot palette: White -> Black
vec3 paletteBlackHot(float t) {
  return vec3(1.0 - t);
}

// Iron palette: Black -> Blue -> Purple -> Red -> Yellow -> White
vec3 paletteIron(float t) {
  vec3 color;
  if (t < 0.25) {
    // Black to Blue
    float s = t / 0.25;
    color = mix(vec3(0.0), vec3(0.0, 0.0, 0.5), s);
  } else if (t < 0.5) {
    // Blue to Purple/Red
    float s = (t - 0.25) / 0.25;
    color = mix(vec3(0.0, 0.0, 0.5), vec3(0.7, 0.0, 0.3), s);
  } else if (t < 0.75) {
    // Red to Orange/Yellow
    float s = (t - 0.5) / 0.25;
    color = mix(vec3(0.7, 0.0, 0.3), vec3(1.0, 0.7, 0.0), s);
  } else {
    // Yellow to White
    float s = (t - 0.75) / 0.25;
    color = mix(vec3(1.0, 0.7, 0.0), vec3(1.0, 1.0, 0.9), s);
  }
  return color;
}

// Rainbow palette: Blue -> Cyan -> Green -> Yellow -> Red
vec3 paletteRainbow(float t) {
  vec3 color;
  if (t < 0.2) {
    // Blue
    float s = t / 0.2;
    color = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.0, 1.0), s);
  } else if (t < 0.4) {
    // Blue to Cyan
    float s = (t - 0.2) / 0.2;
    color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), s);
  } else if (t < 0.6) {
    // Cyan to Green
    float s = (t - 0.4) / 0.2;
    color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), s);
  } else if (t < 0.8) {
    // Green to Yellow
    float s = (t - 0.6) / 0.2;
    color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), s);
  } else {
    // Yellow to Red
    float s = (t - 0.8) / 0.2;
    color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), s);
  }
  return color;
}

// Apply selected palette
vec3 applyPalette(float t, float paletteIndex) {
  // Round to nearest palette index
  int p = int(paletteIndex + 0.5);
  
  if (p == 1) {
    return paletteBlackHot(t);
  } else if (p == 2) {
    return paletteIron(t);
  } else if (p == 3) {
    return paletteRainbow(t);
  }
  // Default: white-hot
  return paletteWhiteHot(t);
}

// Draw targeting reticle
vec3 drawReticle(vec2 uv, vec3 color, float time) {
  vec2 center = vec2(0.5, 0.5);
  vec2 offset = uv - center;
  float dist = length(offset);
  
  // Reticle color (green targeting HUD style)
  vec3 reticleColor = vec3(0.0, 1.0, 0.3);
  
  // Crosshair lines
  float lineWidth = 0.002;
  float gapSize = 0.03;
  float lineLength = 0.08;
  
  // Horizontal lines
  if (abs(offset.y) < lineWidth && abs(offset.x) > gapSize && abs(offset.x) < gapSize + lineLength) {
    return reticleColor;
  }
  
  // Vertical lines
  if (abs(offset.x) < lineWidth && abs(offset.y) > gapSize && abs(offset.y) < gapSize + lineLength) {
    return reticleColor;
  }
  
  // Range circles
  float ringWidth = 0.0015;
  
  // Inner circle
  if (abs(dist - 0.05) < ringWidth) {
    return reticleColor;
  }
  
  // Middle circle
  if (abs(dist - 0.12) < ringWidth) {
    return reticleColor;
  }
  
  // Outer circle with tick marks
  if (abs(dist - 0.2) < ringWidth) {
    return reticleColor;
  }
  
  // Corner brackets at outer circle
  float angle = atan(offset.y, offset.x);
  float bracketAngle = 0.15;
  
  // Tick marks every 90 degrees
  for (float a = 0.0; a < 6.28; a += 1.5708) {
    float angleDiff = abs(mod(angle - a + 3.14159, 6.28318) - 3.14159);
    if (angleDiff < bracketAngle && abs(dist - 0.2) < ringWidth * 3.0) {
      return reticleColor;
    }
  }
  
  // Center dot (pulsing)
  float pulse = 0.5 + 0.5 * sin(time * 3.0);
  if (dist < 0.004 * (0.8 + 0.4 * pulse)) {
    return reticleColor;
  }
  
  return color;
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 texelSize = 1.0 / colorTextureDimensions;
  float time = czm_frameNumber * 0.016667;
  
  // Sample the original color
  vec4 original = texture(colorTexture, uv);
  
  // Convert to thermal luminance
  float thermal = thermalLuminance(original.rgb);
  
  // Apply contrast
  thermal = (thermal - 0.5) * contrast + 0.5;
  thermal *= brightness;
  
  // Clamp to valid range
  thermal = clamp(thermal, 0.0, 1.0);
  
  // Edge detection for enhancement
  float edge = sobelEdge(colorTexture, uv, texelSize);
  
  // Enhance edges by adding them to the thermal signal
  thermal = clamp(thermal + edge * edgeEnhancement, 0.0, 1.0);
  
  // Apply color palette
  vec3 color = applyPalette(thermal, palette);
  
  // Draw reticle if enabled
  if (reticle > 0.5) {
    color = drawReticle(uv, color, time);
  }
  
  // Subtle scan effect (FLIR sensor simulation)
  float scanEffect = sin(uv.y * colorTextureDimensions.y * 0.5 + time * 2.0) * 0.02;
  color *= 1.0 + scanEffect;
  
  out_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/**
 * Create FLIR shader configuration
 */
export function createFLIRConfig(params: Partial<typeof FLIR_DEFAULTS> = {}): ShaderConfig {
  const p = { ...FLIR_DEFAULTS, ...params };
  
  return {
    fragmentShader: FLIR_FRAGMENT_SHADER,
    uniforms: {
      contrast: () => p.contrast,
      edgeEnhancement: () => p.edgeEnhancement,
      palette: () => p.palette,
      reticle: () => p.reticle,
      brightness: () => p.brightness,
      hotspotThreshold: () => p.hotspotThreshold,
      coldspotThreshold: () => p.coldspotThreshold,
    },
    parameters: p,
  };
}
