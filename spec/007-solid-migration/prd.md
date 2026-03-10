# PRD: WorldView SolidJS Migration

## Overview

Migrate the WorldView application from vanilla TypeScript + Cesium to a SolidJS architecture with custom Cesium bindings. This is a **full rewrite** with **high priority**.

## Problem Statement

The current vanilla TypeScript architecture has several pain points:

1. **State Management Complexity** — Module-level state scattered across layer classes makes coordination difficult
2. **Resource Leaks** — No systematic lifecycle management; event listeners and Cesium primitives aren't properly cleaned up
3. **Feature Friction** — Adding new layers or features requires touching multiple files with no clear pattern
4. **Event Coordination** — Cesium events (selection, camera, preRender) are handled ad-hoc across modules
5. **Future Limitations** — Architecture doesn't support planned timeline recording/playback features

Additionally, a code review identified specific **tech debt** that must NOT be carried forward:

6. **Inconsistent Rendering APIs** — Ships use Entity API (200+ draw calls) while satellites correctly use BillboardCollection. Ships should match satellites.
7. **GC Pressure from Property Allocation** — Flights/ships create `new ConstantPositionProperty()` on every position update (~750 allocs/sec), causing unnecessary garbage collection
8. **CCTV Texture Bottleneck** — `toDataURL()` called every frame for billboard texture updates, synchronously encoding PNG on the main thread
9. **Remote Asset Dependency** — Aircraft 3D model loaded from GitHub raw CDN, a single point of failure
10. **Duplicated Follow-Mode Logic** — Identical preRender camera-follow pattern copy-pasted across satellites, flights, and ships
11. **Server Has No Caching** — TLE, OpenSky, and Geocode endpoints hit upstream APIs on every request with zero caching. Rate limits are only enforced client-side.
12. **Hardcoded Proxy URL** — `http://localhost:3001` appears in 33 client-side locations
13. **Server Routing is Imperative** — 210-line if/else chain in proxy index.ts makes adding routes error-prone

## Goals

1. **Centralized Reactive State** — All application state in SolidJS stores with fine-grained reactivity
2. **Proper Lifecycle Management** — `onCleanup()` hooks ensure resources are released
3. **Layer Extensibility** — Adding a new data source = adding one file with predictable patterns
4. **Cesium Integration** — Thin wrapper bindings that preserve direct Cesium access
5. **Timeline-Ready Architecture** — Store design supports future event-sourcing/playback
6. **Backend Consistency** — Apply similar patterns to proxy server code

## Non-Goals

- Timeline recording/playback implementation (deferred, but architecture must support it)
- Pixel-perfect UI recreation (minor refinements allowed)
- Test coverage (skip for now, prioritize shipping)
- New features beyond current functionality

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | SolidJS | Fine-grained reactivity, small bundle (~7KB), natural fit for timeline/playback |
| Build Tooling | Bun native | Matches existing setup, simplifies toolchain |
| Cesium Bindings | Thin wrappers | Preserve escape hatches to raw Cesium API |
| Layer System | Explicit registry | Predictable, typed, supports metadata |
| State Persistence | None | State resets on refresh |
| UI Approach | Minor refinements | Keep structure, improve polish |
| High-count rendering | BillboardCollection / PointPrimitiveCollection | Primitive-level APIs for all layers with >50 items. Entity API only for <50 items (flights) |
| Position updates | Mutate existing properties | Never allocate new ConstantPositionProperty per frame. Mutate `Property.setValue()` or use SampledPositionProperty |
| Follow mode | Shared `createFollowMode()` utility | Single implementation in `cesium/hooks/`, not duplicated per layer |
| Shader parameters | Uniform mutation | Modify uniform values on existing PostProcessStage, never recreate stage for parameter changes |
| Aircraft model | Local asset | Bundle GLB in `public/models/`, no remote CDN dependency |
| CCTV textures | Canvas directly as billboard image | No `toDataURL()`. Pass canvas element to billboard, invalidate via `scene.requestRender()` |
| Proxy URL | Shared `config.ts` constant | Single `PROXY_BASE_URL` imported everywhere, no hardcoded URLs |
| Server routing | Bun.serve route map | Declarative `routes: {}` object, not imperative if/else |
| Server caching | TTL cache per upstream | TLE: 5min, OpenSky: 10s, Geocode: LRU. Request coalescing for concurrent identical requests |

