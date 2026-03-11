# CCTV Source Registry Design

**Date:** 2026-03-10
**Status:** Approved

## Problem

`CCTVProxyManager` in `src/proxy/cctv.ts` (525 lines) has three camera sources hardcoded into one class — Austin, Caltrans, and NY511. Each has its own fetch method, cache variables, and TTL constants. More sources are coming with varying API shapes, auth requirements, and media types (JPEG stills, HLS streams, MPEG-TS). The monolith won't scale.

## Approach

**Interface + Registry (Option A).** Define a `CameraSource` interface. Each source is a class implementing that interface. `CCTVProxyManager` becomes a thin registry/orchestrator that delegates fetching to registered sources and owns all source-agnostic infrastructure (caching, proxying, bbox filtering, route handling).

## Data Model

```ts
type CameraMediaType = 'image' | 'hls' | 'mp4ts';

interface CameraMedia {
  type: CameraMediaType;
  url: string;
}

interface CCTVCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;        // open string, sources self-identify
  status: 'live' | 'offline';
  media: CameraMedia[];  // replaces imageUrl/videoUrl/streamUrl
  roadway?: string;
  direction?: string;
}
```

- `source` is an open `string`, not a union — no need to grow a union with every new source.
- `media` is an array: a camera can expose both a thumbnail image AND a live video stream.
- UI logic: first `image` entry = thumbnail tile; `hls`/`mp4ts` entry = video player in center-stage.

### Field Migration: Old → New

| Source | Old `streamUrl` | Old `imageUrl` | Old `videoUrl` | New `media` |
|--------|----------------|----------------|----------------|-------------|
| Austin | `screenshot_address` | `cctv.austinmobility.io/image/{id}.jpg` | — | `[{ type: 'image', url: imageUrl }]` |
| Caltrans | `streamingVideoURL` | `currentImageURL` | — | `[{ type: 'image', url: currentImageURL }]` (add HLS entry if `streamingVideoURL` present) |
| NY511 | `cam.Url` | `cam.Url` (same) | `cam.VideoUrl` | `[{ type: 'image', url: Url }, { type: 'hls', url: VideoUrl }]` (if VideoUrl exists) |

The old `streamUrl` field is dropped. Austin and Caltrans `streamUrl` values were used only for the MJPEG re-fetch loop, which operates on the `image` media entry now. NY511 `streamUrl` was identical to `imageUrl`.

For Caltrans, add an HLS media entry only if `streamingVideoURL` is truthy (non-empty string). The current code stores it as `""` when absent.

### Frontend Type Migration

The frontend has a separate `Camera` type in `src/ground/cctv/types.ts` with `streamUrl`, `videoUrl` fields. This type migrates to use `media: CameraMedia[]` and adds `source: string`.

Updated frontend `Camera` type:
```ts
interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: 'live' | 'offline';
  media: CameraMedia[];
  roadway?: string;
  direction?: string;
}
```

`CameraMedia` and `CameraMediaType` are defined once in `src/proxy/cctv/types.ts` and imported by the frontend types.

**Frontend behavior change:** The frontend reads `media` from the `/api/cctv/cameras` response and derives URLs client-side:
- Thumbnail: find first `media` entry with `type: 'image'`, fetch via `/api/cctv/thumbnail/:id` (proxy handles caching).
- Video: find first `media` entry with `type: 'hls'` or `type: 'mp4ts'`. If present, `CCTVManager` uses the URL directly for HLS.js playback (existing `startHLSPlayback` path). The `/api/cctv/stream/:id` endpoint is **not** used for HLS — the frontend plays HLS URLs directly.
- Image-only cameras: `/api/cctv/stream/:id` still serves the MJPEG re-fetch loop (existing behavior, including `maxFrames = 100` limit).

The consumers that change: `CCTVManager.ts` (branches on `media` array instead of `videoUrl`), `CCTVPanel.ts` (thumbnail URL derivation), `CCTVBillboard.ts` (image source).

ID uniqueness is each source's responsibility via its name prefix (e.g., `austin-`, `ny511-`).

The old `src/proxy/cctv.ts` re-exports everything from `cctv/index.ts` — including the `CCTVCamera` type and `cctvProxyManager` singleton — for backward compatibility with any existing imports.

## CameraSource Interface

```ts
interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
}
```

Each source owns its TTL, auth tokens, retry logic, and internal cache. No shared base class.

## Registry / Orchestrator

```ts
class CCTVProxyManager {
  private sources: CameraSource[] = [];

  register(source: CameraSource): void;
  async initialize(): Promise<void>;          // calls fetchCameras() on all sources
  async fetchAllCameras(sourceName?: string): Promise<CCTVCamera[]>;

  // Source-agnostic route handlers (unchanged API surface):
  async handleCameraList(url: URL): Promise<Response>;
  async handleThumbnail(cameraId: string): Promise<Response>;
  async handleStream(cameraId: string): Promise<Response>;
}
```

`initialize()` and `fetchAllCameras()` use `Promise.allSettled` — a single source failure returns partial results from the healthy sources, not a total failure. Failed sources log a warning and return their stale cache (if any) or an empty array.

Startup:
```ts
const manager = new CCTVProxyManager();
manager.register(new AustinSource());
manager.register(new CaltransSource());
manager.register(new NY511Source());
await manager.initialize();
```

The singleton is exported from `src/proxy/cctv/index.ts` as `cctvProxyManager` to maintain backward compatibility with `src/proxy/index.ts`.

## Thumbnail & Stream Proxy Behavior

- **Thumbnail:** Find first `media` entry with `type: 'image'`, proxy through existing cache chain (memory -> disk -> offline frame). If no `image` entry exists (video-only camera), return the offline frame with "NO THUMBNAIL" text.
- **Stream endpoint (`/api/cctv/stream/:id`):** Only used for image-only cameras. Serves the MJPEG re-fetch loop as today (including `maxFrames = 100` limit). HLS/MP4TS cameras are played directly by the frontend — they don't go through this endpoint.
- **Offline frame generation:** Stays on the manager — source-agnostic.
- **Cache chain:** Stays on the manager — memory, last-known-good, disk. Sources don't touch caching.

The source filter query param (`?source=austin`) continues to work — it does string matching against `camera.source`.

## File Layout

```
src/proxy/
  cctv/
    types.ts          — CCTVCamera, CameraMedia, CameraSource interface
    manager.ts        — CCTVProxyManager (registry, route handlers, cache)
    sources/
      austin.ts       — AustinSource implements CameraSource
      caltrans.ts     — CaltransSource implements CameraSource
      ny511.ts        — NY511Source implements CameraSource
    index.ts          — creates manager, registers sources, exports singleton
```

Existing `src/proxy/cctv.ts` becomes a re-export from `cctv/index.ts`.

## Adding a New Source

1. Create `src/proxy/cctv/sources/newsource.ts`
2. Implement `CameraSource` — fetch, parse, cache internally
3. Register in `src/proxy/cctv/index.ts`
4. No changes to manager, other sources, or route handlers

## Future Considerations

If auth or cache boilerplate repeats across 4+ sources, extract a `BaseCameraSource` abstract class at that point. Not now — YAGNI.
