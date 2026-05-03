# Execution Plan — Timeline Recording & Playback

**Spec:** `docs/superpowers/specs/2026-04-29-timeline-recording-design.md`
**Target repo:** `/Users/blink/Code/worldview/dev`
**Runtime:** Bun + SolidJS + Cesium

---

## Strategy

Five sequential phases. Each phase ends with a green `bun test` (and, where relevant, a smoke check via `curl` or a browser-console probe via `window.__viewer`). Every phase leaves the app fully functional in live mode — recording/playback features turn on incrementally and are gated behind the `appMode` signal so half-built code never breaks live use.

| Phase | Name | Depends on |
|---|---|---|
| 1 | Foundations: stores, types, billboard `setVisible` | — |
| 2 | Server: recording endpoints + on-disk storage | 1 |
| 3 | Recorder: client snapshot loop + UI record section | 1, 2 |
| 4 | Playback engine: handles, frame loading, rAF loop, layer hide-not-unmount | 1, 2, 3 |
| 5 | Playback UI + mode-indicator + integration polish | 4 |

Each phase has a verification block. The autonomous feedback loop is `bun test` + (phase 2 onward) a `scripts/verify-phaseN.sh` curl/probe script that exits non-zero on regression.

---

## Chunk 1: Phase 1 — Foundations

**Goal:** Everything later phases need to import. No behavior change visible to the user.

**Depends on:** nothing.

### Files created

| File | Responsibility |
|---|---|
| `src/stores/recording.ts` | `appMode` signal + recording/playback state store + mutations |
| `src/recording/types.ts` | Shared types: `Frame`, `PlaneSnapshot`, `ShipSnapshot`, `SeismicSnapshot`, `TLERecord`, `RecordingMeta`, `PlaybackHandle`, `BBox` |
| `src/__tests__/recording-store.test.ts` | Unit tests for store mutations |
| `src/__tests__/billboard-setvisible.test.ts` | Unit test for new `setVisible` helper |

### Files modified

| File | Change |
|---|---|
| `src/cesium/createBillboardCollection.ts` | Add `setVisible(visible: boolean): void` to the public API; iterate `collection.length`, set each billboard's `.show` |

### Tasks

- [x] **1.1 Define shared recording types** in `src/recording/types.ts`
    - [x] `AppMode = "live" | "recording" | "playback"`
    - [x] `BBox = { west, south, east, north }` (numbers)
    - [x] `TLERecord = { name, noradId, line1, line2, category }` — match `SatelliteCategory` import from `src/layers/satellites/types.ts`
    - [x] `RecordingMeta = { id, name, startTime, endTime: number|null, bbox, tles: TLERecord[], frameCount, complete }`
    - [x] `PlaneSnapshot` — exact subset of `PlaneRecord`: `icao24, latitude, longitude, altitude, heading, velocity, callsign`
    - [x] `ShipSnapshot` — exact subset of `ShipRecord`: `mmsi, latitude, longitude, trueHeading, sog, shipType, shipName` (note: `shipName` maps to existing `name` field — document the mapping inline)
    - [x] `SeismicSnapshot` — `id, latitude, longitude, magnitude, depth, time`
    - [x] `Frame = { t: number, planes: PlaneSnapshot[], ships: ShipSnapshot[], seismic: SeismicSnapshot[] }`
    - [x] `PlaybackHandle = { update?(prev, next, alpha): void; updateAtTime?(t: number): void; clear(): void }`

- [x] **1.2 Create `src/stores/recording.ts`**
    - [x] `createStore` for state shape from spec §"Recording Engine (client)"
    - [x] Exports: `recording` (store), `setMode`, `setActiveRecordingId`, `setRecordingsList`, `setPlayback`, `setPlaybackTime`, `setPlaybackPlaying`, `setPlaybackSpeed`, `clearPlayback`
    - [x] Speed cycle helper: `cyclePlaybackSpeed()` rotates through `[1, 5, 30, 60, 300]`

- [x] **1.3 Add `setVisible(visible)` to `createBillboardCollection`**
    - [x] Walk `collection.length`, set `collection.get(i).show = visible`
    - [x] No-op when `collection` is null
    - [x] Does NOT touch `itemMap`

