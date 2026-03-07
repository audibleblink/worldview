# Execution Plan: Shader Pipeline (Milestone 2)

This plan implements the shader pipeline in 6 phases. Each phase produces working, tested code before proceeding.

---

## Phase Overview

| Phase | Name | Depends On | Description |
|-------|------|------------|-------------|
| 1 | Foundation & CRT Proof of Concept | - | ShaderManager skeleton + CRT shader to validate approach |
| 2 | Core Shader Modes (P0) | Phase 1 | NVG, FLIR, Normal mode implementations |
| 3 | UI Integration | Phase 2 | Wire mode buttons, keyboard shortcuts, CSS cleanup |
| 4 | Transitions & Anime Mode (P1) | Phase 3 | Crossfade transitions + Anime shader |
| 5 | Parameter System | Phase 4 | Per-mode sliders, uniform updates |
| 6 | Persistence & Polish | Phase 5 | localStorage, final testing, performance verification |

---

## Phase 1: Foundation & CRT Proof of Concept

**Goal:** Validate CesiumJS PostProcessStage API works for our use case with a working CRT shader.

**Depends On:** None

### Tasks

- [x] Create `src/shaders/` directory structure
- [x] Create `src/shaders/types.ts` with TypeScript interfaces
  - `ViewMode` type (reuse from bottom-bar or define canonical)
  - `ShaderConfig` interface (fragmentShader, uniforms, parameters)
  - `ShaderManagerInterface` 
- [x] Create `src/shaders/index.ts` with ShaderManager skeleton
  - `init(viewer)` - store viewer reference, add time uniform update to render loop
  - `setMode(mode)` - basic implementation (no transitions yet)
  - `getMode()` - return current mode
  - `dispose()` - cleanup stages
- [x] Create `src/shaders/crt.ts` with CRT shader
  - GLSL fragment shader with scanlines, chromatic aberration, barrel distortion
  - Bloom and flicker effects
  - Default parameter values
- [x] Create `src/shaders/normal.ts` (pass-through, removes all stages)
- [x] Temporarily wire ShaderManager into `main.ts` for manual testing
- [x] Run dev server and verify CRT effect renders on globe

### Verification Script

```bash
#!/bin/bash
# test-phase1.sh - Run from project root

echo "=== Phase 1 Verification ==="

# 1. Check all files exist
FILES=(
  "src/shaders/types.ts"
  "src/shaders/index.ts"
  "src/shaders/crt.ts"
  "src/shaders/normal.ts"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "✓ $f exists"
  else
    echo "✗ $f missing"
    exit 1
  fi
done

# 2. TypeScript compilation check
echo "Checking TypeScript..."
bunx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compiles"
else
  echo "✗ TypeScript errors"
  exit 1
fi

# 3. Check ShaderManager exports
grep -q "export.*ShaderManager\|export.*shaderManager" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ ShaderManager exported"
else
  echo "✗ ShaderManager not exported"
  exit 1
fi

# 4. Check CRT shader has required effects
CRT_EFFECTS=("scanline" "aberration\|chromatic" "distortion\|barrel" "bloom" "flicker")
for effect in "${CRT_EFFECTS[@]}"; do
  grep -qi "$effect" src/shaders/crt.ts
  if [ $? -eq 0 ]; then
    echo "✓ CRT has $effect"
  else
    echo "⚠ CRT missing $effect (check implementation)"
  fi
done

echo "=== Phase 1 Complete ==="
```

### Manual Verification (Browser)

1. Start dev server: `bun run dev` or `bun src/server.ts`
2. Open browser to localhost
3. Open DevTools Console
4. Execute: `window.shaderManager.setMode('CRT')` (if exposed globally for testing)
5. Verify: Globe shows visible scanlines and subtle distortion
6. Execute: `window.shaderManager.setMode('NORMAL')`
7. Verify: Globe returns to clean rendering

### Exit Criteria

- [x] All 4 shader files exist and compile
- [x] CRT mode visually applies scanlines to globe
- [x] Normal mode removes all effects
- [x] No console errors during mode switch
- [x] Frame rate remains above 30 FPS with CRT active

---

## Phase 2: Core Shader Modes (P0)

**Goal:** Implement remaining P0 shader modes (NVG, FLIR).

**Depends On:** Phase 1

### Tasks

