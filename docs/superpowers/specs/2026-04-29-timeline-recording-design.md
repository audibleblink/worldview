# Timeline Recording & Playback — Design Spec

**Date:** 2026-04-29  
**Status:** Draft

---

## Overview

Add a recording and playback system to WorldView. Users record all live layer data for a geographic area over up to 24 hours, then scrub through it on a full-width timeline bar anchored to the bottom of the screen. Layer visibility can be toggled during playback.

---

## Decisions Log

| Question | Decision |
|---|---|
| What gets recorded? | All live layers automatically (planes, ships, satellites, seismic) |
| Storage | Server-side (proxy server, persists to disk) |
| Interpolation | Yes — smooth movement between snapshots (same dead-reckoning already used for planes) |
| Playback speeds | Fixed: 1×, 5×, 30×, 60×, 300× |
| Layer toggles during playback | Visibility only — all layers always recorded, toggle shows/hides primitives |
| Record button placement | Bottom of right panel |
| Recordings list | Scrollable list in right panel below record button |
| Bounding box | Current viewport bbox at record-start, locked for session |
| Playback UI | Full-width bar anchored to bottom, no rounded corners |

---

## App Modes

A top-level `appMode` signal drives behavior across the app:

```ts
type AppMode = "live" | "recording" | "playback";
```

- **`live`** — normal operation, all fetches active, record button idle
- **`recording`** — fetches still active, recorder snapshots stores every 5s, elapsed timer shown
- **`playback`** — all live fetches paused, frame loop drives layer stores, playback bar visible

Mode is stored in a new `src/stores/recording.ts`.

---

## Data Model

### File layout (server)

```
recordings/
  <id>/
    meta.json        ← session metadata
    frames.ndjson    ← one JSON line per snapshot, appended during record
```

`id` format: `<ISO-timestamp>_<random-4-hex>` e.g. `2026-04-29T14:00:00Z_a3f1`

### `meta.json`

```ts
{
  id: string;
  name: string;               // human label, defaults to ISO start timestamp
  startTime: number;          // Unix ms
  endTime: number | null;     // null if still recording or crashed
  bbox: { west: number; south: number; east: number; north: number };
  tles: TLERecord[];          // raw TLE line strings — re-parsed at playback start
  frameCount: number;         // updated on stop; may be stale if crashed
  complete: boolean;          // false if endTime is null; incomplete recordings are still playable
}

// TLERecord — raw strings only (satrec is not JSON-serializable)
interface TLERecord {
  name: string;
  noradId: string;
  line1: string;
  line2: string;
  category: SatelliteCategory;
}
```

**Incomplete recordings** (tab closed, crash): appear in the list labeled `(incomplete)`, playable using available frames.

### Frame (one NDJSON line in `frames.ndjson`)

```ts
{
  t: number;           // Unix ms
  planes: PlaneSnapshot[];
  ships: ShipSnapshot[];
  seismic: SeismicSnapshot[];
  // satellites omitted — recomputed from TLEs at playback time
}
```

Minimal per-entity snapshots (only fields needed for rendering):

Field names match existing store types exactly to avoid silent mapping errors:

```ts
// PlaneSnapshot — matches PlaneRecord fields
{ icao24: string; latitude: number; longitude: number; altitude: number; heading: number; velocity: number; callsign: string }

// ShipSnapshot — matches ShipRecord fields
// sog (speed over ground, knots) included to support dead-reckoning interpolation
{ mmsi: string; latitude: number; longitude: number; trueHeading: number; sog: number; shipType: number; shipName: string }

// SeismicSnapshot
{ id: string; latitude: number; longitude: number; magnitude: number; depth: number; time: number }
```

### Estimated file sizes (24h, typical density)

| Layer | Cadence | Estimated raw | Gzipped |
|---|---|---|---|
| Planes (~100 entities) | 10s | ~40 MB | ~8 MB |
| Ships (~50 entities) | 5s | ~20 MB | ~4 MB |
| Seismic (low freq) | 60s | <1 MB | <0.5 MB |
| **Total** | | **~61 MB** | **~13 MB** |

Satellites are excluded from frames — SGP4 positions are deterministic from TLEs stored in `meta.json`.

---

## Recording Engine (client)

**`src/stores/recording.ts`** — new SolidJS store, owns all recording/playback state:

