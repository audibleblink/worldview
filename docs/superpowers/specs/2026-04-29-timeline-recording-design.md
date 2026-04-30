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
  name: string;               // human label, defaults to start timestamp
  startTime: number;          // Unix ms
  endTime: number | null;     // null while recording
  bbox: { west: number; south: number; east: number; north: number };
  tles: TLERecord[];          // satellite TLEs at record-start (for SGP4 replay)
  frameCount: number;
}
```

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

```ts
// PlaneSnapshot
{ icao24: string; lat: number; lon: number; alt: number; hdg: number; vel: number; cs: string }

// ShipSnapshot
{ mmsi: string; lat: number; lon: number; hdg: number; type: number; name: string }

// SeismicSnapshot
{ id: string; lat: number; lon: number; mag: number; depth: number; time: number }
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

**Recorder loop:** A `setInterval` at 5s reads the current SolidJS layer stores (planes, ships, seismic) and POSTs a frame to `POST /api/recordings/:id/frames`. The server appends it as an NDJSON line.

**Stop:** Calls `POST /api/recordings/:id/stop` — server writes `endTime` and `frameCount` to `meta.json`.

---

## Playback Engine (client)

**Frame loading:** On playback start, client fetches `GET /api/recordings/:id/frames` — server streams the NDJSON file. Client parses into a `Frame[]` array sorted by `t`. Held in memory.

**Seek:** Binary search `frames` for the two bracketing frames at `currentTime`. Lerp entity positions by `(currentTime - prev.t) / (next.t - prev.t)`.

**Play loop:** `requestAnimationFrame` — advances `currentTime` by `realDeltaMs × speed`. Finds bracketing frames, writes interpolated positions into the existing layer stores. Cesium renders them the same way as live data.

**Satellites during playback:** Re-run SGP4 from stored TLEs at `currentTime`. Same `satellite.js` code as live mode — no changes needed.

**Layer toggles:** Playback writes entity positions into the same layer stores. Existing `layerStore` visibility booleans show/hide the primitives. No playback-specific toggle code.

**Scrub (seek):** User drags scrubber → set `currentTime` directly → next frame loop tick picks it up.

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
| `src/recording/PlaybackEngine.ts` | Frame loading, rAF loop, interpolation, store writes |
| `src/ui/PlaybackBar.tsx` | Full-width bottom bar component |
| `src/ui/RecordSection.tsx` | Right panel record button + recordings list |
| `src/server/recordings.ts` | All server-side recording endpoints |

---

## Modified Files

| File | Change |
|---|---|
| `src/ui/RightPanelComponent.tsx` | Import and render `<RecordSection />` at bottom |
| `src/ui/ShellComponent.tsx` | Import and render `<PlaybackBar />` conditionally |
| `src/server/index.ts` | Register recording routes from `recordings.ts` |
| `src/stores/layers.ts` | No changes — existing visibility toggles reused as-is |

---

## What Doesn't Change

- Layer store shapes — playback writes to the same stores, same fields
- Cesium rendering — no changes to billboard/primitive code
- Live fetch logic — paused during playback via `appMode` check, not removed
- The command bar — no recording commands added (out of scope)

---

## Out of Scope

- CCTV video recording (stream capture is a separate problem)
- Sharing recordings between users
- Recording name editing
- Export to file
