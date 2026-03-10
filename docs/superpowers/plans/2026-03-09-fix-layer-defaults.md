# Layer Default State Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default all layers to OFF on load. When satellites are enabled, show sub-layer toggles with all categories enabled except Starlink (which starts hidden).

**Architecture:** Two stores control layer state: `src/stores/layers.ts` (top-level layers) and `src/layers/ground/store.ts` (ground sub-layers). The satellite store (`src/layers/satellites/store.ts`) controls category visibility via `hiddenCategories`. The UI in `LeftPanelComponent.tsx` needs satellite category toggles added.

**Tech Stack:** SolidJS, TypeScript, Bun

---

## Chunk 1: Set all defaults to OFF

### Task 1: Default top-level layers to off

**Files:**
- Modify: `src/stores/layers.ts`

- [ ] **Step 1: Change `initialState` to all `false`**

Current:
```typescript
const initialState: LayerState = {
  satellites: true,
  flights: true,
  ships: true,
  ground: true,
};
```

Change to:
```typescript
const initialState: LayerState = {
  satellites: false,
  flights: false,
  ships: false,
  ground: false,
};
```

- [ ] **Step 2: Verify the app loads with no layers visible**

```bash
bun run src/server.ts
```

Open browser → confirm no satellites, flights, ships, or ground features appear on load.

- [ ] **Step 3: Commit**

```bash
git add src/stores/layers.ts
git commit -m "fix: default all top-level layers to off on load"
```

---

### Task 2: Default ground sub-layers to off

**Files:**
- Modify: `src/layers/ground/store.ts`

- [ ] **Step 1: Change ground sub-layer defaults to `false`**

Current:
```typescript
const initialState: GroundState = {
  trafficEnabled: true,
  cctvEnabled: true,
  seismicEnabled: true,
  // ...
};
```

Change to:
```typescript
const initialState: GroundState = {
  trafficEnabled: false,
  cctvEnabled: false,
  seismicEnabled: false,
  // ...
};
```

- [ ] **Step 2: Verify the ground layer toggle correctly enables sub-layers**

Open app → toggle GROUND on → ground sub-layer buttons appear → toggle TRAFFIC on → traffic particles should appear.

- [ ] **Step 3: Commit**

```bash
git add src/layers/ground/store.ts
git commit -m "fix: default ground sub-layers to off on load"
```

---

## Chunk 2: Satellite sub-layer initialization (Starlink off by default)

### Task 3: Initialize Starlink hidden when satellites first enable

**Files:**
- Modify: `src/layers/satellites/SatelliteLayer.tsx`
- Modify: `src/layers/satellites/store.ts`

The satellite store's `hiddenCategories` is currently an empty Set (all visible). When the satellite layer is first enabled, Starlink should be hidden.

- [ ] **Step 1: Change satellite store initial state to hide Starlink**

In `src/layers/satellites/store.ts`, change:
```typescript
const initialState: SatelliteState = {
  records: [],
  hiddenCategories: new Set(),
  // ...
};
```

To:
```typescript
const initialState: SatelliteState = {
  records: [],
  hiddenCategories: new Set<SatelliteCategory>(["starlink"]),
  // ...
};
```

This means on first load (or when the satellite layer is toggled on), Starlink is already hidden. The billboard creation effect already respects `hiddenCategories`:

```typescript
add({
  id: record.noradId,
  // ...
  show: !satelliteState.hiddenCategories.has(record.category),
  // ...
});
```

So Starlink billboards will be created with `show: false` automatically.

- [ ] **Step 2: Verify Starlink starts hidden when satellites are enabled**

Open app → toggle SATELLITES on → satellites appear → confirm Starlink (white dots, very many) are NOT visible → confirm other categories (stations, military, gnss, research) ARE visible.

- [ ] **Step 3: Commit**

```bash
git add src/layers/satellites/store.ts
git commit -m "fix: default starlink category to hidden when satellites layer enables"
```

---

## Chunk 3: Add satellite sub-layer (category) toggles to the UI

### Task 4: Add category toggles to LeftPanel

**Files:**
- Modify: `src/ui/LeftPanelComponent.tsx`