- [x] Create `src/shaders/nvg.ts` with Night Vision shader
  - Green monochrome extraction
  - Film grain noise (use u_time for animation)
  - Circular vignette
  - Bloom on bright areas
- [x] Create `src/shaders/flir.ts` with Thermal shader
  - Luminance-based false color mapping
  - White-hot palette (default)
  - Black-hot, Iron, Rainbow palettes (palette uniform)
  - Edge enhancement
  - Optional targeting reticle overlay
- [x] Update ShaderManager to register all modes
- [x] Add palette switching support to FLIR mode

### Verification Script

```bash
#!/bin/bash
# test-phase2.sh

echo "=== Phase 2 Verification ==="

# 1. Check new files exist
FILES=(
  "src/shaders/nvg.ts"
  "src/shaders/flir.ts"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "✓ $f exists"
  else
    echo "✗ $f missing"
    exit 1
  fi
done

# 2. TypeScript compilation
bunx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compiles"
else
  echo "✗ TypeScript errors"
  exit 1
fi

# 3. Check NVG shader components
NVG_EFFECTS=("green\|monochrome" "noise\|grain" "vignette" "bloom")
for effect in "${NVG_EFFECTS[@]}"; do
  grep -qi "$effect" src/shaders/nvg.ts
  if [ $? -eq 0 ]; then
    echo "✓ NVG has $effect"
  else
    echo "⚠ NVG missing $effect"
  fi
done

# 4. Check FLIR shader components
FLIR_EFFECTS=("luminance\|grayscale" "palette" "edge" "white.*hot\|whiteHot")
for effect in "${FLIR_EFFECTS[@]}"; do
  grep -qi "$effect" src/shaders/flir.ts
  if [ $? -eq 0 ]; then
    echo "✓ FLIR has $effect"
  else
    echo "⚠ FLIR missing $effect"
  fi
done

# 5. Check ShaderManager handles all modes
MODES=("NORMAL" "CRT" "NVG" "FLIR")
for mode in "${MODES[@]}"; do
  grep -q "$mode" src/shaders/index.ts
  if [ $? -eq 0 ]; then
    echo "✓ ShaderManager handles $mode"
  else
    echo "✗ ShaderManager missing $mode"
    exit 1
  fi
done

echo "=== Phase 2 Complete ==="
```

### Manual Verification (Browser)

1. Test each mode via console:
   - `shaderManager.setMode('NVG')` → Green tint, visible noise, vignette
   - `shaderManager.setMode('FLIR')` → Thermal false-color (white-hot)
   - `shaderManager.setMode('CRT')` → Scanlines still work
   - `shaderManager.setMode('NORMAL')` → Clean view

### Exit Criteria

- [x] NVG mode renders green monochrome with noise/vignette
- [x] FLIR mode applies thermal palette
- [x] All 4 modes switch without errors
- [x] Each mode visually distinct within 1 second
- [x] 30+ FPS maintained in all modes

---

## Phase 3: UI Integration

**Goal:** Wire shader modes to existing UI buttons and add keyboard shortcuts.

**Depends On:** Phase 2

### Tasks

- [x] Modify `src/ui/bottom-bar.ts`:
  - Import ShaderManager
  - Update `setMode()` to call `shaderManager.setMode()`
  - Remove console.log placeholder
- [x] Add keyboard event listener for mode shortcuts (1-5)
  - Create in `src/ui/shell.ts` or new `src/ui/keyboard.ts`
  - Keys 1-5 map to NORMAL, CRT, NVG, FLIR, ANIME
  - Don't capture when typing in input fields
- [x] Modify `public/styles.css`:
  - Remove `#app::after` scanline pseudo-element
  - Remove any other CSS-based CRT effects
- [x] Ensure mode indicator in bottom bar stays in sync

### Verification Script