## Architecture

### Directory Structure

```
src/
├── index.tsx                 # Entry point
├── App.tsx                   # Root component
├── config.ts                 # Shared constants (PROXY_BASE_URL, etc.)
├── cesium/                   # Cesium bindings
│   ├── CesiumProvider.tsx    # Context provider, viewer lifecycle
│   ├── useCesium.ts          # Hook to access viewer
│   ├── createEntity.ts       # Reactive entity binding (for <50 item layers like flights)
│   ├── createBillboardCollection.ts  # Reactive BillboardCollection binding (for high-count layers)
│   ├── createPointCollection.ts      # Reactive PointPrimitiveCollection binding (traffic particles)
│   ├── createPrimitive.ts    # Reactive primitive binding
│   └── hooks/
│       ├── usePreRender.ts   # preRender subscription
│       ├── useCamera.ts      # Camera state/controls
│       ├── useSelection.ts   # Entity selection
│       └── useFollowMode.ts  # Shared camera-follow utility (replaces 3x duplicated logic)
├── stores/
│   ├── layers.ts             # Layer visibility, state
│   ├── selection.ts          # Selected entity
│   ├── camera.ts             # Camera mode, target
│   ├── ui.ts                 # Panel visibility, command mode
│   └── shaders.ts            # Active post-processing effects
├── layers/
│   ├── registry.ts           # Layer registration system
│   ├── satellites/
│   │   ├── index.ts          # Layer definition + registration
│   │   ├── store.ts          # Satellite-specific state
│   │   └── SatelliteLayer.tsx  # Uses createBillboardCollection
│   ├── flights/
│   │   ├── index.ts
│   │   ├── store.ts
│   │   └── FlightLayer.tsx     # Uses createEntity (3D models, <50 items)
│   ├── ships/
│   │   ├── index.ts
│   │   ├── store.ts
│   │   └── ShipLayer.tsx       # Uses createBillboardCollection (NOT Entity API)
│   └── ground/
│       ├── index.ts
│       ├── store.ts
│       └── GroundLayer.tsx     # Traffic: createPointCollection, CCTV: createBillboardCollection
├── ui/
│   ├── Shell.tsx             # Main layout
│   ├── LeftPanel.tsx         # Layer controls, POIs
│   ├── RightPanel.tsx        # Entity info
│   ├── BottomBar.tsx         # Status, coordinates
│   ├── CommandBar.tsx        # Vim-style input
│   └── panels/
│       ├── SatelliteInfo.tsx
│       ├── FlightInfo.tsx
│       └── ShipInfo.tsx
├── shaders/
│   ├── index.ts              # Shader registry
│   ├── crt.ts
│   ├── nvg.ts
│   ├── flir.ts
│   └── ah64.ts
├── utils/
│   ├── camera.ts             # Camera utilities
│   ├── geocoder.ts           # Location lookup
│   └── errors.ts             # Error handling
└── server/
    ├── index.ts              # Bun.serve entry with route map
    ├── cache.ts              # TTL cache + request coalescing utility
    ├── middleware.ts          # Error boundary, logging, rate limiting
    ├── routes/
    │   ├── tle.ts            # Cached (5min TTL)
    │   ├── flights.ts        # Cached (10s TTL), transforms OpenSky data server-side
    │   ├── ships.ts
    │   ├── geocode.ts        # LRU cached
    │   ├── cctv.ts
    │   └── tiles.ts          # Google tiles behind explicit /tiles/ prefix
    └── websocket/
        └── ships.ts          # AISStream relay with heartbeat monitoring
```

### Core Patterns

#### 1. CesiumProvider

```tsx
// Provides Cesium viewer via context, handles lifecycle
<CesiumProvider options={viewerOptions}>
  <App />
</CesiumProvider>
```

#### 2. Layer Registration