- [x] **1.4 Tests**
    - [x] `recording-store.test.ts`: starts in `live`; `setMode("recording")` flips it; speed cycle wraps after 300; `clearPlayback` resets `playback` to `null`
    - [x] `billboard-setvisible.test.ts`: add 3 billboards, `setVisible(false)`, every billboard has `show === false`; `setVisible(true)` flips back; `itemMap` ids unchanged

### Verification

```bash
bun test src/__tests__/recording-store.test.ts src/__tests__/billboard-setvisible.test.ts
```

**Expected:** all tests pass. App build still succeeds:

```bash
bun build src/index.html --outdir=dist > /dev/null && echo OK
```

**Done when:** both commands return exit code 0.

---

## Chunk 2: Phase 2 — Server recording endpoints

**Goal:** A standalone HTTP API that can persist recordings to disk and stream them back. Verified entirely with `curl` — no client wiring yet.

**Depends on:** Chunk 1 (uses `RecordingMeta`/`Frame` types).

### Files created

| File | Responsibility |
|---|---|
| `src/server/recordings.ts` | All six recording route handlers + on-disk layout helpers |
| `src/__tests__/server-recordings.test.ts` | In-process tests that hit the handlers via `fetch` against `Bun.serve()` |
| `scripts/verify-phase2.sh` | curl-based smoke test: create → append frames → stop → list → fetch → delete |

### Files modified

| File | Change |
|---|---|
| `src/server/index.ts` | Mount recording routes. Add a single `/api/recordings/` prefix entry to the existing dynamic route table; delegate path parsing to `handleRecordings` in `recordings.ts` |
| `.gitignore` | Add `recordings/` |

### On-disk layout

```
recordings/
  <id>/
    meta.json
    frames.ndjson
```

`id` format from spec: `<ISO-timestamp>_<4-hex>`, e.g. `2026-04-29T14-00-00Z_a3f1` (use `-` not `:` for filename safety on all platforms; document inline).

### Tasks

- [x] **2.1 `src/server/recordings.ts`: storage helpers**
    - [x] `RECORDINGS_DIR` constant — resolved relative to `process.cwd()` (override via env `WORLDVIEW_RECORDINGS_DIR` for tests)
    - [x] `recordingDir(id)`, `metaPath(id)`, `framesPath(id)`
    - [x] `ensureDir(path)` — `await mkdir(path, { recursive: true })`
    - [x] `readMeta(id): Promise<RecordingMeta|null>` (returns null on not-found)
    - [x] `writeMeta(id, meta)` — `Bun.write(metaPath(id), JSON.stringify(meta))`
    - [x] `appendFrameLine(id, line: string)` — uses `node:fs/promises` `appendFile` (Bun.file writer append unreliable)
    - [x] `genId()` — `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomHex(4)}`

- [x] **2.2 Route handlers**
    - [x] `POST /api/recordings` — body `{ bbox, tles, name? }`. Validate shape. Build `RecordingMeta` with `startTime=Date.now()`, `endTime=null`, `frameCount=0`, `complete=false`. Write `meta.json`. Touch empty `frames.ndjson`. Return `{ id }` 201.
    - [x] `POST /api/recordings/:id/frames` — body is one Frame JSON. Append `JSON.stringify(frame) + "\n"` to `frames.ndjson`. Increment in-memory frame counter (do NOT rewrite `meta.json` per frame — too much I/O). Return `204`.
    - [x] `POST /api/recordings/:id/stop` — read `meta.json`, set `endTime=Date.now()`, count lines in `frames.ndjson` for `frameCount`, set `complete=true`, write back. Return updated meta `200`.
    - [x] `GET /api/recordings` — list directories under `recordings/`, read each `meta.json`, return `RecordingMeta[]` sorted by `startTime` desc. Skip directories whose `meta.json` is missing or unreadable (log + skip).
    - [x] `GET /api/recordings/:id/frames` — stream `frames.ndjson` with `Content-Type: application/x-ndjson`. Use `Bun.file(framesPath(id)).stream()` directly as Response body.
    - [x] `DELETE /api/recordings/:id` — `rm -rf` the directory via `await rm(dir, { recursive: true, force: true })`. Return `204`.

- [x] **2.3 6-hour auto-finalize watchdog**
    - [x] Per-recording `setTimeout` on create, 6h, that calls the same finalize logic as `/stop` but leaves `complete=false`. Cancel timer on explicit stop.
    - [x] Tracker is a `Map<id, Timer>` in module scope. On server restart, in-flight recordings stay un-finalized — that's acceptable for v1 (matches spec: "incomplete recordings appear with `(incomplete)` label").