```bash
#!/bin/bash
# test-phase3.sh

echo "=== Phase 3 Verification ==="

# 1. Check bottom-bar imports ShaderManager
grep -q "shaderManager\|ShaderManager" src/ui/bottom-bar.ts
if [ $? -eq 0 ]; then
  echo "✓ bottom-bar.ts imports ShaderManager"
else
  echo "✗ bottom-bar.ts missing ShaderManager import"
  exit 1
fi

# 2. Check console.log removed from setMode
grep -q 'console.log.*mode\|console.log.*Mode' src/ui/bottom-bar.ts
if [ $? -eq 0 ]; then
  echo "⚠ console.log still in bottom-bar.ts (should be removed)"
else
  echo "✓ console.log placeholder removed"
fi

# 3. Check keyboard shortcuts exist
grep -rq "keydown\|keypress" src/ui/
if [ $? -eq 0 ]; then
  echo "✓ Keyboard event listener found"
else
  echo "✗ No keyboard event listener"
  exit 1
fi

# 4. Check CSS scanlines removed
grep -q "#app::after" public/styles.css
if [ $? -eq 0 ]; then
  echo "✗ CSS scanlines still present in styles.css"
  exit 1
else
  echo "✓ CSS scanlines removed"
fi

# 5. TypeScript compiles
bunx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compiles"
else
  echo "✗ TypeScript errors"
  exit 1
fi

echo "=== Phase 3 Complete ==="
```

### Manual Verification (Browser)

1. Click each mode button in bottom bar
   - Verify shader activates on click
   - Verify button highlight state updates
2. Press keys 1-5
   - Verify corresponding mode activates
   - Verify button state syncs with keyboard
3. Verify no CSS scanlines visible in Normal mode
4. Verify CRT scanlines come from WebGL (inspect elements, no ::after)

### Exit Criteria

- [x] Clicking mode buttons applies shaders
- [x] Keyboard shortcuts 1-5 work
- [x] CSS scanlines completely removed
- [x] Button active state matches current mode
- [x] No regressions in existing UI functionality

---

## Phase 4: Transitions & Anime Mode (P1)

**Goal:** Smooth crossfade between modes + Anime cel-shading shader.

**Depends On:** Phase 3

### Tasks

- [x] Implement transition system in ShaderManager:
  - Create transition shader that blends two textures
  - `setMode()` triggers 300ms crossfade
  - Use `requestAnimationFrame` for smooth interpolation
  - Handle rapid switching (cancel in-progress transitions)
- [x] Create `src/shaders/anime.ts`:
  - Sobel edge detection for outlines
  - Posterization (reduce color levels)
  - Warm color grading
  - Configurable outline thickness/threshold
- [x] Register ANIME mode in ShaderManager
- [x] Update keyboard shortcut 5 to activate ANIME

### Verification Script

```bash
#!/bin/bash
# test-phase4.sh

echo "=== Phase 4 Verification ==="

# 1. Check anime.ts exists
if [ -f "src/shaders/anime.ts" ]; then
  echo "✓ anime.ts exists"
else
  echo "✗ anime.ts missing"
  exit 1
fi

# 2. Check anime shader components
ANIME_EFFECTS=("sobel\|edge" "posteriz" "outline")
for effect in "${ANIME_EFFECTS[@]}"; do
  grep -qi "$effect" src/shaders/anime.ts
  if [ $? -eq 0 ]; then
    echo "✓ Anime has $effect"
  else
    echo "⚠ Anime missing $effect"
  fi
done

# 3. Check transition implementation
grep -q "transition\|crossfade\|mix\|blend" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ Transition logic found"
else
  echo "✗ No transition implementation"
  exit 1
fi

# 4. Check ANIME mode registered
grep -q "ANIME" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ ANIME mode registered"
else
  echo "✗ ANIME mode not registered"
  exit 1
fi

# 5. TypeScript compiles
bunx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compiles"
else
  echo "✗ TypeScript errors"
  exit 1
fi

echo "=== Phase 4 Complete ==="
```

### Manual Verification (Browser)

1. Switch between modes and observe transitions:
   - Should see smooth blend over ~300ms
   - No jarring cuts or flashes
2. Rapidly click mode buttons:
   - Transitions should cancel gracefully
   - Final state should be last clicked mode
3. Activate ANIME mode:
   - Visible black outlines on edges
   - Posterized/flat colors
   - Distinct from other modes

### Exit Criteria

- [x] Mode transitions crossfade smoothly (~300ms)
- [x] Rapid switching doesn't cause glitches
- [x] ANIME mode shows cel-shading with outlines
- [x] All 5 modes work (NORMAL, CRT, NVG, FLIR, ANIME)
- [x] 30+ FPS maintained during transitions

---

## Phase 5: Parameter System

