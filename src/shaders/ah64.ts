/**
 * WorldView - AH-64 Apache TADS Shader
 * Simulates the Target Acquisition and Designation Sight (TADS)
 * display as seen in the AH-64D/E Apache cockpit.
 *
 * Uses FLIR shader for base thermal processing (white-hot palette),
 * then overlays AH64-specific targeting reticle and heading tape.
 */

import type { ShaderConfig } from "./types.ts";
import { FLIR_DEFAULTS, createFLIRConfig } from "./flir.ts";

type Viewer = import("cesium").Viewer;

/** Live viewer reference — set by the shader manager on init */
let _viewer: Viewer | null = null;

export function setAH64Viewer(viewer: Viewer | null): void {
  _viewer = viewer;
}

/**
 * AH64 defaults - extends FLIR with reticle-specific settings
 * Uses FLIR's white-hot palette (0) for grayscale thermal look
 */
export const AH64_DEFAULTS = {
  // FLIR base settings (tuned for TADS look)
  contrast: 1.5,
  edgeEnhancement: 0.15,
  palette: 0, // White-hot for grayscale
  reticle: 0.0, // Disable FLIR's reticle - we use our own
  brightness: 1.05,
  hotspotThreshold: 0.7,
  coldspotThreshold: 0.3,
  // AH64-specific
  reticleOpacity: 0.9,
};

/**
 * Create AH64 shader configuration.
 * Composes FLIR thermal processing with AH64 reticle/heading overlay
 * in a single PostProcessStage (FLIR logic is inlined into the shader).
 */
export function createAH64Config(params: Partial<typeof AH64_DEFAULTS> = {}): ShaderConfig {
  const merged = { ...AH64_DEFAULTS, ...params };

  // Build FLIR base config (reticle disabled — AH64 draws its own)
  const flirConfig = createFLIRConfig({ ...merged, reticle: 0.0 });
  const compositeShader = createCompositeShader(flirConfig.fragmentShader);

  // Build uniforms: FLIR params from merged + AH64-specific uniforms
  const uniforms: Record<string, () => number> = {};
  for (const key in merged) {
    const k = key as keyof typeof merged;
    uniforms[k] = () => merged[k];
  }
  // Override: FLIR reticle always off (AH64 has its own)
  uniforms.reticle = () => 0.0;
  // AH64-specific: live camera heading
  uniforms.u_headingDeg = () => {
    if (!_viewer) return 0.0;
    return (_viewer.camera.heading * 180.0 / Math.PI + 360.0) % 360.0;
  };

  return { fragmentShader: compositeShader, uniforms, parameters: merged };
}

/**
 * Compose FLIR processing + AH64 reticle overlay into a single shader.
 * Extracts FLIR helpers/main body and wraps them with AH64 drawing functions.
 */