- [x] **2.4 Wire into `src/server/index.ts`**
    - [x] Add `["/api/recordings", handleRecordings]` to the dynamic route prefix table
    - [x] `handleRecordings(req)` parses path + method, dispatches to one of the six handlers
    - [x] Apply existing CORS headers to all responses

- [x] **2.5 Tests (`src/__tests__/server-recordings.test.ts`)**
    - [x] `beforeEach`: set `WORLDVIEW_RECORDINGS_DIR` to a tmpdir (`fs.mkdtemp`); `afterEach`: `rm -rf` it
    - [x] Spin up `Bun.serve({ port: 0, fetch: ... })` with the recordings handler bound; capture `server.port`
    - [x] Test: create returns id; meta.json on disk has correct shape
    - [x] Test: append two frames; stop; meta.json has `frameCount=2, complete=true`
    - [x] Test: list returns recently-created recording
    - [x] Test: fetch frames streams two NDJSON lines
    - [x] Test: delete removes the directory; subsequent list excludes it
    - [x] Test: GET frames on unknown id returns 404
    - [x] Test: 6h watchdog — `_testOnlyFireFinalize(id)` exported; fire it; meta has `complete=false` and `endTime` set

- [x] **2.6 `scripts/verify-phase2.sh`**
    - [x] Boots its own server on port 3099 using the recordings handler
    - [x] `curl POST /api/recordings` → capture id
    - [x] `curl POST .../frames` x2 with sample bodies
    - [x] `curl POST .../stop`
    - [x] `curl GET /api/recordings` → grep for id
    - [x] `curl GET .../frames` → assert 2 lines
    - [x] `curl DELETE` → assert 204
    - [x] `set -e` and exit 0 only if all assertions pass
    - [x] Print final `OK` line

### Verification

```bash
bun test src/__tests__/server-recordings.test.ts
bash scripts/verify-phase2.sh   # boots its own server, runs curl checks, kills it
```

**Done when:** unit tests pass AND `verify-phase2.sh` prints `OK` and exits 0.

---

## Chunk 3: Phase 3 — Recorder (client) + Right-Panel UI

**Goal:** Clicking "● START REC" begins a 6h-capped recording, sending frames to the server. "■ STOP REC" finalizes. Past recordings list renders. No playback yet.

**Depends on:** Chunks 1–2.

### Files created

