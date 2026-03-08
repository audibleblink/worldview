/**
 * WorldView - AH-64 Apache TADS Shader
 * Simulates the Target Acquisition and Designation Sight (TADS)
 * display as seen in the AH-64D/E Apache cockpit:
 * - Grayscale (monochrome CCD/FLIR sensor output)
 * - High contrast with crushed blacks and clipped whites
 * - Film grain / sensor noise
 * - Subtle horizontal scanlines
 * - Strong elliptical vignette
 * - Center crosshair reticle with target acquisition brackets
 * - Heading compass tape at the top (driven by live camera heading)
 */

import type { ShaderConfig } from "./types.ts";
import { createShaderConfig } from "./types.ts";

type Viewer = import("cesium").Viewer;

/** Live viewer reference — set by the shader manager on init */
let _viewer: Viewer | null = null;

export function setAH64Viewer(viewer: Viewer | null): void {
  _viewer = viewer;
}

export const AH64_DEFAULTS = {
  contrast: 1.6,
  brightness: 1.05,
  noiseAmount: 0.06,
  scanlineIntensity: 0.08,
  vignetteStrength: 0.7,
  reticleOpacity: 0.9,
};

const AH64_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;

uniform float contrast;
uniform float brightness;
uniform float noiseAmount;
uniform float scanlineIntensity;
uniform float vignetteStrength;
uniform float reticleOpacity;
// Live camera heading in degrees [0, 360)
uniform float u_headingDeg;

in vec2 v_textureCoordinates;

float random(vec2 st, float seed) {
  return fract(sin(dot(st + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Signed distance to a line segment — negative = inside thickness
float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t);
}

float drawLine(vec2 p, vec2 a, vec2 b, float thickness) {
  return smoothstep(thickness, thickness * 0.3, lineDist(p, a, b));
}

// Dashed line helper - returns 1.0 where dash is visible
float drawDashedLine(vec2 p, vec2 a, vec2 b, float thickness, float dashLen, float gapLen) {
  vec2 ba = b - a;
  float lineLen = length(ba);
  vec2 dir = ba / lineLen;
  
  vec2 pa = p - a;
  float proj = dot(pa, dir);
  
  // Check if we're on a dash or gap
  float period = dashLen + gapLen;
  float t = mod(proj, period);
  if (t > dashLen) return 0.0;
  
  return drawLine(p, a, b, thickness);
}

// ── Heading tape ────────────────────────────────────────────────────────────
//
// Drawn in screen UV space (uv.x in [0,1], uv.y in [0,1], y=1 is top).
// The tape is a thin horizontal band near the top of the screen.
// A tick mark appears for every 5° of heading.
// Cardinal labels N/E/S/W and intermediate numbers scroll with the heading.
//
// We encode digits 0-9 in a 3×5 bitmap stored as floats so we can render
// them without a texture atlas.

// 3×5 digit bitmaps packed into a single float per row (bits 0-2 = cols left→right)
// Returns 1.0 if pixel (col, row) of digit d is lit, else 0.0
// col in [0,2], row in [0,4] (row 0 = top)
float digitPixel(int d, int col, int row) {
  // Each digit: 5 rows, each row is a 3-bit mask (bits 2,1,0 = left,mid,right)
  // Encoding: int[5] per digit
  int r;
  if (d == 0) {
    int rows[5]; rows[0]=7; rows[1]=5; rows[2]=5; rows[3]=5; rows[4]=7; r=rows[row];
  } else if (d == 1) {
    int rows[5]; rows[0]=2; rows[1]=6; rows[2]=2; rows[3]=2; rows[4]=7; r=rows[row];
  } else if (d == 2) {
    int rows[5]; rows[0]=7; rows[1]=1; rows[2]=7; rows[3]=4; rows[4]=7; r=rows[row];
  } else if (d == 3) {
    int rows[5]; rows[0]=7; rows[1]=1; rows[2]=3; rows[3]=1; rows[4]=7; r=rows[row];
  } else if (d == 4) {
    int rows[5]; rows[0]=5; rows[1]=5; rows[2]=7; rows[3]=1; rows[4]=1; r=rows[row];
  } else if (d == 5) {
    int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row];
  } else if (d == 6) {
    int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=5; rows[4]=7; r=rows[row];
  } else if (d == 7) {
    int rows[5]; rows[0]=7; rows[1]=1; rows[2]=2; rows[3]=2; rows[4]=2; r=rows[row];
  } else if (d == 8) {
    int rows[5]; rows[0]=7; rows[1]=5; rows[2]=7; rows[3]=5; rows[4]=7; r=rows[row];
  } else {
    // 9
    int rows[5]; rows[0]=7; rows[1]=5; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row];
  }
  // Extract bit for column (col 0=left=bit2, col 1=mid=bit1, col 2=right=bit0)
  int bit = 2 - col;
  return float((r >> bit) & 1);
}

