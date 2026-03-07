# PRD: Shader Pipeline (Milestone 2)

## Overview

Implement a post-processing shader pipeline that transforms the 3D globe view between military display modes. The mode switcher buttons in the bottom bar already exist but currently only log to console—this feature makes them functional by applying real-time GPU-based visual effects.

## Goals

1. **Functional mode switching** — Each mode button applies a distinct visual filter to the CesiumJS globe
2. **Military-grade aesthetics** — CRT phosphor glow, night vision intensifier noise, thermal imaging palettes
3. **Smooth transitions** — Crossfade between modes (~300ms) for polished feel
4. **Adjustable parameters** — Per-mode sliders control effect intensity
5. **Performance** — Maintain 30+ FPS on mid-range hardware

## Non-Goals

- NAVI mode (P2, deferred to later milestone)
- Full-viewport effects (shaders apply to globe only, UI panels stay clean)
- Mobile optimization

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shader API | CesiumJS `PostProcessStage` | Native integration, handles viewport sizing, no render loop hacking |
| Shader scope | Globe only | UI panels remain readable; effects contained to 3D view |
| Transitions | Crossfade (~300ms) | Smooth, professional feel |
| Keyboard shortcuts | Number keys 1-6 | Quick access for power users |
| State persistence | localStorage | Remember mode + parameters across sessions |
| CSS scanlines | Replace with WebGL | Consolidate all effects in shader pipeline for consistency |

---

## Architecture

### File Structure

```
src/
├── shaders/
│   ├── index.ts           # ShaderManager - switching logic, transitions
│   ├── types.ts           # TypeScript interfaces for shader modes
│   ├── normal.ts          # Pass-through (no effect)
│   ├── crt.ts             # CRT mode shader + uniforms
│   ├── nvg.ts             # Night vision shader + uniforms
│   ├── flir.ts            # Thermal imaging shader + uniforms
│   └── anime.ts           # Cel-shading shader + uniforms
```

### ShaderManager API

```typescript
interface ShaderManager {
  init(viewer: Cesium.Viewer): void;
  setMode(mode: ViewMode): void;
  getMode(): ViewMode;
  setParameter(param: string, value: number): void;
  getParameters(): Record<string, number>;
  dispose(): void;
}
```

### Integration Points

1. **bottom-bar.ts** — `setMode()` calls `shaderManager.setMode()`
2. **right-panel.ts** — Slider changes call `shaderManager.setParameter()`
3. **main.ts** — Initialize ShaderManager after globe creation
4. **styles.css** — Remove CSS-based scanlines (`#app::after` pseudo-element)

---

## Features

### F2.1 Shader Manager (P0)

The central coordinator for all post-processing effects.

**Requirements:**
- Initialize with CesiumJS Viewer instance
- Manage a single active `PostProcessStageComposite` 
- Handle mode switching with crossfade transitions
- Expose parameter setters for uniform updates
- Persist mode + parameters to localStorage
- Restore state on page load

**Uniforms (shared):**
| Uniform | Type | Description |
|---------|------|-------------|
| `u_time` | float | Elapsed time for animations |
| `u_resolution` | vec2 | Viewport dimensions |
| `u_intensity` | float | Master effect intensity (0-1) |

### F2.2 CRT Mode (P0)

Classic cathode-ray tube display simulation.

**Visual Effects:**
- Horizontal scanlines (alternating row brightness, ~2px period)
- RGB subpixel separation (chromatic aberration, ~1-2px offset)
- Barrel distortion (curved screen edges, subtle)
- Phosphor bloom (gaussian blur on bright pixels)
- Frame flicker (subtle brightness oscillation, ~0.5% variance)

**Per-Mode Parameters:**
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Scanline Intensity | 0-1 | 0.3 | Darkness of scanlines |
| Chromatic Aberration | 0-1 | 0.2 | RGB separation amount |
| Barrel Distortion | 0-1 | 0.1 | Screen curvature |
| Bloom | 0-1 | 0.15 | Phosphor glow intensity |
| Flicker | 0-1 | 0.05 | Brightness oscillation |

### F2.3 NVG Mode (P0)

Night vision goggle / image intensifier simulation.