| File | Responsibility |
|---|---|
| `src/recording/Recorder.ts` | Snapshot loop: subscribes to layer stores, posts frames to server. One class instance owned by `recording.ts` store actions. |
| `src/recording/snapshot.ts` | Pure functions: `snapshotPlanes(planeStore)`, `snapshotShips(shipStore)`, `snapshotSeismic(groundState)` returning the typed snapshots from Chunk 1 |
| `src/recording/api.ts` | Tiny fetch wrapper around the Phase-2 endpoints; one function per endpoint |
| `src/ui/RecordSection.tsx` | Right-panel record section — button + recordings list |
| `src/ui/RecordSection.css` | (Optional, if styles can't live alongside existing right-panel CSS — prefer inline class names that already exist) |
| `src/__tests__/recorder.test.ts` | Tests Recorder using a mock fetch + fake timers |
| `src/__tests__/snapshot.test.ts` | Snapshot functions: input store → expected snapshot shape |

### Files modified

| File | Change |
|---|---|
| `src/ui/RightPanelComponent.tsx` | Render `<RecordSection />` at the bottom (mount with `margin-top: auto` per spec) |

### Tasks

- [x] **3.1 Snapshot pure functions (`src/recording/snapshot.ts`)**
    - [x] `snapshotPlanes(records: PlaneRecord[]): PlaneSnapshot[]` — pick the seven fields
    - [x] `snapshotShips(records: ShipRecord[]): ShipSnapshot[]` — map `name` → `shipName`, keep `sog`
    - [x] `snapshotSeismic(quakes: EarthquakeData[]): SeismicSnapshot[]` — map `time: Date` → `time: number` (`.getTime()`)

- [x] **3.2 Recorder class (`src/recording/Recorder.ts`)**
    - [x] Imports the API wrapper from `src/recording/api.ts` (Task 3.3)
    - [x] Constructor takes `id: string` + injected store getters (planes, ships, ground) + optional `Clock` (default real `setInterval/clearInterval/Date.now`) so the class is testable without SolidJS
    - [x] **Single 5s coordinator** (per spec): one `setInterval(tick, 5_000)`. The handler maintains last-emit timestamps `{planes: 0, ships: 0, seismic: 0}` and emits each layer once its cadence elapses (planes 10s, ships 5s, seismic 60s).
    - [x] Each tick builds a `Frame` containing **all three arrays always present**, with empty arrays for layers not due this tick. (Locks the wire format so the playback engine can rely on shape.)
    - [x] POST the frame via `appendFrame(id, frame)` — best-effort: failed posts are logged + dropped (spec: "interpolation covers gaps")
    - [x] `stop()` — clears coordinator, calls `stopRecording(id)`
    - [x] **Active-recorder reference**: `Recorder.ts` exports a module-scoped `let activeRecorder: Recorder | null` plus `getActiveRecorder()` and `setActiveRecorder(r)` helpers. `RecordSection` calls these — no instance variable lives in component state.

- [x] **3.3 API wrapper (`src/recording/api.ts`)**
    - [x] `createRecording(bbox, tles, name?): Promise<{id}>`
    - [x] `appendFrame(id, frame): Promise<void>`
    - [x] `stopRecording(id): Promise<RecordingMeta>`
    - [x] `listRecordings(): Promise<RecordingMeta[]>`
    - [x] `fetchFrames(id): Promise<Frame[]>` — streams NDJSON, splits on `\n`, parses each line
    - [x] `deleteRecording(id): Promise<void>`

- [x] **3.4 RecordSection component**
    - [x] Reads `recording.mode` from store
    - [x] Obtains the Cesium viewer via the existing `useCesium()` hook (same pattern other UI components use). Do **not** read `window.__viewer`.
    - [x] Renders two sub-headers in `panel-header` style per spec §"Right panel — record section":
        - `RECORDING` header above the start/stop button
        - `PAST` header above the recordings list, only shown when `recording.recordings.length > 0`
    - [x] Idle state: button `● START REC` (red border, dark bg). On click:
        - Capture viewport bbox from `viewer.camera.computeViewRectangle()`. If it returns `undefined` (oblique angle), fall back to a ±5° box around `viewer.camera.positionCartographic` and `console.warn`.
        - Build `TLERecord[]` by reading **raw `name`, `noradId`, `line1`, `line2`, `category`** from each entry in the satellite store (per spec — `satrec` is non-serializable and must not be included)
        - `await createRecording({bbox, tles})` → get id
        - `setActiveRecordingId(id)`, `setMode("recording")`, `setActiveRecorder(new Recorder(id, getters)); getActiveRecorder().start()`
    - [x] Recording state: solid red `■ STOP REC` + elapsed timer (mm:ss) — timer driven by a local `setInterval(() => setNow(Date.now()), 1000)` signal cleaned up on unmount
    - [x] On stop: `getActiveRecorder()?.stop(); setActiveRecorder(null); setMode("live")`; then `await listRecordings()` → `setRecordingsList`
    - [x] Recordings list: `<For>` over `recording.recordings` sorted by `startTime` desc; each row shows formatted timestamp + `(incomplete)` suffix if `!complete`; clicking a row is a Phase-3 no-op `console.log("entering playback", id)` (Phase 5 wires it)
    - [x] On mount: `listRecordings()` → `setRecordingsList`

- [x] **3.5 Wire `<RecordSection />` into `RightPanelComponent.tsx`**
    - [x] Append after the LIVE READOUT block; ensure outer container is flex-column so `margin-top: auto` on `RecordSection` pushes it to the bottom

- [x] **3.6 Tests**
    - [x] `snapshot.test.ts`: feed canned `PlaneRecord[]` → expect exact `PlaneSnapshot[]`. Same for ships (verifying name→shipName), seismic (verifying time→number).
    - [x] `recorder.test.ts`:
        - Mock `fetch` (`globalThis.fetch = mock(...)`)
        - Use `Bun`'s `setTimeout` directly with manual advance via a fake clock (`bun:test` doesn't have built-in fake timers — implement a tiny `Clock` injection in `Recorder` constructor, default `setInterval/clearInterval`, swap in test)
        - Start recorder; advance 5s; assert no fetch yet (none due — planes due at 10s, ships at 5s)
        - Advance another 5s; assert one POST containing ships only
        - Advance to 10s mark; assert POST containing planes
        - Advance to 60s; assert POST containing seismic
        - `stop()`; assert `POST /stop` called