**Goal:** Wire UI sliders to shader uniforms with per-mode parameters.

**Depends On:** Phase 4

### Tasks

- [x] Extend ShaderManager API:
  - `setParameter(mode, param, value)` - update uniform
  - `getParameters(mode)` - get current values
  - Store parameter values per-mode in memory
- [x] Modify `src/ui/right-panel.ts`:
  - Enable disabled sliders (Pixelation, Distortion, Instability)
  - Add event listeners to call `shaderManager.setParameter()`
  - Update slider display to show percentage
  - Map generic slider names to mode-specific uniforms:
    - **Pixelation** → resolution scale (all modes)
    - **Distortion** → barrel distortion (CRT), chromatic aberration
    - **Instability** → flicker (CRT), noise (NVG)
- [x] Add per-mode parameter definitions in each shader file
- [x] Update sliders when mode changes (show current mode's values)

### Verification Script

```bash
#!/bin/bash
# test-phase5.sh

echo "=== Phase 5 Verification ==="

# 1. Check ShaderManager has parameter methods
grep -q "setParameter" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ setParameter method exists"
else
  echo "✗ setParameter method missing"
  exit 1
fi

grep -q "getParameters\|getParameter" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ getParameter(s) method exists"
else
  echo "✗ getParameter(s) method missing"
  exit 1
fi

# 2. Check right-panel has slider event handling
grep -q "addEventListener\|oninput\|onchange" src/ui/right-panel.ts
if [ $? -eq 0 ]; then
  echo "✓ Slider event handlers found"
else
  echo "⚠ No slider event handlers found"
fi

# 3. Check sliders are enabled (no disabled attribute)
grep -q 'disabled.*slider\|slider.*disabled' src/ui/right-panel.ts
if [ $? -eq 0 ]; then
  echo "⚠ Some sliders may still be disabled"
else
  echo "✓ No disabled sliders found"
fi

# 4. TypeScript compiles
bunx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compiles"
else
  echo "✗ TypeScript errors"
  exit 1
fi

echo "=== Phase 5 Complete ==="
```

### Manual Verification (Browser)

1. In CRT mode:
   - Adjust Distortion slider → barrel distortion changes
   - Adjust Instability slider → flicker intensity changes
2. In NVG mode:
   - Adjust Instability slider → noise intensity changes
3. Switch modes and verify:
   - Sliders update to show current mode's values
   - Previous mode's parameters preserved
4. Set slider to extreme values → effect clearly visible

### Exit Criteria

- [x] All three sliders functional (Pixelation, Distortion, Instability)
- [x] Slider changes apply in real-time
- [x] Each mode remembers its own parameter values
- [x] Sliders update when switching modes
- [x] Effects scale appropriately from 0% to 100%

---

## Phase 6: Persistence & Polish

**Goal:** localStorage persistence, final testing, performance verification.

**Depends On:** Phase 5

### Tasks

- [x] Implement localStorage persistence:
  - Save: current mode, per-mode parameters
  - Load: restore on page load
  - Key: `worldview-shader-state`
- [x] Add persistence calls:
  - In `setMode()` - save mode
  - In `setParameter()` - save parameters
  - In `init()` - restore state
- [x] Performance audit:
  - Measure FPS in each mode
  - Profile shader compile times
  - Optimize any shaders below 30 FPS
- [x] Final cleanup:
  - Remove any debug console.logs
  - Remove test code (window.shaderManager if added)
  - Verify no TypeScript errors or warnings
- [x] Cross-browser testing (Chrome, Firefox, Safari, Edge)

### Verification Script

```bash
#!/bin/bash
# test-phase6.sh

echo "=== Phase 6 Verification ==="

# 1. Check localStorage implementation
grep -q "localStorage" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ localStorage usage found"
else
  echo "✗ No localStorage implementation"
  exit 1
fi

# 2. Check storage key
grep -q "worldview-shader-state\|shader.*state\|state.*shader" src/shaders/index.ts
if [ $? -eq 0 ]; then
  echo "✓ State storage key found"
else
  echo "⚠ Custom storage key not found"
fi

# 3. Check no debug console.logs (except errors)
DEBUG_LOGS=$(grep -rn "console.log" src/shaders/ src/ui/ | grep -v "error\|Error" | wc -l)
if [ "$DEBUG_LOGS" -gt 0 ]; then
  echo "⚠ Found $DEBUG_LOGS console.log statements (review for debug code)"
else
  echo "✓ No debug console.logs found"
fi

# 4. TypeScript strict compile
bunx tsc --noEmit --strict 2>&1
if [ $? -eq 0 ]; then
  echo "✓ TypeScript strict mode passes"
else
  echo "⚠ TypeScript strict warnings (review)"
fi

# 5. Final file count check
SHADER_FILES=$(ls src/shaders/*.ts 2>/dev/null | wc -l)
echo "✓ $SHADER_FILES shader files created"

echo "=== Phase 6 Complete ==="
echo ""
echo "=== FINAL ACCEPTANCE CRITERIA ==="
echo "Run manual browser tests to verify:"
echo "  AC1:  Mode buttons apply shaders"
echo "  AC2:  CRT shows scanlines + distortion"
echo "  AC3:  NVG shows green + noise"
echo "  AC4:  FLIR shows thermal palette"
echo "  AC5:  Anime shows outlines + posterization"
echo "  AC6:  Normal shows clean view"
echo "  AC7:  Transitions crossfade smoothly"
echo "  AC8:  Sliders affect intensity"
echo "  AC9:  30+ FPS in all modes"
echo "  AC10: Mode persists across reload"
echo "  AC11: Keyboard 1-5 switches modes"
echo "  AC12: CSS scanlines removed"
```

### Manual Verification (Browser)

1. **Persistence Test:**
   - Set mode to NVG, adjust parameters
   - Refresh page
   - Verify NVG mode active with same parameters
2. **Performance Test:**
   - Open DevTools → Performance tab
   - Record 10 seconds in each mode
   - Verify frame rate > 30 FPS
3. **Cross-browser Test:**
   - Test in Chrome, Firefox, Safari (if available), Edge
   - Verify shaders render correctly in each

### Exit Criteria

- [x] Mode persists across page reload
- [x] Parameters persist across page reload
- [x] 30+ FPS in all modes (measured)
- [x] No console errors during normal use
- [x] Works in Chrome, Firefox, Edge (Safari partial OK)
- [x] All 12 acceptance criteria pass

---

## Final Checklist (All Phases Complete)

### Acceptance Criteria Sign-off

| # | Criteria | Status |
|---|----------|--------|
| AC1 | Clicking each mode button applies the corresponding shader | ✅ |
| AC2 | CRT mode displays visible scanlines and subtle barrel distortion | ✅ |
| AC3 | NVG mode renders in green monochrome with visible noise | ✅ |
| AC4 | FLIR mode applies thermal false-color palette (white-hot default) | ✅ |
| AC5 | Anime mode shows posterized colors with dark outlines | ✅ |
| AC6 | Normal mode shows clean unfiltered globe view | ✅ |
| AC7 | Mode transitions crossfade smoothly (~300ms) | ✅ |
| AC8 | Parameter sliders affect active shader intensity | ✅ |
| AC9 | Shaders perform at 30+ FPS on mid-range hardware | ✅ |
| AC10 | Selected mode persists across page reload | ✅ |
| AC11 | Keyboard shortcuts 1-5 switch modes | ✅ |
| AC12 | CSS scanlines removed, replaced by WebGL CRT effect | ✅ |

### Files Created

```
src/shaders/
├── types.ts      ✅
├── index.ts      ✅
├── normal.ts     ✅
├── crt.ts        ✅
├── nvg.ts        ✅
├── flir.ts       ✅
└── anime.ts      ✅
```

### Files Modified

```
src/main.ts           ✅  (ShaderManager init)
src/ui/bottom-bar.ts  ✅  (Wire mode buttons)
src/ui/right-panel.ts ✅  (Wire sliders)
src/ui/shell.ts       ✅  (Keyboard shortcuts)
public/styles.css     ✅  (Remove CSS scanlines)
```

---

## Rollback Plan

If issues arise mid-implementation:

1. **Phase 1-2 issues:** ShaderManager can be disabled by commenting out init call in main.ts
2. **Phase 3 issues:** Revert bottom-bar.ts to console.log placeholder
3. **Performance issues:** Add resolution scaling fallback (0.5x render resolution)
4. **Browser compatibility:** Fall back to GLSL ES 1.00 if WebGL2 issues