```ts
// layers/satellites/index.ts
import { registerLayer } from '../registry';
import { SatelliteLayer } from './SatelliteLayer';
import { satelliteStore } from './store';

registerLayer({
  id: 'satellites',
  name: 'Satellites',
  icon: 'satellite',
  component: SatelliteLayer,
  store: satelliteStore,
  defaultEnabled: true,
});
```

#### 3. Reactive Rendering Bindings

```tsx
// Flights: Entity API is fine for <50 3D models
const entity = createEntity(() => ({
  position: Cartesian3.fromDegrees(lon(), lat(), alt()),
  model: { uri: '/models/aircraft.glb' },  // LOCAL asset, not remote CDN
}));
onCleanup(() => entity.destroy());

// Satellites/Ships: BillboardCollection for 100+ items (single draw call)
const collection = createBillboardCollection((billboards) => {
  for (const record of records()) {
    billboards.add({
      position: record.position,
      image: spriteTexture,       // Single canvas sprite, color-tinted per item
      color: record.color,
    });
  }
});
onCleanup(() => collection.destroy());

// Position updates: MUTATE existing properties, never allocate new ones
// BAD:  entity.position = new ConstantPositionProperty(newPos)  // GC pressure
// GOOD: entity.position.setValue(newPos)                        // Zero alloc
```

#### 4. Store Design (Timeline-Ready)

```ts
// stores/selection.ts
export const [selection, setSelection] = createStore({
  type: null as 'satellite' | 'flight' | 'ship' | null,
  id: null as string | null,
  // Metadata populated by layer
  data: null as SatelliteData | FlightData | ShipData | null,
});

// Future: wrap mutations for event-sourcing
export function selectEntity(type: string, id: string) {
  // Could emit event for timeline recording
  setSelection({ type, id });
}
```

#### 5. Shader Integration

```ts
// stores/shaders.ts
export const [shaderState, setShaderState] = createStore({
  active: null as 'crt' | 'nvg' | 'flir' | 'ah64' | null,
  intensity: 1.0,
});

// Effect applies/removes post-processing
createEffect(() => {
  const shader = shaderState.active;
  // Apply to Cesium scene...
});

// Parameter changes: modify uniforms on existing stage, never recreate
// BAD:  destroy stage + create new stage  // causes shader recompilation hitch
// GOOD: stage.uniforms.u_intensity = newValue  // instant, no recompile
```

#### 6. Follow Mode (Shared Utility)

```ts
// cesium/hooks/useFollowMode.ts — ONE implementation, used by all layers
const follow = useFollowMode();

// Any layer can use it:
follow.track(entityOrPosition, { heading, pitch, range });
follow.stop();

// Internally: single preRender listener, user-orbit detection, cleanup via onCleanup
// Replaces the 3 copy-pasted implementations from satellites.ts, flights.ts, ships.ts
```

#### 7. Server Route Map

```ts
// server/index.ts — declarative routing via Bun.serve
Bun.serve({
  routes: {
    "/health": () => jsonResponse({ status: "ok" }),
    "/tle": handleTLE,              // 5min TTL cache
    "/flights": handleFlights,      // 10s TTL cache, transforms data server-side
    "/ships": handleShips,
    "/geocode": handleGeocode,      // LRU cache
    "/tiles/:z/:x/:y": handleTiles, // Explicit prefix, not catch-all
  },
  websocket: { /* AISStream relay with heartbeat */ },
});
```

## Migration Phases

### Phase 1: Foundation
- [ ] Install SolidJS, configure Bun bundler
- [ ] Create CesiumProvider and core hooks
- [ ] Set up base stores (selection, camera, ui)
- [ ] Create Shell layout component

### Phase 2: Cesium Bindings
- [ ] createEntity with reactive updates
- [ ] createBillboard / createBillboardCollection
- [ ] createPrimitive for custom rendering
- [ ] usePreRender, useCamera, useSelection hooks

### Phase 3: Layer System
- [ ] Layer registry with typed registration
- [ ] Migrate SatelliteLayer (most complex, good test)
- [ ] Migrate FlightLayer
- [ ] Migrate ShipLayer
- [ ] Migrate GroundLayer (traffic, CCTV, seismic)