### Verification

```bash
bun test src/__tests__/snapshot.test.ts src/__tests__/recorder.test.ts
```

**Manual smoke check** (optional once `verify-phase3.sh` passes — retained for human visual confirmation):
1. `bun run src/server/index.ts` (proxy + recordings server)
2. `bun --hot src/index.ts` (app)
3. Open app, click `● START REC`, wait 30s, click `■ STOP REC`
4. `ls recordings/` — one new directory
5. `cat recordings/*/frames.ndjson | wc -l` — ≥ 3 lines

**Autonomous check:** `scripts/verify-phase3.sh` — boots server in background, posts a synthetic `meta`+`frame` directly via API (mimicking what the client would do), kills server, asserts disk state. Same shape as phase-2 script but exercises the full create/append/stop happy path again to catch regressions from server changes.

**Done when:** all unit tests pass + `verify-phase3.sh` prints `OK`.

---

## Chunk 4: Phase 4 — Playback Engine + layer hide-not-unmount

**Goal:** Clicking a past recording loads it, pauses live fetches, and drives layers from the in-memory frame array via a rAF loop. Layer toggles during playback hide billboards without destroying them.

**Depends on:** Chunks 1–3.

### Files created

| File | Responsibility |
|---|---|
| `src/recording/PlaybackEngine.ts` | Frame loading, binary-search seek, rAF loop, `PlaybackHandle` registry |
| `src/recording/interpolate.ts` | Pure functions: `lerpAngle(a, b, α)`, `lerp(a, b, α)`, `findBracket(frames, t): [prev, next, alpha]` (binary search) |
| `src/__tests__/interpolate.test.ts` | Lerp + bracket-search tests |
| `src/__tests__/playback-engine.test.ts` | rAF-loop test (with mocked rAF + handle assertions) |

### Files modified

| File | Change |
|---|---|
| `src/layers/LayerRenderer.tsx` | Replace `<Show when={layers.X}>{...}</Show>` for planes/ships/satellites with `<LayerX hidden={!layers.X || (mode==='playback' && !layers.X)} />` and pass `playbackHandle` ref-getter prop. Each child stays mounted in playback. |
| `src/layers/ground/GroundLayer.tsx` | Same hide-not-unmount pattern for `SeismicLayer` gated by `groundState.seismicEnabled` |
| `src/layers/planes/PlaneLayer.tsx` | (a) Gate `setInterval` body behind `recording.mode !== "playback"`. (b) Accept optional `hidden` prop → call `billboardApi.setVisible(!hidden)`. (c) Export `PlaybackHandle` via `props.onPlaybackHandle?.(handle)` callback called once after `billboardApi` is created. Handle's `update(prev, next, alpha)` lerps lat/lon/alt/heading per icao24 and calls `billboardApi.update(id, { position, rotation })`. Handle's `clear()` calls `billboardApi.clear()`. |
| `src/layers/ships/ShipLayer.tsx` | Same pattern as planes — gate polling, accept `hidden`, export handle (use `sog` for matching dead-reckon style; lerp position by mmsi). |
| `src/layers/satellites/SatelliteLayer.tsx` | Gate 2.5s update behind playback. Export handle with `updateAtTime(t)`: re-run SGP4 at `t` for each TLE, update billboard positions. On entering playback, the engine passes the recording's TLEs (re-parsed via `twoline2satrec`) into the handle via a setup call — design API: `handle.setupForPlayback(tles: TLERecord[])` then `handle.updateAtTime(t)`. |
| `src/layers/ground/SeismicLayer.tsx` | Gate USGS polling behind playback. Export handle whose `update(prev, next, alpha)` reconciles the seismic entity set: spawn rings for any quake whose `time` is within `[prev.t, next.t]`. Replace the `performance.now()` in ring-radius `CallbackProperty` with `getClock()` — a function injected by mode (`performance.now` in live, `playbackEngine.currentTime` in playback). |
| _(see Files created above)_ | _(`PlaybackEngine.ts` is new, not modified)_ |