// Cardinal letter bitmaps (N, E, S, W) in same 3×5 grid
float cardinalPixel(int card, int col, int row) {
  // card: 0=N, 1=E, 2=S, 3=W
  int r;
  if (card == 0) { // N
    int rows[5]; rows[0]=5; rows[1]=7; rows[2]=7; rows[3]=5; rows[4]=5; r=rows[row];
  } else if (card == 1) { // E
    int rows[5]; rows[0]=7; rows[1]=4; rows[2]=6; rows[3]=4; rows[4]=7; r=rows[row];
  } else if (card == 2) { // S
    int rows[5]; rows[0]=7; rows[1]=4; rows[2]=7; rows[3]=1; rows[4]=7; r=rows[row];
  } else { // W
    int rows[5]; rows[0]=5; rows[1]=5; rows[2]=5; rows[3]=7; rows[4]=2; r=rows[row];
  }
  int bit = 2 - col;
  return float((r >> bit) & 1);
}

// Render a single 3×5 character (digit or cardinal) at position charPos in tape space
// tapePx: pixel coordinate in tape-local space (x along tape, y from tape top)
// charPx: top-left corner of character in tape space
// scale: pixel size of each bitmap cell
float renderChar(int charVal, bool isCardinal, vec2 tapePx, vec2 charPx, float scale) {
  vec2 rel = tapePx - charPx;
  if (rel.x < 0.0 || rel.x >= 3.0 * scale || rel.y < 0.0 || rel.y >= 5.0 * scale) return 0.0;
  int col = int(rel.x / scale);
  int row = int(rel.y / scale);
  col = clamp(col, 0, 2);
  row = clamp(row, 0, 4);
  if (isCardinal) return cardinalPixel(charVal, col, row);
  return digitPixel(charVal, col, row);
}

