/**
 * WorldView - Anime/Cel-Shading Shader
 * Creates a cel-shaded/anime look with:
 * - Sobel edge detection for black outlines
 * - Posterization (reduced color levels)
 * - Flat shading (removes subtle gradients)
 * - Warm color grading with saturation boost
 */

import { createShaderConfig } from "./types.ts";

/**
 * Default Anime effect parameters
 */
export const ANIME_DEFAULTS = {
  outlineThickness: 1.0,
  outlineThreshold: 0.15,
  colorLevels: 5.0,
  saturation: 1.3,
  warmth: 0.1,
  brightness: 1.05,
  contrast: 1.1,
};

/**
 * Anime/Cel-shading fragment shader (GLSL ES 1.00)
 */
const ANIME_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;
uniform float czm_frameNumber;

// Effect parameters
uniform float outlineThickness;
uniform float outlineThreshold;
uniform float colorLevels;
uniform float saturation;
uniform float warmth;
uniform float brightness;
uniform float contrast;

in vec2 v_textureCoordinates;

// Convert RGB to HSL
vec3 rgb2hsl(vec3 color) {
  float maxC = max(max(color.r, color.g), color.b);
  float minC = min(min(color.r, color.g), color.b);
  float l = (maxC + minC) / 2.0;
  
  if (maxC == minC) {
    return vec3(0.0, 0.0, l); // Achromatic
  }
  
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  
  float h;
  if (maxC == color.r) {
    h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
  } else if (maxC == color.g) {
    h = (color.b - color.r) / d + 2.0;
  } else {
    h = (color.r - color.g) / d + 4.0;
  }
  h /= 6.0;
  
  return vec3(h, s, l);
}

// Helper for HSL to RGB conversion
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

// Convert HSL to RGB
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  
  if (s == 0.0) {
    return vec3(l); // Achromatic
  }
  
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  
  float r = hue2rgb(p, q, h + 1.0/3.0);
  float g = hue2rgb(p, q, h);
  float b = hue2rgb(p, q, h - 1.0/3.0);
  
  return vec3(r, g, b);
}

// Sobel edge detection for outline effect
float sobelEdge(sampler2D tex, vec2 uv, vec2 texelSize) {
  // Sample 3x3 neighborhood for luminance
  float tl = dot(texture(tex, uv + vec2(-1.0, -1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture(tex, uv + vec2( 0.0, -1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture(tex, uv + vec2( 1.0, -1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture(tex, uv + vec2(-1.0,  0.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture(tex, uv + vec2( 1.0,  0.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture(tex, uv + vec2(-1.0,  1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float b  = dot(texture(tex, uv + vec2( 0.0,  1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture(tex, uv + vec2( 1.0,  1.0) * texelSize * outlineThickness).rgb, vec3(0.299, 0.587, 0.114));
  
  // Sobel operator
  float gx = tl + 2.0*l + bl - tr - 2.0*r - br;
  float gy = tl + 2.0*t + tr - bl - 2.0*b - br;
  
  return sqrt(gx*gx + gy*gy);
}

// Posterize color to reduce color bands
vec3 posterize(vec3 color, float levels) {
  return floor(color * levels) / (levels - 1.0);
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 texelSize = 1.0 / colorTextureDimensions;
  
  // Sample the original color
  vec4 original = texture(colorTexture, uv);
  vec3 color = original.rgb;
  
  // Apply contrast first
  color = (color - 0.5) * contrast + 0.5;
  color *= brightness;
  
  // Detect edges for outlines
  float edge = sobelEdge(colorTexture, uv, texelSize);
  float outline = step(outlineThreshold, edge);
  
  // Convert to HSL for saturation adjustment
  vec3 hsl = rgb2hsl(color);
  
  // Boost saturation for vibrant anime colors
  hsl.y = clamp(hsl.y * saturation, 0.0, 1.0);
  
  // Convert back to RGB
  color = hsl2rgb(hsl);
  
  // Apply warm color grading (shift toward orange/yellow)
  color.r += warmth * 0.5;
  color.g += warmth * 0.2;
  color.b -= warmth * 0.3;
  
  // Posterize colors for cel-shading effect
  color = posterize(color, colorLevels);
  
  // Apply black outlines
  color = mix(color, vec3(0.0), outline);
  
  // Final clamp
  color = clamp(color, 0.0, 1.0);
  
  out_FragColor = vec4(color, 1.0);
}
`;

/**
 * Create Anime shader configuration
 */
export function createAnimeConfig(params: Partial<typeof ANIME_DEFAULTS> = {}) {
  return createShaderConfig(ANIME_FRAGMENT_SHADER, ANIME_DEFAULTS, params);
}