### `PlaybackEngine` API

```ts
class PlaybackEngine {
  constructor();
  registerHandle(layer: "planes"|"ships"|"satellites"|"seismic", handle: PlaybackHandle): void;
  unregisterHandle(layer: string): void;
  async load(id: string): Promise<Frame[]>;  // fetchFrames + setup satellites; returns frames for caller
  start(): void;                             // begins rAF loop
  stop(): void;                              // stops loop, calls clear() on all handles
  setTime(t: number): void;                  // for scrub
  setSpeed(s: number): void;
  play(): void;                              // resumes
  pause(): void;
  // reads: currentTime, playing, speed, frames (sorted)
}
```

### Tasks

- [x] **4.1 `src/recording/interpolate.ts`**
    - [x] `lerp(a, b, alpha) = a + (b-a) * alpha`
    - [x] `lerpAngle(a, b, alpha)` — handles 360° wraparound by choosing shortest arc
    - [x] `findBracket(frames, t)`:
        - If `frames.length===0` → `null`
        - If `t <= frames[0].t` → `[frames[0], frames[0], 0]`
        - If `t >= frames[frames.length-1].t` → `[last, last, 0]`
        - Else binary-search for `prev.t ≤ t < next.t`; alpha = `(t - prev.t)/(next.t - prev.t)`

- [x] **4.2 `PlaybackEngine` skeleton**
    - [x] `handles` Map<layerName, PlaybackHandle>
    - [x] `register/unregister` methods
    - [x] `load(id)`: calls `fetchFrames(id)` → sort by `t` → returns `Frame[]`
    - [x] `start()`: stash `lastWallClock = performance.now()`, set `playing=true`, call `tick`
    - [x] `tick()` (recursive via `requestAnimationFrame`): advances `currentTime`, clamps, calls handles
    - [x] `setTime(t)` — directly assigns `currentTime`
    - [x] `stop()` — `playing=false`, cancel rAF, iterate handles → `clear()`
    - [x] `play()`, `pause()`, `setSpeed()`

- [x] **4.3 Layer changes — `LayerRenderer.tsx` and `GroundLayer.tsx`**
    - [x] Replace `<Show>` with hide-not-unmount: keep layers mounted during playback, pass `hidden` prop
    - [x] Module singleton `playbackEngine` exported from `PlaybackEngine.ts`

- [x] **4.4 Per-layer modifications (planes, ships, satellites, seismic)**
    - [x] `hidden?: boolean` prop + `createEffect` calling `billboardApi.setVisible(!hidden)`
    - [x] Gate live polling: `if (recording.mode === 'playback') return` in refresh functions
    - [x] `playbackEngine.registerHandle(layerName, handle)` after billboard creation
    - [x] `playbackEngine.unregisterHandle(layerName)` in `onCleanup`
    - [x] `handle.update(prev, next, alpha)` — lerp positions, snap for new entities, remove for gone

- [x] **4.5 Satellites special case**
    - [x] `setupForPlayback(tles)` parses TLEs via `twoline2satrec`
    - [x] `updateAtTime(t)` re-runs SGP4 at `new Date(t)` for each playback satrec
    - [x] `clear()` drops playback satrec map

- [x] **4.6 Seismic ring clock injection** (minimal: gated polling + entity reconciliation handle)

- [x] **4.7 Tests**
    - [x] `interpolate.test.ts`: 18 tests — lerp, lerpAngle wraparound, findBracket
    - [x] `playback-engine.test.ts`: 13 tests — load, tick, handles, stop/clear, satellite dispatch
    - [x] `layer-hidden.test.ts`: 7 tests — hide-not-unmount guarantee via `applyVisibleToCollection`

### Verification

```bash
bun test src/__tests__/interpolate.test.ts src/__tests__/playback-engine.test.ts
# also re-run prior phase tests to catch regressions
bun test
```

**Smoke check (`scripts/verify-phase4.md`):**
1. Use the recording from Phase 3 (or record a fresh 30s one)
2. Click it in the right-panel list — `console.log` from Phase 3 still fires; in this phase we'll wire actual playback. So:
3. In browser console: `await window.__playback.load("<id>"); window.__playback.start();`
4. Watch billboards animate. Confirm planes move smoothly between sampled positions.
5. `window.__playback.setSpeed(30); window.__playback.setTime(window.__playback.frames[1].t)` — verify scrub works.
6. `window.__playback.stop()` — billboards clear; flip a layer chip — live mode resumes (planes refetch within 10s).