### Phase 4: UI Components
- [ ] CommandBar with vim-style input
- [ ] LeftPanel (layer toggles, POIs)
- [ ] RightPanel (entity info panels)
- [ ] BottomBar (status, coordinates)
- [ ] Info panels (Satellite, Flight, Ship)

### Phase 5: Shaders & Effects
- [ ] Integrate shader system with stores
- [ ] Reactive shader switching
- [ ] Shader intensity controls

### Phase 6: Backend Refactor
- [ ] Restructure proxy routes using Bun.serve route map (not if/else chain)
- [ ] Add TTL caching: TLE (5min), OpenSky (10s), Geocode (LRU)
- [ ] Add request coalescing (concurrent identical requests share one upstream call)
- [ ] Transform OpenSky data server-side (strip unused fields, filter ground-only aircraft)
- [ ] Move Google Tiles behind explicit `/tiles/` prefix (not catch-all)
- [ ] Add WebSocket heartbeat monitoring for AISStream
- [ ] Add response helpers: `errorResponse()`, `imageResponse()`, `textResponse()`
- [ ] Standardize error response shape across all endpoints
- [ ] Add LRU eviction to OpenSky metadata cache
- [ ] Create `.env.example` with all required/optional variables
- [ ] Extract `PROXY_BASE_URL` to shared `config.ts`

### Phase 7: Polish
- [ ] UI refinements
- [ ] Performance audit
- [ ] Fix any remaining resource leaks
- [ ] Manual testing all features

## Success Criteria

1. **Functional Parity** — All current features work
2. **No Resource Leaks** — Verified via DevTools memory profiling
3. **Layer Extensibility** — Adding a new layer requires only:
   - New directory under `layers/`
   - Layer component with store
   - Registration call
4. **Clean Stores** — All state accessible from centralized stores
5. **Timeline-Ready** — Stores structured for future event-sourcing
6. **Zero Tech Debt Carryover** — None of the 13 identified debt items are present in the new codebase
7. **Server Extensibility** — Adding a new API endpoint requires only adding a route handler file + one line in the route map
8. **No Hardcoded URLs** — All proxy URLs come from `config.ts`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cesium reactivity conflicts | Medium | High | Thin bindings, escape hatches to raw API |
| Performance regression | Low | Medium | Profile early, use `untrack()` where needed |
| Full rewrite scope creep | Medium | High | Strict feature freeze, parity only |
| Bun bundler edge cases | Low | Low | Fall back to Vite if blocking issues |
| Re-introducing tech debt | Medium | Medium | Review checklist in this PRD; each PR checked against debt items |
| Upstream API rate exhaustion | Medium | High | Server-side TTL caching + request coalescing |

## Tech Debt Blocklist

These patterns from the old codebase must NEVER appear in the new code:

1. `new ConstantPositionProperty()` or `new ConstantProperty()` in a loop or per-frame update
2. `canvas.toDataURL()` for billboard texture updates
3. Entity API for layers with >50 items (use BillboardCollection or PointPrimitiveCollection)
4. Remote URLs for bundled assets (models, textures)
5. Copy-pasted follow-mode preRender listeners
6. Hardcoded `localhost:3001` or any proxy URL string literal
7. `if/else` route chain in server code
8. Upstream API calls without server-side caching
9. `PostProcessStage` recreation for parameter-only changes
10. Module-level mutable singletons for state (use SolidJS stores)
11. `as unknown as BlobPart` or similar unsafe casts to work around type mismatches

## Dependencies

### NPM Packages (to add)
- `solid-js` — Core framework
- `@solid-primitives/storage` — Optional, if persistence needed later

### Existing (keep)
- `cesium` — 3D globe
- `satellite.js` — SGP4 propagation
- `hls.js` — CCTV streaming

## Out of Scope

- Mobile/responsive design
- Authentication/multi-user
- Timeline recording implementation
- New data sources
- Automated testing

## Open Questions

None — all decisions finalized.