function createCompositeShader(flirShader: string): string {
  const mainIndex = flirShader.indexOf("void main()");
  const flirHelpers = flirShader.substring(0, mainIndex);
  const flirMainBody: string = flirShader.match(/void main\(\)\s*\{([\s\S]*)\}/)?.[1] ?? "";

  return `
${flirHelpers}

uniform float reticleOpacity;
uniform float u_headingDeg;

// --- AH64 Reticle Drawing Functions ---

float ah64_lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t);
}

float ah64_drawLine(vec2 p, vec2 a, vec2 b, float thickness) {
  return smoothstep(thickness, thickness * 0.3, ah64_lineDist(p, a, b));
}

// 3×5 digit bitmaps for heading tape
float ah64_digitPixel(int d, int col, int row) {
  int r;
  if (d == 0) { int rows[5]; rows[0]=7; rows[1]=5; rows[2]=5; rows[3]=5; rows[4]=7; r=rows[row]; }
  else if (d == 1) { int rows[5]; rows[0]=2; rows[1]=6; rows[2]=2; rows[3]=2; rows[4]=7; r=rows[row]; }
  else if (d == 2) { int rows[5]; rows[0]=7; rows[1]=1; rows[2]=7; rows[3]=4; rows[4]=7; r=rows[row]; }
  else if (d == 3) { int rows[5]; rows[0]=7; rows[1]=1; rows[2]=3; rows[3]=1; rows[4]=7; r=rows[row]; }
  else if (d == 4) { int rows[5]; rows[0]=5; rows[1]=5; rows[2]=7; rows[3]=1; rows[4]=1; r=rows[row]; }
  else if (d == 5) { int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row]; }
  else if (d == 6) { int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=5; rows[4]=7; r=rows[row]; }
  else if (d == 7) { int rows[5]; rows[0]=7; rows[1]=1; rows[2]=2; rows[3]=2; rows[4]=2; r=rows[row]; }
  else if (d == 8) { int rows[5]; rows[0]=7; rows[1]=5; rows[2]=7; rows[3]=5; rows[4]=7; r=rows[row]; }
  else { int rows[5]; rows[0]=7; rows[1]=5; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row]; }
  return float((r >> (2 - col)) & 1);
}

float ah64_cardinalPixel(int card, int col, int row) {
  int r;
  if (card == 0) { int rows[5]; rows[0]=5; rows[1]=7; rows[2]=7; rows[3]=5; rows[4]=5; r=rows[row]; }
  else if (card == 1) { int rows[5]; rows[0]=7; rows[1]=4; rows[2]=6; rows[3]=4; rows[4]=7; r=rows[row]; }
  else if (card == 2) { int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row]; }
  else { int rows[5]; rows[0]=5; rows[1]=5; rows[2]=5; rows[3]=7; rows[4]=2; r=rows[row]; }
  return float((r >> (2 - col)) & 1);
}

float ah64_renderChar(int charVal, bool isCardinal, vec2 tapePx, vec2 charPx, float scale) {
  vec2 rel = tapePx - charPx;
  if (rel.x < 0.0 || rel.x >= 3.0 * scale || rel.y < 0.0 || rel.y >= 5.0 * scale) return 0.0;
  int col = clamp(int(rel.x / scale), 0, 2);
  int row = clamp(int(rel.y / scale), 0, 4);
  if (isCardinal) return ah64_cardinalPixel(charVal, col, row);
  return ah64_digitPixel(charVal, col, row);
}

float ah64_renderNumber(int val, vec2 tapePx, vec2 charPx, float scale) {
  float result = 0.0;
  float charW = 3.0 * scale + scale;
  if (val >= 100) {
    result += ah64_renderChar(val / 100, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += ah64_renderChar((val / 10) - (val / 100) * 10, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += ah64_renderChar(val - (val / 10) * 10, false, tapePx, charPx, scale);
  } else if (val >= 10) {
    result += ah64_renderChar(val / 10, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += ah64_renderChar(val - (val / 10) * 10, false, tapePx, charPx, scale);
  } else {
    result += ah64_renderChar(val, false, tapePx, charPx, scale);
  }
  return result;
}

float ah64_headingTape(vec2 uv, float headingDeg, vec2 res) {
  const float TAPE_WIDTH_DEG = 60.0;
  const float TAPE_SCREEN_FRAC = 0.30;
  
  float tapeTop = 1.0 - 0.060;
  float tapeBot = 1.0 - 0.115;
  float tapeY = uv.y;

  if (tapeY < tapeBot || tapeY > tapeTop) return 0.0;

  float tapeW = res.x * TAPE_SCREEN_FRAC;
  float tapeLeft = (res.x - tapeW) * 0.5;
  float tapeRight = tapeLeft + tapeW;
  float screenPxX = uv.x * res.x;

  if (screenPxX < tapeLeft || screenPxX > tapeRight) return 0.0;

  float result = 0.0;
  float tapePxX = screenPxX - tapeLeft;
  float tapePxY = (tapeTop - tapeY) * res.y;
  float tapeH = (tapeTop - tapeBot) * res.y;
  float pxPerDeg = tapeW / TAPE_WIDTH_DEG;

  // Lubber line - downward pointing caret at center
  float cx = tapeW * 0.5;
  float triH = tapeH * 0.45;
  float triW = 6.0;
  float ty = tapePxY;
  float leftEdge = cx - triW * (1.0 - ty / triH);
  float rightEdge = cx + triW * (1.0 - ty / triH);
  if (ty <= triH && tapePxX >= leftEdge - 1.0 && tapePxX <= rightEdge + 1.0) {
    if (tapePxX >= leftEdge && tapePxX <= rightEdge) {
      result = 1.0;
    } else {
      float edgeDist = min(tapePxX - leftEdge, rightEdge - tapePxX);
      result = max(result, smoothstep(1.5, 0.0, edgeDist));
    }
  }

  // Tick marks and labels
  float halfW = TAPE_WIDTH_DEG * 0.5;
  float startDeg = floor((headingDeg - halfW) / 5.0) * 5.0;

  for (int i = 0; i <= 14; i++) {
    float deg = startDeg + float(i) * 5.0;
    float normDeg = mod(deg, 360.0);
    if (normDeg < 0.0) normDeg += 360.0;

    float offset = deg - headingDeg;
    float tickX = cx + offset * pxPerDeg;

    if (tickX < 0.0 || tickX > tapeW) continue;

    int degInt = int(round(normDeg));
    bool isMajor = (degInt == 0 || degInt == 90 || degInt == 180 || degInt == 270);
    bool is10deg = (mod(normDeg, 10.0) < 0.5);

    float tickH = is10deg ? tapeH * 0.55 : tapeH * 0.35;
    if (abs(tapePxX - tickX) < 1.5 && tapePxY >= 0.0 && tapePxY <= tickH) {
      result = max(result, smoothstep(1.5, 0.0, abs(tapePxX - tickX)));
    }

    if (!is10deg) continue;

    float charScale = 2.5;
    float charW = 3.0 * charScale + charScale;
    float labelY = tickH + 2.0;
    vec2 tapePx = vec2(tapePxX, tapePxY);

    if (isMajor) {
      int card = (degInt == 0) ? 0 : (degInt == 90) ? 1 : (degInt == 180) ? 2 : 3;
      vec2 charPos = vec2(tickX - 1.5 * charScale, labelY);
      result = max(result, ah64_renderChar(card, true, tapePx, charPos, charScale));
    } else {
      int val = degInt;
      float numW = (val >= 100) ? 3.0 * charW : (val >= 10) ? 2.0 * charW : charW;
      vec2 charPos = vec2(tickX - numW * 0.5, labelY);
      result = max(result, ah64_renderNumber(val, tapePx, charPos, charScale));
    }
  }

  return clamp(result, 0.0, 1.0);
}

float ah64_drawReticle(vec2 uv, vec2 res) {
  vec2 r = uv - 0.5;
  float aspect = res.x / res.y;
  vec2 rc = r * vec2(aspect, 1.0);

  float px = 1.0 / res.y;
  float thick = px * 1.8;
  float reticle = 0.0;

  // Center crosshair
  float crossGap = 0.012;
  float crossLen = 0.055;
  
  reticle += ah64_drawLine(rc, vec2(crossGap, 0.0), vec2(crossGap + crossLen, 0.0), thick);
  reticle += ah64_drawLine(rc, vec2(-crossGap, 0.0), vec2(-crossGap - crossLen, 0.0), thick);
  reticle += ah64_drawLine(rc, vec2(0.0, crossGap), vec2(0.0, crossGap + crossLen), thick);
  reticle += ah64_drawLine(rc, vec2(0.0, -crossGap), vec2(0.0, -crossGap - crossLen), thick);
  
  // Tick marks at crosshair ends
  float tickLen = 0.012;
  reticle += ah64_drawLine(rc, vec2(crossGap + crossLen, -tickLen*0.5), vec2(crossGap + crossLen, tickLen*0.5), thick);
  reticle += ah64_drawLine(rc, vec2(-crossGap - crossLen, -tickLen*0.5), vec2(-crossGap - crossLen, tickLen*0.5), thick);
  reticle += ah64_drawLine(rc, vec2(-tickLen*0.5, crossGap + crossLen), vec2(tickLen*0.5, crossGap + crossLen), thick);
  reticle += ah64_drawLine(rc, vec2(-tickLen*0.5, -crossGap - crossLen), vec2(tickLen*0.5, -crossGap - crossLen), thick);

  // Main target acquisition brackets
  float bx = 0.20;
  float by = 0.16;
  float bLen = 0.06;
  float bThick = thick * 1.4;
  
  reticle += ah64_drawLine(rc, vec2(-bx, by), vec2(-bx + bLen, by), bThick);
  reticle += ah64_drawLine(rc, vec2(-bx, by), vec2(-bx, by - bLen), bThick);
  reticle += ah64_drawLine(rc, vec2(bx, by), vec2(bx - bLen, by), bThick);
  reticle += ah64_drawLine(rc, vec2(bx, by), vec2(bx, by - bLen), bThick);
  reticle += ah64_drawLine(rc, vec2(-bx, -by), vec2(-bx + bLen, -by), bThick);
  reticle += ah64_drawLine(rc, vec2(-bx, -by), vec2(-bx, -by + bLen), bThick);
  reticle += ah64_drawLine(rc, vec2(bx, -by), vec2(bx - bLen, -by), bThick);
  reticle += ah64_drawLine(rc, vec2(bx, -by), vec2(bx, -by + bLen), bThick);

  // Inner tracking box
  float sx = 0.08;
  float sy = 0.065;
  float sLen = 0.025;
  float sThick = thick * 1.1;
  
  reticle += ah64_drawLine(rc, vec2(-sx, sy), vec2(-sx + sLen, sy), sThick);
  reticle += ah64_drawLine(rc, vec2(-sx, sy), vec2(-sx, sy - sLen), sThick);
  reticle += ah64_drawLine(rc, vec2(sx, sy), vec2(sx - sLen, sy), sThick);
  reticle += ah64_drawLine(rc, vec2(sx, sy), vec2(sx, sy - sLen), sThick);
  reticle += ah64_drawLine(rc, vec2(-sx, -sy), vec2(-sx + sLen, -sy), sThick);
  reticle += ah64_drawLine(rc, vec2(-sx, -sy), vec2(-sx, -sy + sLen), sThick);
  reticle += ah64_drawLine(rc, vec2(sx, -sy), vec2(sx - sLen, -sy), sThick);
  reticle += ah64_drawLine(rc, vec2(sx, -sy), vec2(sx, -sy + sLen), sThick);

  return clamp(reticle, 0.0, 1.0);
}

void main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // FLIR Processing (from flir.ts)
  // ═══════════════════════════════════════════════════════════════════════════
  ${flirMainBody.replace(/out_FragColor\s*=\s*vec4\([^;]+\);/g, "// FLIR output captured below")}

  // Capture FLIR color output (before the final out_FragColor assignment)
  vec3 flirColor = clamp(color, 0.0, 1.0);

  // ═══════════════════════════════════════════════════════════════════════════
  // AH64 Reticle Overlay
  // ═══════════════════════════════════════════════════════════════════════════
  float reticleVal = ah64_drawReticle(uv, colorTextureDimensions);
  flirColor = mix(flirColor, vec3(0.0, 1.0, 0.3), reticleVal * reticleOpacity);

  // Heading compass tape
  float tape = ah64_headingTape(uv, u_headingDeg, colorTextureDimensions);
  flirColor = mix(flirColor, vec3(0.0, 1.0, 0.3), tape * reticleOpacity);

  out_FragColor = vec4(flirColor, 1.0);
}
`;
}