(Expose `window.__playback = playbackEngine` in `src/recording/PlaybackEngine.ts` gated by `if (import.meta.env.DEV) (window as any).__playback = playbackEngine;` — removed automatically in production builds.)

**Done when:** all `bun test` pass; the manual smoke check completes without console errors; live mode is restored cleanly after `stop()`.

---

## Chunk 5: Phase 5 — Playback UI bar + mode-indicator + integration polish

**Goal:** No more `window.__playback` console pokes — clicking a recording row enters playback through the actual UI; the bottom bar drives play/pause/scrub/speed/exit; mode-indicator shows "PLAYBACK".

**Depends on:** Chunks 1–4.

### Files created

| File | Responsibility |
|---|---|
| `src/ui/PlaybackBar.tsx` | Full-width bottom bar — play button, scrubber, time labels, speed button, layer chips, exit button |
| `src/ui/PlaybackBar.css` | Bar-specific CSS (no border-radius, hard top border, full width) |
| `src/__tests__/playback-bar.test.ts` | Logic-only tests for handler module (Task 5.5); no JSX rendering |
| `src/ui/playbackBarHandlers.ts` | Pure event handlers extracted from PlaybackBar (Task 5.5) |

### Files modified

| File | Change |
|---|---|
| `src/ui/ShellComponent.tsx` | Render `<PlaybackBar />` conditionally on `recording.mode === "playback"`. Update `mode-indicator` to read `recording.mode` first (mapping `"playback"` → `"PLAYBACK"` cyan, `"recording"` → `"RECORDING"` red, else fall back to existing shader-based label). |
| `src/ui/RecordSection.tsx` | Replace the Phase-3 `console.log` with: `playbackEngine.load(id).then(() => { setMode("playback"); setPlayback({ recordingId, frames, currentTime: frames[0].t, playing: true, speed: 1 }); playbackEngine.start(); })` |

### Tasks

- [ ] **5.1 PlaybackBar layout (matches spec ASCII art)**
    - Row 1: play/pause button | current-time label | scrubber (HTML `<input type=range>` styled flat) | end-time label | speed button | exit (✕)
    - Row 2 (under scrubber): ~5 evenly-spaced HH:MM labels across `[frames[0].t, frames[frames.length-1].t]`. (Spec line 235 says "tick marks at 6h intervals" — actual spacing depends on recording length, capped at 6h.)
    - Row 3: `LAYERS:` + chips for PLANES / SHIPS / SATS / SEISMIC (no CCTV per spec)

- [ ] **5.2 Wiring**
    - [ ] Play/pause button: toggles `recording.playback.playing` via store mutation; calls `playbackEngine.play()`/`.pause()`
    - [ ] **Scrubber display sync** (resolves the no-store-writes-at-60fps constraint from Phase 4): the bar runs its own `setInterval(() => setPlaybackTime(playbackEngine.currentTime), 250)` (4 Hz). The scrubber reads from `recording.playback.currentTime` for thumb position. User-driven `onInput` writes immediately: `playbackEngine.setTime(value); setPlaybackTime(value);` — the engine adopts on the next rAF tick.
    - [ ] Speed button: shows current speed × suffix; click → `cyclePlaybackSpeed()` (returns the new value) → `playbackEngine.setSpeed(newValue)`
    - [ ] Layer chips: clicking PLANES toggles `layers.planes`; SHIPS → `layers.ships`; SATS → `layers.satellites`; SEISMIC → `groundState.seismicEnabled` directly (per spec — single source of truth)
    - [ ] Exit (✕) button:
        1. `playbackEngine.stop()` (calls `handle.clear()` per layer)
        2. `clearPlayback()`
        3. `setMode("live")`
        4. Layers see mode change → re-arm their `setInterval`s in their `createEffect` (per Task 4.4); next tick they refetch.
    - [ ] **RecordSection click-to-play wiring** (replaces Phase-3 `console.log`): on row click `const frames = await playbackEngine.load(id); setMode("playback"); setPlayback({ recordingId: id, frames, currentTime: frames[0].t, playing: true, speed: 1 }); playbackEngine.start();`. Relies on `playbackEngine.load()` returning the frames array (added in Phase 4 Task 4.2).