```ts
{
  mode: AppMode;
  activeRecordingId: string | null;
  recordings: RecordingMeta[];      // list fetched from server
  playback: {
    recordingId: string;
    frames: Frame[];                // loaded into memory on playback start
    currentTime: number;            // virtual Unix ms
    playing: boolean;
    speed: 1 | 5 | 30 | 60 | 300;
  } | null;
}
```

**Recorder loop:** Per-layer cadences matching live fetch rates — planes every 10s, ships every 5s, seismic every 60s. A coordinator ticks every 5s and snapshots whichever layers are due. Frame POSTed to `POST /api/recordings/:id/frames`; server appends as NDJSON line. Dropped frames (network blip) are accepted as best-effort — interpolation between surrounding frames covers the gap at playback time. Server enforces the 6h cap: if `stop` is never called, the session is auto-finalized after 6h with `complete: false`.

**Stop:** Calls `POST /api/recordings/:id/stop` — server writes `endTime` and `frameCount` to `meta.json`.

---

## Playback Engine (client)

**Frame loading:** On playback start, client fetches `GET /api/recordings/:id/frames` — server streams the NDJSON file. Client parses into a `Frame[]` array sorted by `t`. Maximum recording duration enforced at **6 hours** to keep the in-memory array manageable. Recordings longer than 6h are out of scope for v1.

**Seek:** Binary search `frames` for the two bracketing frames at `currentTime`. Lerp entity lat/lon/alt/heading by `α = (currentTime - prev.t) / (next.t - prev.t)`.

**Play loop:** `requestAnimationFrame` — advances `currentTime` by `realDeltaMs × speed`. Calls imperative update handles exported from each layer component. Billboards are repositioned directly — no SolidJS store writes during the rAF loop (avoids triggering reactive updates at 60fps).

**Rendering path:** Each layer component exports a `PlaybackHandle`:
```ts
interface PlaybackHandle {
  update(prev: Frame, next: Frame, alpha: number): void; // all layers except satellites
  updateAtTime?(t: number): void;                        // satellites only (SGP4 takes absolute time)
  clear(): void;                                         // called on playback exit
}
```
`PlaybackEngine` calls `updateAtTime(t)` for satellites, `update(prev, next, alpha)` for everything else. Each handle writes directly to the layer's billboard collection via `billboardApi.update()` — same path the live pre-render loop uses, reusing the `itemMap` without exposing it.

**Satellites during playback:** Re-run SGP4 from TLEs stored in `meta.json` (raw line strings, re-parsed with `twoline2satrec()` at playback start — `satrec` is not JSON-serializable). Same `satellite.js` code as live mode.

**Layer toggles during playback:** The SEISMIC chip toggles `groundState.seismicEnabled` (single source of truth — no new `layers.seismic` key). Other chips toggle their existing `layerStore` boolean. `LayerRenderer` and `GroundLayer` pass a `hidden` prop during playback instead of unmounting — each layer calls `billboardCollection.setVisible(false)` without destroying the `itemMap`. `createBillboardCollection` gains a `setVisible(b)` helper for this.

**Mode transition ordering:**
- *Entering playback:* pause all layer fetch intervals → keep all layer components mounted (hidden prop, not unmount) → register `PlaybackHandle` refs → load frames → start rAF loop
- *Exiting playback:* stop rAF loop → call `handle.clear()` on all handles → remove hidden prop → restart fetch intervals (next tick repopulates stores from live data)

**Scrub (seek):** User drags scrubber → set `currentTime` directly → next rAF tick picks it up.

**Speed note:** At 300×, each 16ms rAF tick advances ~4.8s of virtual time. With 5s frame cadence, motion is effectively a step-function. Acceptable as fast-forward scan; smooth motion only at 1×–30×.

---

## Server Endpoints (new, added to existing proxy server)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/recordings` | Create new recording session. Body: `{ bbox, tles }`. Returns `{ id }`. |
| `POST` | `/api/recordings/:id/frames` | Append a frame. Body: frame JSON. |
| `POST` | `/api/recordings/:id/stop` | Finalize recording (write endTime). |
| `GET` | `/api/recordings` | List all recordings (returns array of `meta.json` contents). |
| `GET` | `/api/recordings/:id/frames` | Stream frames.ndjson. |
| `DELETE` | `/api/recordings/:id` | Delete recording directory. |

All under the existing `Bun.serve()` in `src/server/index.ts`.

---

## UI

### Right panel — record section

Added at the **bottom** of `RightPanel`, below the live readout, above nothing (margin-top: auto pushes it down):