// Render a 1-3 digit number (val 0-359) at charPx in tape space
float renderNumber(int val, vec2 tapePx, vec2 charPx, float scale) {
  float result = 0.0;
  float charW = 3.0 * scale + scale; // char width + 1px gap
  if (val >= 100) {
    result += renderChar(val / 100, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += renderChar((val / 10) - (val / 100) * 10, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += renderChar(val - (val / 10) * 10, false, tapePx, charPx, scale);
  } else if (val >= 10) {
    result += renderChar(val / 10, false, tapePx, charPx, scale);
    charPx.x += charW;
    result += renderChar(val - (val / 10) * 10, false, tapePx, charPx, scale);
  } else {
    result += renderChar(val, false, tapePx, charPx, scale);
  }
  return result;
}

// Tape spans tapeWidthDeg degrees across the tape's pixel width
const float TAPE_WIDTH_DEG = 60.0;
// Tape occupies this fraction of screen width, centered (~50%)
const float TAPE_SCREEN_FRAC = 0.30;

float headingTape(vec2 uv, float headingDeg, vec2 res) {
  // Tape band: just below the top of the canvas
  // Offset from top so it clears the app's top bar overlay
  float tapeTop = 1.0 - 0.060;  // UV y (y=0 is bottom in GL)
  float tapeBot = 1.0 - 0.115;
  float tapeY   = uv.y;

  if (tapeY < tapeBot || tapeY > tapeTop) return 0.0;

  // Tape horizontal extents in pixels (centered on screen)
  float tapeW    = res.x * TAPE_SCREEN_FRAC;
  float tapeLeft = (res.x - tapeW) * 0.5;
  float tapeRight = tapeLeft + tapeW;

  float screenPxX = uv.x * res.x;

  // Outside tape width — draw nothing
  if (screenPxX < tapeLeft || screenPxX > tapeRight) return 0.0;

  float result  = 0.0;
  // tapePxX is pixel position relative to tape left edge
  float tapePxX = screenPxX - tapeLeft;
  float tapePxY = (tapeTop - tapeY) * res.y; // 0 at top of tape band
  float tapeH   = (tapeTop - tapeBot) * res.y;
  float pxPerDeg = tapeW / TAPE_WIDTH_DEG;

  // NO horizontal baseline - Apache style has no lower bounding line
  float baseY = tapeH - 1.0;

  // Lubber line - downward pointing caret/triangle at center
  float cx = tapeW * 0.5;
  float triH = tapeH * 0.45;
  float triW = 6.0;
  float ty   = tapePxY;
  float leftEdge  = cx - triW * (1.0 - ty / triH);
  float rightEdge = cx + triW * (1.0 - ty / triH);
  if (ty <= triH && tapePxX >= leftEdge - 1.0 && tapePxX <= rightEdge + 1.0) {
    if (tapePxX >= leftEdge && tapePxX <= rightEdge) {
      result = 1.0;
    } else {
      float edgeDist = min(tapePxX - leftEdge, rightEdge - tapePxX);
      result = max(result, smoothstep(1.5, 0.0, edgeDist));
    }
  }

  // Tick marks and labels - ticks hang down from top
  float halfW    = TAPE_WIDTH_DEG * 0.5;
  float startDeg = floor((headingDeg - halfW) / 5.0) * 5.0;

  for (int i = 0; i <= 14; i++) {
    float deg     = startDeg + float(i) * 5.0;
    float normDeg = mod(deg, 360.0);
    if (normDeg < 0.0) normDeg += 360.0;

    float offset = deg - headingDeg;
    float tickX  = cx + offset * pxPerDeg;

    // Skip ticks outside tape bounds
    if (tickX < 0.0 || tickX > tapeW) continue;

    int  degInt  = int(round(normDeg));
    bool isMajor = (degInt == 0 || degInt == 90 || degInt == 180 || degInt == 270);
    bool is10deg = (mod(normDeg, 10.0) < 0.5);

    // Ticks hang down from top (tapePxY = 0 is top)
    float tickH   = is10deg ? tapeH * 0.40 : tapeH * 0.25;
    float tickTop = 0.0;
    float tickBot = tickH;

    if (abs(tapePxX - tickX) < 1.5 && tapePxY >= tickTop && tapePxY <= tickBot) {
      result = max(result, smoothstep(1.5, 0.0, abs(tapePxX - tickX)));
    }

    if (!is10deg) continue;

    // Labels below the ticks
    float charScale = 2.0;
    float charW     = 3.0 * charScale + charScale;
    float labelY    = tickBot + 2.0;
    vec2  tapePx    = vec2(tapePxX, tapePxY);

    if (isMajor) {
      int card = (degInt == 0) ? 0 : (degInt == 90) ? 1 : (degInt == 180) ? 2 : 3;
      vec2 charPos = vec2(tickX - 1.5 * charScale, labelY);
      result = max(result, renderChar(card, true, tapePx, charPos, charScale));
    } else {
      int val    = degInt;
      float numW = (val >= 100) ? 3.0 * charW : (val >= 10) ? 2.0 * charW : charW;
      vec2 charPos = vec2(tickX - numW * 0.5, labelY);
      result = max(result, renderNumber(val, tapePx, charPos, charScale));
    }
  }

  return clamp(result, 0.0, 1.0);
}
// ── End heading tape ────────────────────────────────────────────────────────

void main() {
  vec2 uv = v_textureCoordinates;
  float time = czm_frameNumber * 0.07;

  // --- Image processing ---
  vec4 original = texture(colorTexture, uv);
  float lum = dot(original.rgb, vec3(0.299, 0.587, 0.114));

  // Contrast (S-curve style: lift blacks, clip whites)
  lum = (lum - 0.5) * contrast + 0.5;
  lum *= brightness;

  // Crush blacks slightly (TADS output looks clipped at low end)
  lum = smoothstep(0.05, 1.0, lum);

  // Film grain / sensor noise (animated)
  float grain = (random(uv * colorTextureDimensions * 0.5, time) - 0.5) * noiseAmount;
  lum += grain;

  // Horizontal scanlines (CRT-style phosphor rows)
  float scanline = sin(uv.y * colorTextureDimensions.y * 1.0) * 0.5 + 0.5;
  lum *= 1.0 - scanlineIntensity * (1.0 - scanline);

  // No vignette - Apache TADS fills the screen cleanly
  lum = clamp(lum, 0.0, 1.0);
  vec3 color = vec3(lum);

  // --- Apache TADS Reticle overlay ---
  // Centered, ~50% of viewport, no bottom bounding line
  vec2 r = uv - 0.5;
  float aspect = colorTextureDimensions.x / colorTextureDimensions.y;
  vec2 rc = r * vec2(aspect, 1.0); // aspect-corrected coords

  float px = 1.0 / colorTextureDimensions.y; // 1 pixel in UV space
  float thick = px * 1.8;
  float reticle = 0.0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Center crosshair — four arms extending from center with small gap
  // Like the reference: short lines with gap in middle
  // ═══════════════════════════════════════════════════════════════════════════
  float crossGap  = 0.012;
  float crossLen  = 0.055;
  
  // Horizontal arms
  reticle += drawLine(rc, vec2(crossGap, 0.0),  vec2(crossGap + crossLen, 0.0),  thick);
  reticle += drawLine(rc, vec2(-crossGap, 0.0), vec2(-crossGap - crossLen, 0.0), thick);
  // Vertical arms
  reticle += drawLine(rc, vec2(0.0, crossGap),  vec2(0.0, crossGap + crossLen),  thick);
  reticle += drawLine(rc, vec2(0.0, -crossGap), vec2(0.0, -crossGap - crossLen), thick);
  
  // Small tick marks at the ends of crosshairs (like reference)
  float tickLen = 0.012;
  // Right arm tick
  reticle += drawLine(rc, vec2(crossGap + crossLen, -tickLen*0.5), vec2(crossGap + crossLen, tickLen*0.5), thick);
  // Left arm tick
  reticle += drawLine(rc, vec2(-crossGap - crossLen, -tickLen*0.5), vec2(-crossGap - crossLen, tickLen*0.5), thick);
  // Top arm tick
  reticle += drawLine(rc, vec2(-tickLen*0.5, crossGap + crossLen), vec2(tickLen*0.5, crossGap + crossLen), thick);
  // Bottom arm tick  
  reticle += drawLine(rc, vec2(-tickLen*0.5, -crossGap - crossLen), vec2(tickLen*0.5, -crossGap - crossLen), thick);

  // ═══════════════════════════════════════════════════════════════════════════
  // Main target acquisition box — large L-brackets at corners (50% of viewport)
  // NO bottom connecting line - just corner brackets
  // ═══════════════════════════════════════════════════════════════════════════
  float bx = 0.20;  // Half-width (~40% of viewport width total)
  float by = 0.16;  // Half-height
  float bLen = 0.06; // Length of bracket arms
  float bThick = thick * 1.4;
  
  // Top-left bracket
  reticle += drawLine(rc, vec2(-bx, by),  vec2(-bx + bLen, by),  bThick); // horizontal
  reticle += drawLine(rc, vec2(-bx, by),  vec2(-bx, by - bLen),  bThick); // vertical
  
  // Top-right bracket  
  reticle += drawLine(rc, vec2( bx, by),  vec2( bx - bLen, by),  bThick); // horizontal
  reticle += drawLine(rc, vec2( bx, by),  vec2( bx, by - bLen),  bThick); // vertical
  
  // Bottom-left bracket
  reticle += drawLine(rc, vec2(-bx, -by), vec2(-bx + bLen, -by), bThick); // horizontal
  reticle += drawLine(rc, vec2(-bx, -by), vec2(-bx, -by + bLen), bThick); // vertical
  
  // Bottom-right bracket
  reticle += drawLine(rc, vec2( bx, -by), vec2( bx - bLen, -by), bThick); // horizontal
  reticle += drawLine(rc, vec2( bx, -by), vec2( bx, -by + bLen), bThick); // vertical

  // ═══════════════════════════════════════════════════════════════════════════
  // Inner tracking/lock box - smaller brackets
  // ═══════════════════════════════════════════════════════════════════════════
  float sx = 0.08;
  float sy = 0.065;
  float sLen = 0.025;
  float sThick = thick * 1.1;
  
  // Top-left
  reticle += drawLine(rc, vec2(-sx, sy),  vec2(-sx + sLen, sy),  sThick);
  reticle += drawLine(rc, vec2(-sx, sy),  vec2(-sx, sy - sLen),  sThick);
  // Top-right
  reticle += drawLine(rc, vec2( sx, sy),  vec2( sx - sLen, sy),  sThick);
  reticle += drawLine(rc, vec2( sx, sy),  vec2( sx, sy - sLen),  sThick);
  // Bottom-left
  reticle += drawLine(rc, vec2(-sx, -sy), vec2(-sx + sLen, -sy), sThick);
  reticle += drawLine(rc, vec2(-sx, -sy), vec2(-sx, -sy + sLen), sThick);
  // Bottom-right
  reticle += drawLine(rc, vec2( sx, -sy), vec2( sx - sLen, -sy), sThick);
  reticle += drawLine(rc, vec2( sx, -sy), vec2( sx, -sy + sLen), sThick);

  reticle = clamp(reticle, 0.0, 1.0);
  color = mix(color, vec3(1.0), reticle * reticleOpacity);

  // --- Heading compass tape ---
  float tape = headingTape(uv, u_headingDeg, colorTextureDimensions);
  color = mix(color, vec3(1.0), tape * reticleOpacity);

  out_FragColor = vec4(color, 1.0);
}
`;

export function createAH64Config(params: Partial<typeof AH64_DEFAULTS> = {}): ShaderConfig {
  const base = createShaderConfig(AH64_FRAGMENT_SHADER, AH64_DEFAULTS, params);
  return {
    ...base,
    uniforms: {
      ...base.uniforms,
      // Live heading uniform — reads from viewer camera each frame
      u_headingDeg: () => {
        if (!_viewer) return 0.0;
        // Cesium heading is in radians, 0 = north, clockwise positive
        const rad = _viewer.camera.heading;
        const deg = (rad * 180.0 / Math.PI + 360.0) % 360.0;
        return deg;
      },
    },
  };
}