Currently, the LeftPanel only shows ground sub-layer toggles. The satellite layer needs per-category toggles so users can enable/disable: stations, military, starlink, gnss, research.

- [ ] **Step 1: Import satellite store functions**

Add to imports in `LeftPanelComponent.tsx`:
```typescript
import { satelliteState, toggleCategory, isCategoryVisible } from "../layers/satellites/store";
import type { SatelliteCategory } from "../layers/satellites/types";
```

- [ ] **Step 2: Define satellite category config**

Add near `LAYER_CONFIGS`:
```typescript
interface CategoryConfig {
  id: SatelliteCategory;
  name: string;
}

const SATELLITE_CATEGORIES: CategoryConfig[] = [
  { id: "stations", name: "STATIONS" },
  { id: "military", name: "MILITARY" },
  { id: "gnss", name: "GNSS" },
  { id: "research", name: "RESEARCH" },
  { id: "starlink", name: "STARLINK" },
];
```

- [ ] **Step 3: Add toggle handler**

```typescript
function handleToggleCategory(category: SatelliteCategory): void {
  toggleCategory(category);
  const isVisible = isCategoryVisible(category);
  addLogEntry(`[SAT] ${category.toUpperCase()} ${isVisible ? "OFF" : "ON"}`);
}
```

Note: `isCategoryVisible` checks BEFORE toggle, so this log message is inverted — fix:
```typescript
function handleToggleCategory(category: SatelliteCategory): void {
  const wasVisible = isCategoryVisible(category);
  toggleCategory(category);
  addLogEntry(`[SAT] ${category.toUpperCase()} ${wasVisible ? "OFF" : "ON"}`);
}
```

- [ ] **Step 4: Add satellite sub-layer toggles in the render, similar to ground**

Find the existing pattern:
```tsx
{/* Ground sub-layer toggles */}
<Show when={config.id === "ground" && layers.ground}>
  ...
</Show>
```

Add a parallel block for satellites:
```tsx
{/* Satellite category toggles */}
<Show when={config.id === "satellites" && layers.satellites}>
  <div class="ground-options-row">
    <For each={SATELLITE_CATEGORIES}>
      {(cat) => (
        <div class="sub-toggle-row">
          <button
            class={`toggle-btn sub-toggle ${isCategoryVisible(cat.id) ? "on" : ""}`}
            onClick={() => handleToggleCategory(cat.id)}
          >
            {cat.name}
          </button>
        </div>
      )}
    </For>
  </div>
</Show>
```

**Important:** `isCategoryVisible()` reads from `satelliteState.hiddenCategories`. Since `satelliteState` is a SolidJS store, accessing `.hiddenCategories` inside JSX will be reactive — but `hiddenCategories` is a `Set`, and SolidJS doesn't track mutations to plain Sets. The store uses `setSatelliteState("hiddenCategories", newSet)` which replaces the Set entirely — so reactivity works at the store property level.

However, `isCategoryVisible()` is a plain function, not a signal. Wrap it in a getter to ensure reactivity:

```tsx
<button
  class={`toggle-btn sub-toggle ${!satelliteState.hiddenCategories.has(cat.id) ? "on" : ""}`}
  onClick={() => handleToggleCategory(cat.id)}
>
```

This directly reads from the store and is reactive.

- [ ] **Step 5: Test the satellite category toggles**

Enable satellites → see all category buttons → toggle STARLINK on → Starlink dots appear → toggle off → they disappear.

- [ ] **Step 6: Commit**

```bash
git add src/ui/LeftPanelComponent.tsx src/layers/satellites/store.ts
git commit -m "feat: add satellite category sub-layer toggles to left panel"
```

---

## Final Verification

- [ ] On load: no layers are visible (all start OFF)
- [ ] Toggling SATELLITES on shows satellites; Starlink is hidden by default
- [ ] Satellite category buttons appear when SATELLITES is ON
- [ ] Each category toggle correctly shows/hides satellites of that type
- [ ] Toggling SATELLITES off hides all satellites; toggling back on restores previous category state
- [ ] Ground sub-layers (TRAFFIC, CCTV, SEISMIC) default to OFF
- [ ] Ground sub-layers can be individually toggled when GROUND is ON
- [ ] No console errors