```
┌─────────────────┐
│  RECORDING      │  ← panel-header style
│  [● START REC]  │  ← full-width button, red border
│                 │
│  PAST           │  ← panel-header style, shown when recordings exist
│  2026-04-29 14h │  ← clickable list items → enter playback
│  2026-04-29 09h │
└─────────────────┘
```

**States of the button:**
- Idle: dark background, red border, `● START REC`
- Recording: solid red fill, `■ STOP REC` + elapsed timer below

### Playback bar

Full-width, anchored to the bottom of the viewport (below the globe/panel row), no rounded corners, hard top border.

```
┌────────────────────────────────────────────────────────────┐
│ ▶  08:24:15  ████████░░░░░░░░░░░░░░░░░  23:59  [30×]  [✕] │
│              00:00   06:00  12:00  18:00  24:00             │
│ LAYERS: [PLANES] [SHIPS] [SATS] [CCTV off] [SEISMIC off]   │
└────────────────────────────────────────────────────────────┘
```

- **▶/⏸** — play/pause
- **Scrubber** — draggable, shows tick marks at 6h intervals
- **Speed button** — cycles through 1×, 5×, 30×, 60×, 300× on click
- **✕** — exits playback, returns to live mode, re-enables record button
- **Layer chips** — plain text chips, no rounding, toggle `layerStore` visibility booleans

### Mode indicator

Top bar's existing `mode-indicator` element shows `PLAYBACK` (in cyan) during playback, `NORMAL` otherwise. No new element needed.

---

## New Files

| File | Purpose |
|---|---|
| `src/stores/recording.ts` | App mode, recording state, playback state |
| `src/recording/Recorder.ts` | Snapshot loop, frame serialization, server calls |
| `src/recording/PlaybackEngine.ts` | Frame loading, rAF loop, interpolation, direct billboard updates via PlaybackHandle |
| `src/ui/PlaybackBar.tsx` | Full-width bottom bar component |
| `src/ui/RecordSection.tsx` | Right panel record button + recordings list |
| `src/server/recordings.ts` | All server-side recording endpoints |

---

## Modified Files

| File | Change |
|---|---|
| `src/ui/RightPanelComponent.tsx` | Import and render `<RecordSection />` at bottom |
| `src/ui/ShellComponent.tsx` | Import and render `<PlaybackBar />` conditionally |
| `src/server/index.ts` | Register recording routes via `Bun.serve()` `routes:` object (native `:id` support — no helper needed) |
| `src/stores/layers.ts` | No changes — seismic visibility in playback uses existing `groundState.seismicEnabled` |
| `src/layers/LayerRenderer.tsx` | Replace `<Show>` unmount with `hidden` prop during playback — prevents `onCleanup` destroying billboard collections on layer chip toggle |
| `src/layers/ground/GroundLayer.tsx` | Replace `<Show when={groundState.seismicEnabled}>` with `hidden` prop pass-through during playback, same pattern as `LayerRenderer` |
| `src/cesium/createBillboardCollection.ts` | Add `setVisible(b: boolean)` helper so `hidden` prop hides billboards uniformly across all layers |
| `src/layers/planes/PlaneLayer.tsx` | Gate 10s fetch interval behind `appMode !== 'playback'`; export `PlaybackHandle` |
| `src/layers/ships/ShipLayer.tsx` | Gate 8s polling interval behind `appMode !== 'playback'`; export `PlaybackHandle` |
| `src/layers/satellites/SatelliteLayer.tsx` | Gate 2.5s update interval behind `appMode !== 'playback'`; export `PlaybackHandle` (uses `updateAtTime(t)` variant — SGP4 takes absolute time) |
| `src/layers/ground/SeismicLayer.tsx` | Gate polling behind `appMode !== 'playback'`; export `PlaybackHandle`; ring animation driven from `currentTime` via `usePreRender` instead of `performance.now()` so rings animate correctly at any playback speed |

---

## What Doesn't Change

- Layer store shapes — playback writes to the same stores, same fields
- The command bar — no recording commands added (out of scope)

---

## Out of Scope

- CCTV video recording (stream capture is a separate problem)
- CCTV layer chip in playback bar (no data is recorded; chip is omitted from the UI)
- Sharing recordings between users
- Recording name editing
- Export to file
- Recordings longer than 6 hours (server auto-finalizes at 6h with `complete: false`)