**Visual Effects:**
- Monochrome green channel extraction (phosphor green #00ff00)
- Intensifier noise (film grain, updates each frame)
- Circular vignette (dark edges simulating tube view)
- Bloom on bright sources (light bleeding)
- Subtle temporal noise

**Per-Mode Parameters:**
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Green Intensity | 0-1 | 0.8 | Phosphor brightness |
| Noise Amount | 0-1 | 0.15 | Film grain intensity |
| Vignette | 0-1 | 0.5 | Edge darkening |
| Bloom | 0-1 | 0.3 | Light source bleeding |

### F2.4 FLIR Mode (P0)

Forward-looking infrared / thermal imaging simulation.

**Visual Effects:**
- Luminance-based false color mapping
- Palette selection (White-hot default, Black-hot, Iron, Rainbow)
- Edge enhancement (thermal contrast)
- Optional targeting reticle overlay
- Temperature scale display (UI element, not shader)

**Palettes:**
- **White-hot:** Black → White (hot = bright)
- **Black-hot:** White → Black (hot = dark)
- **Iron:** Black → Red → Orange → Yellow → White
- **Rainbow:** Full spectrum mapping

**Per-Mode Parameters:**
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Contrast | 0-1 | 0.5 | Thermal contrast |
| Edge Enhancement | 0-1 | 0.2 | Edge sharpening |
| Palette | enum | white-hot | Color mapping |
| Reticle | bool | true | Show targeting overlay |

### F2.5 Anime Mode (P1)

Cel-shading / toon rendering simulation.

**Visual Effects:**
- Sobel edge detection (black outlines)
- Posterization (reduce to 4-6 color levels per channel)
- Flat shading (remove subtle gradients)
- Warm color grading (slight saturation boost)

**Per-Mode Parameters:**
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Outline Thickness | 0-1 | 0.5 | Edge line width |
| Outline Threshold | 0-1 | 0.3 | Edge detection sensitivity |
| Color Levels | 3-8 | 5 | Posterization steps |
| Saturation | 0-1 | 0.6 | Color vibrancy |

### F2.6 Normal Mode (P0)

Clean pass-through with no effects.

**Requirements:**
- Remove all post-processing stages
- Serve as baseline for A/B comparison
- Fastest render path (no shader overhead)

### F2.8 Transition Effects (P1)

Smooth crossfade between shader modes.

**Requirements:**
- Crossfade duration: 300ms
- Use `mix()` in transition shader to blend old/new
- Handle rapid mode switching gracefully (cancel in-progress transitions)
- No jarring visual cuts

### F2.9 Parameter Sliders (P1)

Wire existing UI sliders to shader uniforms.

**Right Panel Sliders (currently disabled):**
- **Pixelation** — Maps to resolution downscaling
- **Distortion** — Maps to barrel distortion / chromatic aberration
- **Instability** — Maps to flicker / noise intensity

**Requirements:**
- Sliders update uniforms in real-time
- Values persist per-mode in localStorage
- Show current value as percentage

---

## Keyboard Shortcuts

| Key | Mode |
|-----|------|
| 1 | Normal |
| 2 | CRT |
| 3 | NVG |
| 4 | FLIR |
| 5 | Anime |
| 6 | (Reserved for NAVI) |

---

## Acceptance Criteria

| # | Criteria | Priority |
|---|----------|----------|
| AC1 | Clicking each mode button applies the corresponding shader | P0 |
| AC2 | CRT mode displays visible scanlines and subtle barrel distortion | P0 |
| AC3 | NVG mode renders in green monochrome with visible noise | P0 |
| AC4 | FLIR mode applies thermal false-color palette (white-hot default) | P0 |
| AC5 | Anime mode shows posterized colors with dark outlines | P1 |
| AC6 | Normal mode shows clean unfiltered globe view | P0 |
| AC7 | Mode transitions crossfade smoothly (~300ms) | P1 |
| AC8 | Parameter sliders affect active shader intensity | P1 |
| AC9 | Shaders perform at 30+ FPS on mid-range hardware | P0 |
| AC10 | Selected mode persists across page reload | P1 |
| AC11 | Keyboard shortcuts 1-5 switch modes | P1 |
| AC12 | CSS scanlines removed, replaced by WebGL CRT effect | P0 |

---

## Out of Scope

- **NAVI mode** — Deferred to future milestone
- **UI panel shaders** — Effects apply to globe only
- **Custom shader uploads** — No user-defined shaders
- **Mobile support** — Desktop browsers only

---

## Performance Considerations

1. **Single composite stage** — Combine all effects into one shader pass where possible
2. **Uniform caching** — Avoid redundant `gl.uniform*` calls
3. **Conditional compilation** — Use `#ifdef` to exclude unused effect code per mode
4. **Resolution scaling** — Allow optional render at 0.5x-1.0x for performance
5. **RAF throttling** — Shader time uniform updates via existing render loop

---

## Dependencies

- CesiumJS `PostProcessStage` and `PostProcessStageComposite` APIs
- WebGL 2.0 (GLSL ES 3.00) for advanced shader features
- Existing `getViewer()` export from `globe.ts`
- Existing mode buttons in `bottom-bar.ts`
- Existing sliders in `right-panel.ts`

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CesiumJS PostProcess API limitations | Medium | High | Prototype CRT mode first as proof of concept |
| Performance degradation with complex shaders | Medium | High | Profile early, use resolution scaling fallback |
| GLSL compatibility across browsers | Low | Medium | Stick to GLSL ES 1.00 if WebGL2 issues arise |
| Transition timing issues | Low | Low | Use requestAnimationFrame for smooth interpolation |

---

## Success Metrics

1. All P0 acceptance criteria pass
2. Frame rate stays above 30 FPS during mode switches
3. User can visually distinguish each mode within 1 second
4. No console errors during normal operation