- [ ] **5.3 Mode indicator update in `ShellComponent.tsx`**
    - [ ] New computed: `modeLabel = () => recording.mode === "playback" ? "PLAYBACK" : recording.mode === "recording" ? "RECORDING" : (shaders.active?.toUpperCase() ?? "NORMAL")`
    - [ ] Add inline color: `playback → cyan` (spec-required), `recording → red` (polish addition; spec only mandates PLAYBACK)

- [ ] **5.4 Conditional bar render**
    - [ ] In `ShellComponent.tsx`: during playback, **replace** `<BottomBar />` with `<PlaybackBar />`: `<Show when={recording.mode === "playback"} fallback={<BottomBar />}><PlaybackBar /></Show>`. Spec calls for full-width bottom anchoring with hard top border; replacement avoids stacking ambiguity entirely.

- [ ] **5.5 Tests (`playback-bar.test.ts` — logic-only, no DOM)**
    - [ ] Solid component-DOM testing isn't established in this project. Instead of rendering JSX, **extract the bar's event handlers into pure functions** in a small `src/ui/playbackBarHandlers.ts` and unit-test those:
        - `onPlayClick(engine, store)` — flips `playing`, calls engine.play/pause
        - `onSpeedClick(engine, store)` — cycles speed, calls engine.setSpeed
        - `onScrub(value, engine, store)` — calls setPlaybackTime + engine.setTime
        - `onExit(engine, store)` — engine.stop, clearPlayback, setMode("live")
        - `onChipClick(layerKey, layersStore, groundState)` — flips correct boolean (with seismic going to `groundState`)
    - [ ] Tests instantiate fake `engine` (object with spy methods) and a real store; assert each handler's effect on store + spy calls.
    - [ ] PlaybackBar.tsx becomes a thin JSX wrapper over these handlers — no logic to test in the component itself.

- [ ] **5.6 End-to-end smoke (`scripts/verify-phase5.md`)**
    1. Start server + app
    2. Record 30s
    3. Stop. Click the row in the recordings list
    4. Bar appears at bottom; mode indicator shows PLAYBACK in cyan
    5. Drag scrubber → entities snap to that time
    6. Click 30× → entities advance fast
    7. Toggle PLANES chip → plane billboards hide, others remain
    8. Click ✕ → bar disappears, mode → NORMAL, live data resumes within 10s

### Verification

```bash
bun test
bun build src/index.html --outdir=dist > /dev/null && echo BUILD_OK
```

**Done when:** full `bun test` is green, build succeeds, manual phase-5 smoke procedure passes without console errors.

---

## Cross-phase verification matrix

| Phase | Unit tests | Build | Server script | Manual probe |
|---|---|---|---|---|
| 1 | recording-store, billboard-setvisible | ✓ | — | — |
| 2 | server-recordings | ✓ | verify-phase2.sh | — |
| 3 | snapshot, recorder | ✓ | verify-phase3.sh | record 30s, check disk |
| 4 | interpolate, playback-engine | ✓ | (re-run phase 2) | `window.__playback` console driver |
| 5 | playback-bar | ✓ | (re-run phase 2) | full UI smoke |

After each phase: `bun test` runs the cumulative suite — regressions in earlier phases surface immediately.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `bun:test` lacks built-in fake timers | Inject `Clock` interface into `Recorder` and `PlaybackEngine` constructors; default to real, swap to fake in tests |
| `bun:test` lacks built-in DOM/Solid component renderer | Extract logic from JSX into pure handler modules (`src/ui/playbackBarHandlers.ts`); test handlers, not components. Phase 5 §5.5 codifies this. |
| Hide-not-unmount changes break live-mode behavior | Tests in Phase 4 must re-run all live-mode store tests; manual smoke after each layer touch |
| 6h watchdog in long-lived dev server | `setTimeout` lives in module scope — server restart drops it; that's acceptable per spec ("incomplete" label exists for this) |
| `Bun.file().writer({append:true})` is unreliable across Bun versions | Decision committed: use `node:fs/promises` `appendFile()` for `frames.ndjson`. Documented in Task 2.1. |
| `viewer.camera.computeViewRectangle()` can return `undefined` at oblique angles | Phase 3: if undefined, fall back to a conservative bbox around camera target (`positionCartographic` ±5°) — log a warning |
