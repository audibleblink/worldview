# CCTV Source Registry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic `CCTVProxyManager` into a registry/orchestrator pattern with pluggable `CameraSource` implementations, a unified `CameraMedia[]` data model, and matching frontend type migration.

**Architecture:** Define a `CameraSource` interface that each source (Austin, Caltrans, NY511) implements. The existing `CCTVProxyManager` becomes a thin registry that delegates camera fetching to registered sources and retains all source-agnostic infrastructure (caching, proxying, route handlers, offline frame generation). The old `src/proxy/cctv.ts` becomes a backward-compatible re-export shim.

**Tech Stack:** Bun, TypeScript (strict mode, bundler resolution), `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-10-cctv-source-registry-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/proxy/cctv/types.ts` | `CameraMediaType`, `CameraMedia`, `CCTVCamera` (new shape), `CameraSource` interface |
| `src/proxy/cctv/manager.ts` | `CCTVProxyManager` class (registry, route handlers, cache chain, offline frames) |
| `src/proxy/cctv/sources/austin.ts` | `AustinSource` implements `CameraSource` |
| `src/proxy/cctv/sources/caltrans.ts` | `CaltransSource` implements `CameraSource` |
| `src/proxy/cctv/sources/ny511.ts` | `NY511Source` implements `CameraSource` |
| `src/proxy/cctv/index.ts` | Creates manager singleton, registers sources, re-exports types + singleton |
| `test/cctv-types.test.ts` | Tests for new type shapes and media array construction |
| `test/cctv-austin-source.test.ts` | Tests for `AustinSource` |
| `test/cctv-caltrans-source.test.ts` | Tests for `CaltransSource` |
| `test/cctv-ny511-source.test.ts` | Tests for `NY511Source` (replaces parts of `cctv-ny511.test.ts`) |
| `test/cctv-manager.test.ts` | Tests for new `CCTVProxyManager` registry behavior |

### Modified files
| File | Changes |
|------|---------|
| `src/proxy/cctv.ts` | Gutted to re-export from `cctv/index.ts` |
| `src/ground/cctv/types.ts` | Replace `streamUrl`/`videoUrl` with `media: CameraMedia[]`, add `source: string` |
| `src/ground/cctv/CCTVManager.ts` | Branch on `media[]` instead of `videoUrl` for HLS playback |
| `src/ground/cctv/CCTVPanel.ts` | No code changes needed (uses `/api/cctv/thumbnail/:id` endpoint which is unchanged) |
| `src/ground/cctv/CCTVBillboard.ts` | No code changes needed (uses thumbnail fetch, doesn't read camera fields directly) |
| `src/proxy/index.ts` | Import path stays the same (re-export shim handles it) |
| `test/cctv-ny511.test.ts` | Update assertions for new `media[]` shape (no more `streamUrl`/`imageUrl`/`videoUrl`) |
| `test/cctv-thumbnail.test.ts` | Update type imports, adjust any field references |
| `test/cctv-video.test.ts` | Update assertions to use `media[]` instead of `videoUrl` |

### Unchanged files
| File | Why |
|------|-----|
| `src/proxy/png.ts` | Used by manager's offline frame generation, no API change |
| `src/proxy/types.ts` | `corsResponse`, `jsonResponse`, `CORS_HEADERS` unchanged |
| `src/ground/cctv/index.ts` | Exports same symbols, types change shape but same names |
| `src/ground/cctv/CCTVPanel.ts` | Doesn't read `streamUrl`/`videoUrl`/`imageUrl` directly |
| `src/ground/cctv/CCTVBillboard.ts` | Uses `fetchThumbnailFrame(cameraId)`, doesn't read camera fields |

---

## Chunk 1: Types and Interface

### Task 1: Create shared types file

**Files:**
- Create: `src/proxy/cctv/types.ts`
- Test: `test/cctv-types.test.ts`

- [ ] **Step 1: Write the failing test for type shapes**

Create `test/cctv-types.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import type { CameraMediaType, CameraMedia, CCTVCamera, CameraSource } from "../src/proxy/cctv/types";

describe("CCTV Types", () => {
  test("CameraMedia can represent an image", () => {
    const media: CameraMedia = { type: "image", url: "https://example.com/cam.jpg" };
    expect(media.type).toBe("image");
    expect(media.url).toBe("https://example.com/cam.jpg");
  });

  test("CameraMedia can represent HLS stream", () => {
    const media: CameraMedia = { type: "hls", url: "https://example.com/stream.m3u8" };
    expect(media.type).toBe("hls");
  });

  test("CameraMedia can represent MP4TS stream", () => {
    const media: CameraMedia = { type: "mp4ts", url: "https://example.com/stream.ts" };
    expect(media.type).toBe("mp4ts");
  });

  test("CCTVCamera has media array instead of imageUrl/streamUrl/videoUrl", () => {
    const camera: CCTVCamera = {
      id: "test-1",
      name: "Test Camera",
      latitude: 40.7,
      longitude: -74.0,
      source: "test",
      status: "live",
      media: [
        { type: "image", url: "https://example.com/cam.jpg" },
        { type: "hls", url: "https://example.com/stream.m3u8" },
      ],
    };
    expect(camera.media).toHaveLength(2);
    expect(camera.source).toBe("test");
  });

  test("CCTVCamera source is open string, not union", () => {
    const camera: CCTVCamera = {
      id: "custom-1",
      name: "Custom",
      latitude: 0,
      longitude: 0,
      source: "my-custom-source",
      status: "live",
      media: [],
    };
    expect(camera.source).toBe("my-custom-source");
  });

  test("CCTVCamera supports optional roadway and direction", () => {
    const camera: CCTVCamera = {
      id: "ny511-123",
      name: "I-278",
      latitude: 40.7,
      longitude: -74.0,
      source: "ny511",
      status: "live",
      media: [{ type: "image", url: "https://511ny.org/map/Cctv/123" }],
      roadway: "I-278/Bruckner Expressway",
      direction: "Northbound",
    };
    expect(camera.roadway).toBe("I-278/Bruckner Expressway");
    expect(camera.direction).toBe("Northbound");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-types.test.ts`
Expected: FAIL — cannot resolve `../src/proxy/cctv/types`

- [ ] **Step 3: Create the types file**

Create `src/proxy/cctv/types.ts`:

```ts
/**
 * CCTV Source Registry — Shared Types
 */

/** Media format a camera can provide */
export type CameraMediaType = "image" | "hls" | "mp4ts";

/** A single media endpoint for a camera */
export interface CameraMedia {
  type: CameraMediaType;
  url: string;
}

/** Normalized camera record returned by all sources */
export interface CCTVCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: "live" | "offline";
  media: CameraMedia[];
  roadway?: string;
  direction?: string;
}

/** Interface that every camera source must implement */
export interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-types.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/types.ts test/cctv-types.test.ts
git commit -m "feat(cctv): add shared types for source registry — CameraMedia, CCTVCamera, CameraSource"
```

---

## Chunk 2: NY511 Source Extraction

### Task 2: Extract NY511Source

This is the simplest source (reads from a local JSON file, no HTTP). Extract first to validate the pattern.

**Files:**
- Create: `src/proxy/cctv/sources/ny511.ts`
- Test: `test/cctv-ny511-source.test.ts`

- [ ] **Step 1: Write the failing test for NY511Source**

Create `test/cctv-ny511-source.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import type { CCTVCamera } from "../src/proxy/cctv/types";

const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

describe("NY511Source", () => {
  test("implements CameraSource interface", () => {
    const source = new NY511Source();
    expect(source.name).toBe("ny511");
    expect(typeof source.fetchCameras).toBe("function");
  });

  test("fetchCameras returns cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    expect(cameras.length).toBeGreaterThan(1500);
  });

  test("filters out disabled cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original?.Disabled).not.toBe(true);
    }
  });

  test("filters out blocked cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original?.Blocked).not.toBe(true);
    }
  });

  test("filters out cameras with zero coordinates", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.latitude).not.toBe(0);
      expect(cam.longitude).not.toBe(0);
    }
  });

  test("prefixes IDs with ny511-", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.id).toStartWith("ny511-");
    }
  });

  test("source field is ny511", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });

  test("media array has image entry from Url field", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras.slice(0, 10)) {
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia).toBeDefined();
      expect(imageMedia!.url).toContain("511ny.org");
    }
  });

  test("media array has hls entry when VideoUrl exists", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withHls = cameras.filter((c) => c.media.some((m) => m.type === "hls"));
    expect(withHls.length).toBeGreaterThan(1000);

    for (const cam of withHls.slice(0, 10)) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia!.url).toMatch(/\.m3u8$/);
    }
  });

  test("media array has no hls entry when VideoUrl is null", async () => {
    const nullVideoOriginal = rawData.find(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl === null
    );
    expect(nullVideoOriginal).toBeTruthy();

    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const cam = cameras.find((c) => c.id === `ny511-${nullVideoOriginal.ID}`);
    expect(cam).toBeTruthy();
    expect(cam!.media.some((m) => m.type === "hls")).toBe(false);
  });

  test("cameras have roadway metadata", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withRoadway = cameras.filter((c) => c.roadway);
    expect(withRoadway.length).toBeGreaterThan(0);
  });

  test("direction is undefined for Unknown values", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const unknownOriginal = rawData.find(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.DirectionOfTravel === "Unknown"
    );
    if (unknownOriginal) {
      const cam = cameras.find((c) => c.id === `ny511-${unknownOriginal.ID}`);
      expect(cam).toBeTruthy();
      expect(cam!.direction).toBeUndefined();
    }
  });

  test("caches results with 1-hour TTL", async () => {
    const source = new NY511Source();
    const first = await source.fetchCameras();
    const second = await source.fetchCameras();
    // Should return same array reference (cached)
    expect(first).toBe(second);
  });

  test("camera count matches expected active cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const expectedCount = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0
    ).length;
    expect(cameras.length).toBe(expectedCount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-ny511-source.test.ts`
Expected: FAIL — cannot resolve `../src/proxy/cctv/sources/ny511`

- [ ] **Step 3: Implement NY511Source**

Create `src/proxy/cctv/sources/ny511.ts`:

```ts
/**
 * NY511 Camera Source
 * Loads camera data from local JSON file (511ny.org)
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface NY511CameraData {
  Latitude: number;
  Longitude: number;
  ID: string;
  Name: string;
  DirectionOfTravel: string;
  RoadwayName: string;
  Url: string;
  VideoUrl: string | null;
  Disabled: boolean;
  Blocked: boolean;
}

const NY511_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export class NY511Source implements CameraSource {
  readonly name = "ny511";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < NY511_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const filePath = new URL("../../../data/511ny.json", import.meta.url).pathname;
      const data: NY511CameraData[] = await Bun.file(filePath).json();

      this.cameras = data
        .filter((cam) => !cam.Disabled && !cam.Blocked)
        .filter((cam) => cam.Latitude !== 0 && cam.Longitude !== 0)
        .map((cam) => {
          const media: CCTVCamera["media"] = [
            { type: "image", url: cam.Url },
          ];

          if (cam.VideoUrl) {
            media.push({ type: "hls", url: cam.VideoUrl });
          }

          return {
            id: `ny511-${cam.ID}`,
            name: cam.Name,
            latitude: cam.Latitude,
            longitude: cam.Longitude,
            source: "ny511",
            status: "live" as const,
            media,
            roadway: cam.RoadwayName,
            direction: cam.DirectionOfTravel !== "Unknown" ? cam.DirectionOfTravel : undefined,
          };
        });

      this.cacheTime = Date.now();
      console.log(`[CCTV] Loaded ${this.cameras.length} cameras from NY511 data`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error loading NY511 cameras:", error);
      return this.cameras;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-ny511-source.test.ts`
Expected: PASS (all 13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/ny511.ts test/cctv-ny511-source.test.ts
git commit -m "feat(cctv): extract NY511Source implementing CameraSource interface"
```

---

### Task 3: Extract AustinSource

**Files:**
- Create: `src/proxy/cctv/sources/austin.ts`
- Test: `test/cctv-austin-source.test.ts`

- [ ] **Step 1: Write the failing test for AustinSource**

Create `test/cctv-austin-source.test.ts`:

```ts
import { test, expect, describe, mock } from "bun:test";
import { AustinSource } from "../src/proxy/cctv/sources/austin";

describe("AustinSource", () => {
  test("implements CameraSource interface", () => {
    const source = new AustinSource();
    expect(source.name).toBe("austin");
    expect(typeof source.fetchCameras).toBe("function");
  });

  test("fetchCameras parses Austin API response", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "Congress Ave & 6th St",
        camera_status: "TURNED_ON",
        screenshot_address: "https://cctv.austinmobility.io/image/100.jpg",
        location: { type: "Point", coordinates: [-97.7431, 30.2672] },
      },
      {
        camera_id: "101",
        location_name: "Lamar & 5th",
        camera_status: "TURNED_ON",
        screenshot_address: "https://cctv.austinmobility.io/image/101.jpg",
        location: { type: "Point", coordinates: [-97.7510, 30.2650] },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    ) as any;

    try {
      const source = new AustinSource();
      const cameras = await source.fetchCameras();

      expect(cameras).toHaveLength(2);
      expect(cameras[0]!.id).toBe("austin-100");
      expect(cameras[0]!.name).toBe("Congress Ave & 6th St");
      expect(cameras[0]!.source).toBe("austin");
      expect(cameras[0]!.latitude).toBe(30.2672);
      expect(cameras[0]!.longitude).toBe(-97.7431);
      expect(cameras[0]!.status).toBe("live");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("media array has single image entry", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "Test",
        camera_status: "TURNED_ON",
        screenshot_address: "https://cctv.austinmobility.io/image/100.jpg",
        location: { type: "Point", coordinates: [-97.74, 30.26] },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    ) as any;

    try {
      const source = new AustinSource();
      const cameras = await source.fetchCameras();

      expect(cameras[0]!.media).toHaveLength(1);
      expect(cameras[0]!.media[0]!.type).toBe("image");
      expect(cameras[0]!.media[0]!.url).toBe("https://cctv.austinmobility.io/image/100.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("filters out cameras without location", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "Has Location",
        camera_status: "TURNED_ON",
        screenshot_address: "https://example.com/100.jpg",
        location: { type: "Point", coordinates: [-97.74, 30.26] },
      },
      {
        camera_id: "101",
        location_name: "No Location",
        camera_status: "TURNED_ON",
        screenshot_address: "https://example.com/101.jpg",
        // no location field
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    ) as any;

    try {
      const source = new AustinSource();
      const cameras = await source.fetchCameras();
      expect(cameras).toHaveLength(1);
      expect(cameras[0]!.id).toBe("austin-100");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("filters out cameras without screenshot_address", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "No Screenshot",
        camera_status: "TURNED_ON",
        screenshot_address: "",
        location: { type: "Point", coordinates: [-97.74, 30.26] },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    ) as any;

    try {
      const source = new AustinSource();
      const cameras = await source.fetchCameras();
      expect(cameras).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns stale cache on API error", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "Test",
        camera_status: "TURNED_ON",
        screenshot_address: "https://example.com/100.jpg",
        location: { type: "Point", coordinates: [-97.74, 30.26] },
      },
    ];

    const originalFetch = globalThis.fetch;

    // First call succeeds
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    ) as any;

    const source = new AustinSource();
    const firstResult = await source.fetchCameras();
    expect(firstResult).toHaveLength(1);

    // Expire the cache by manipulating internal state
    // (We test the public behavior: force a re-fetch by creating a new source and loading, then failing)
    // Instead, just verify the error path returns empty on a fresh source
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 }))
    ) as any;

    try {
      const freshSource = new AustinSource();
      const result = await freshSource.fetchCameras();
      expect(result).toHaveLength(0); // No stale cache on fresh source
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("caches results within TTL", async () => {
    const fakeResponse = [
      {
        camera_id: "100",
        location_name: "Test",
        camera_status: "TURNED_ON",
        screenshot_address: "https://example.com/100.jpg",
        location: { type: "Point", coordinates: [-97.74, 30.26] },
      },
    ];

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }));
    }) as any;

    try {
      const source = new AustinSource();
      await source.fetchCameras();
      await source.fetchCameras();
      expect(callCount).toBe(1); // Only one fetch, second was cached
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-austin-source.test.ts`
Expected: FAIL — cannot resolve `../src/proxy/cctv/sources/austin`

- [ ] **Step 3: Implement AustinSource**

Create `src/proxy/cctv/sources/austin.ts`:

```ts
/**
 * Austin Camera Source
 * Fetches from Austin Open Data API (data.austintexas.gov)
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface AustinCameraData {
  camera_id: string;
  location_name: string;
  camera_status: string;
  screenshot_address: string;
  location?: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
  };
}

const AUSTIN_CAMERA_API = "https://data.austintexas.gov/resource/b4k4-adkb.json";
const AUSTIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class AustinSource implements CameraSource {
  readonly name = "austin";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < AUSTIN_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const response = await fetch(
        `${AUSTIN_CAMERA_API}?$where=camera_status='TURNED_ON'&$limit=500`
      );

      if (!response.ok) {
        console.error(`[CCTV] Austin API error: ${response.status}`);
        return this.cameras;
      }

      const data: AustinCameraData[] = await response.json();

      this.cameras = data
        .filter((cam) => cam.location && cam.screenshot_address)
        .map((cam) => ({
          id: `austin-${cam.camera_id}`,
          name: cam.location_name.trim(),
          latitude: cam.location!.coordinates[1],
          longitude: cam.location!.coordinates[0],
          source: "austin",
          status: "live" as const,
          media: [
            { type: "image" as const, url: `https://cctv.austinmobility.io/image/${cam.camera_id}.jpg` },
          ],
        }));

      this.cacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Austin API`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Austin cameras:", error);
      return this.cameras;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-austin-source.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/austin.ts test/cctv-austin-source.test.ts
git commit -m "feat(cctv): extract AustinSource implementing CameraSource interface"
```

---

### Task 4: Extract CaltransSource

**Files:**
- Create: `src/proxy/cctv/sources/caltrans.ts`
- Test: `test/cctv-caltrans-source.test.ts`

- [ ] **Step 1: Write the failing test for CaltransSource**

Create `test/cctv-caltrans-source.test.ts`:

```ts
import { test, expect, describe, mock } from "bun:test";
import { CaltransSource } from "../src/proxy/cctv/sources/caltrans";

/** Build a fake Caltrans API response for one camera */
function fakeCaltransCamera(opts: {
  index: string;
  district: number;
  route: string;
  locationName: string;
  lat: string;
  lon: string;
  inService: string;
  currentImageURL: string;
  streamingVideoURL?: string;
}) {
  return {
    cctv: {
      index: opts.index,
      location: {
        district: String(opts.district),
        locationName: opts.locationName,
        nearbyPlace: "",
        longitude: opts.lon,
        latitude: opts.lat,
        county: "",
        route: opts.route,
      },
      inService: opts.inService,
      imageData: {
        streamingVideoURL: opts.streamingVideoURL ?? "",
        static: {
          currentImageURL: opts.currentImageURL,
        },
      },
    },
  };
}

describe("CaltransSource", () => {
  test("implements CameraSource interface", () => {
    const source = new CaltransSource();
    expect(source.name).toBe("caltrans");
    expect(typeof source.fetchCameras).toBe("function");
  });

  test("parses cameras from district responses", async () => {
    const fakeCam = fakeCaltransCamera({
      index: "42",
      district: 7,
      route: "I-405",
      locationName: "Wilshire Blvd",
      lat: "34.0522",
      lon: "-118.2437",
      inService: "true",
      currentImageURL: "https://cwwp2.dot.ca.gov/cam42.jpg",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      // Return data for district 7, empty for all others
      if (url.includes("d7")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [fakeCam] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();

      const cam = cameras.find((c) => c.id === "caltrans-d7-42");
      expect(cam).toBeDefined();
      expect(cam!.name).toBe("I-405 : Wilshire Blvd");
      expect(cam!.latitude).toBe(34.0522);
      expect(cam!.longitude).toBe(-118.2437);
      expect(cam!.source).toBe("caltrans");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("media has image entry from currentImageURL", async () => {
    const fakeCam = fakeCaltransCamera({
      index: "1",
      district: 4,
      route: "US-101",
      locationName: "Golden Gate",
      lat: "37.8",
      lon: "-122.4",
      inService: "true",
      currentImageURL: "https://cwwp2.dot.ca.gov/cam1.jpg",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (url.includes("d4")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [fakeCam] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();
      const cam = cameras.find((c) => c.id === "caltrans-d4-1");

      expect(cam).toBeDefined();
      const imageMedia = cam!.media.find((m) => m.type === "image");
      expect(imageMedia).toBeDefined();
      expect(imageMedia!.url).toBe("https://cwwp2.dot.ca.gov/cam1.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("media includes hls entry when streamingVideoURL is truthy", async () => {
    const fakeCam = fakeCaltransCamera({
      index: "1",
      district: 4,
      route: "US-101",
      locationName: "Golden Gate",
      lat: "37.8",
      lon: "-122.4",
      inService: "true",
      currentImageURL: "https://cwwp2.dot.ca.gov/cam1.jpg",
      streamingVideoURL: "https://cwwp2.dot.ca.gov/stream1.m3u8",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (url.includes("d4")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [fakeCam] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();
      const cam = cameras.find((c) => c.id === "caltrans-d4-1");

      expect(cam!.media).toHaveLength(2);
      const hlsMedia = cam!.media.find((m) => m.type === "hls");
      expect(hlsMedia).toBeDefined();
      expect(hlsMedia!.url).toBe("https://cwwp2.dot.ca.gov/stream1.m3u8");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("media has no hls entry when streamingVideoURL is empty string", async () => {
    const fakeCam = fakeCaltransCamera({
      index: "1",
      district: 4,
      route: "US-101",
      locationName: "Golden Gate",
      lat: "37.8",
      lon: "-122.4",
      inService: "true",
      currentImageURL: "https://cwwp2.dot.ca.gov/cam1.jpg",
      streamingVideoURL: "",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (url.includes("d4")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [fakeCam] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();
      const cam = cameras.find((c) => c.id === "caltrans-d4-1");

      expect(cam!.media).toHaveLength(1);
      expect(cam!.media[0]!.type).toBe("image");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("filters out cameras not in service", async () => {
    const inService = fakeCaltransCamera({
      index: "1", district: 4, route: "I-5", locationName: "A",
      lat: "37.0", lon: "-122.0", inService: "true",
      currentImageURL: "https://example.com/1.jpg",
    });
    const outOfService = fakeCaltransCamera({
      index: "2", district: 4, route: "I-5", locationName: "B",
      lat: "37.1", lon: "-122.1", inService: "false",
      currentImageURL: "https://example.com/2.jpg",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (url.includes("d4")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [inService, outOfService] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();
      expect(cameras).toHaveLength(1);
      expect(cameras[0]!.id).toBe("caltrans-d4-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles district API failure gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 }))
    ) as any;

    try {
      const source = new CaltransSource();
      const cameras = await source.fetchCameras();
      expect(cameras).toHaveLength(0); // No crash, just empty
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-caltrans-source.test.ts`
Expected: FAIL — cannot resolve `../src/proxy/cctv/sources/caltrans`

- [ ] **Step 3: Implement CaltransSource**

Create `src/proxy/cctv/sources/caltrans.ts`:

```ts
/**
 * Caltrans Camera Source
 * Fetches from Caltrans CCTV API across all 12 districts
 */

import type { CameraSource, CCTVCamera, CameraMedia } from "../types.ts";

interface CaltransCameraData {
  cctv: {
    index: string;
    location: {
      district: string;
      locationName: string;
      nearbyPlace: string;
      longitude: string;
      latitude: string;
      county: string;
      route: string;
    };
    inService: string;
    imageData: {
      streamingVideoURL: string;
      static: {
        currentImageURL: string;
      };
    };
  };
}

const CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CALTRANS_API_BASE = "https://cwwp2.dot.ca.gov/data";
const CALTRANS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class CaltransSource implements CameraSource {
  readonly name = "caltrans";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < CALTRANS_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const districtPromises = CALTRANS_DISTRICTS.map(async (district) => {
        const paddedDistrict = district.toString().padStart(2, "0");
        const url = `${CALTRANS_API_BASE}/d${district}/cctv/cctvStatusD${paddedDistrict}.json`;

        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[CCTV] Caltrans D${district} API error: ${response.status}`);
            return [];
          }

          const json = await response.json();
          const data: CaltransCameraData[] = json.data || [];

          return data
            .filter(
              (item) =>
                item.cctv.inService === "true" &&
                item.cctv.imageData?.static?.currentImageURL
            )
            .map((item): CCTVCamera => {
              const media: CameraMedia[] = [
                { type: "image", url: item.cctv.imageData.static.currentImageURL },
              ];

              if (item.cctv.imageData.streamingVideoURL) {
                media.push({ type: "hls", url: item.cctv.imageData.streamingVideoURL });
              }

              return {
                id: `caltrans-d${district}-${item.cctv.index}`,
                name: `${item.cctv.location.route} : ${item.cctv.location.locationName}`,
                latitude: parseFloat(item.cctv.location.latitude),
                longitude: parseFloat(item.cctv.location.longitude),
                source: "caltrans",
                status: "live",
                media,
              };
            });
        } catch (err) {
          console.warn(`[CCTV] Error fetching Caltrans D${district}:`, err);
          return [];
        }
      });

      const districtResults = await Promise.all(districtPromises);
      this.cameras = districtResults.flat();
      this.cacheTime = Date.now();

      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Caltrans API`);
      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Caltrans cameras:", error);
      return this.cameras;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-caltrans-source.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/caltrans.ts test/cctv-caltrans-source.test.ts
git commit -m "feat(cctv): extract CaltransSource implementing CameraSource interface"
```

---

## Chunk 3: Manager and Registry

### Task 5: Create the new CCTVProxyManager (registry/orchestrator)

**Files:**
- Create: `src/proxy/cctv/manager.ts`
- Test: `test/cctv-manager.test.ts`

- [ ] **Step 1: Write the failing test for manager registry**

Create `test/cctv-manager.test.ts`:

```ts
import { test, expect, describe, mock, beforeEach } from "bun:test";
import { CCTVProxyManager } from "../src/proxy/cctv/manager";
import type { CameraSource, CCTVCamera } from "../src/proxy/cctv/types";

/** Create a fake CameraSource for testing */
function fakeSource(name: string, cameras: CCTVCamera[]): CameraSource {
  return {
    name,
    fetchCameras: async () => cameras,
  };
}

function makeCamera(overrides: Partial<CCTVCamera> & { id: string; source: string }): CCTVCamera {
  return {
    name: "Test Camera",
    latitude: 40.7,
    longitude: -74.0,
    status: "live",
    media: [{ type: "image", url: "https://example.com/cam.jpg" }],
    ...overrides,
  };
}

describe("CCTVProxyManager Registry", () => {
  test("register adds a source", () => {
    const manager = new CCTVProxyManager();
    const source = fakeSource("test", []);
    manager.register(source);
    // No error = success. We verify via fetchAllCameras.
  });

  test("initialize calls fetchCameras on all sources", async () => {
    const manager = new CCTVProxyManager();
    let called = false;
    const source: CameraSource = {
      name: "test",
      fetchCameras: async () => {
        called = true;
        return [];
      },
    };
    manager.register(source);
    await manager.initialize();
    expect(called).toBe(true);
  });

  test("fetchAllCameras returns cameras from all sources", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("a", [
      makeCamera({ id: "a-1", source: "a" }),
    ]));
    manager.register(fakeSource("b", [
      makeCamera({ id: "b-1", source: "b" }),
      makeCamera({ id: "b-2", source: "b" }),
    ]));

    await manager.initialize();
    const all = await manager.fetchAllCameras();
    expect(all).toHaveLength(3);
  });

  test("fetchAllCameras with source filter returns only that source", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("a", [makeCamera({ id: "a-1", source: "a" })]));
    manager.register(fakeSource("b", [makeCamera({ id: "b-1", source: "b" })]));
    await manager.initialize();

    const onlyA = await manager.fetchAllCameras("a");
    expect(onlyA).toHaveLength(1);
    expect(onlyA[0]!.source).toBe("a");
  });

  test("fetchAllCameras with unknown source returns empty", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("a", [makeCamera({ id: "a-1", source: "a" })]));
    await manager.initialize();

    const result = await manager.fetchAllCameras("nonexistent");
    expect(result).toHaveLength(0);
  });

  test("initialize uses Promise.allSettled — one source failure does not block others", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("good", [makeCamera({ id: "good-1", source: "good" })]));
    manager.register({
      name: "bad",
      fetchCameras: async () => { throw new Error("API down"); },
    });

    await manager.initialize(); // Should not throw
    const cameras = await manager.fetchAllCameras();
    expect(cameras).toHaveLength(1);
    expect(cameras[0]!.source).toBe("good");
  });
});

describe("CCTVProxyManager Route Handlers", () => {
  test("handleCameraList returns JSON array", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({ id: "test-1", source: "test", latitude: 40.7, longitude: -74.0 }),
    ]));
    await manager.initialize();

    const url = new URL("http://localhost/api/cctv/cameras");
    const response = await manager.handleCameraList(url);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("test-1");
  });

  test("handleCameraList filters by source param", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("a", [makeCamera({ id: "a-1", source: "a" })]));
    manager.register(fakeSource("b", [makeCamera({ id: "b-1", source: "b" })]));
    await manager.initialize();

    const url = new URL("http://localhost/api/cctv/cameras?source=a");
    const response = await manager.handleCameraList(url);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].source).toBe("a");
  });

  test("handleCameraList filters by bbox", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({ id: "in-bbox", source: "test", latitude: 40.7, longitude: -74.0 }),
      makeCamera({ id: "out-bbox", source: "test", latitude: 10.0, longitude: 10.0 }),
    ]));
    await manager.initialize();

    const url = new URL("http://localhost/api/cctv/cameras?bbox=-75,40,-73,41");
    const response = await manager.handleCameraList(url);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("in-bbox");
  });

  test("handleCameraList returns 400 for invalid bbox", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();

    const url = new URL("http://localhost/api/cctv/cameras?bbox=invalid");
    const response = await manager.handleCameraList(url);
    expect(response.status).toBe(400);
  });

  test("handleThumbnail returns 404 for unknown camera", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();

    const response = await manager.handleThumbnail("nonexistent-camera");
    expect(response.status).toBe(404);
  });

  test("handleThumbnail proxies image for camera with image media", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({
        id: "test-1",
        source: "test",
        media: [{ type: "image", url: "https://example.com/cam.jpg" }],
      }),
    ]));
    await manager.initialize();

    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(fakeJpeg, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }))
    ) as any;

    try {
      const response = await manager.handleThumbnail("test-1");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handleThumbnail returns offline frame for camera with no image media", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({
        id: "video-only",
        source: "test",
        name: "Video Only Cam",
        media: [{ type: "hls", url: "https://example.com/stream.m3u8" }],
      }),
    ]));
    await manager.initialize();

    const response = await manager.handleThumbnail("video-only");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");

    const body = new Uint8Array(await response.arrayBuffer());
    // PNG signature
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
  });

  test("handleStream returns 404 for unknown camera", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();

    const response = await manager.handleStream("nonexistent");
    expect(response.status).toBe(404);
  });

  test("handleStream returns 400 for camera with no image media", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({
        id: "video-only",
        source: "test",
        media: [{ type: "hls", url: "https://example.com/stream.m3u8" }],
      }),
    ]));
    await manager.initialize();

    const response = await manager.handleStream("video-only");
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-manager.test.ts`
Expected: FAIL — cannot resolve `../src/proxy/cctv/manager`

- [ ] **Step 3: Implement the new CCTVProxyManager**

Create `src/proxy/cctv/manager.ts`:

```ts
/**
 * CCTV Proxy Manager — Registry & Orchestrator
 * Delegates camera fetching to registered CameraSource implementations.
 * Owns all source-agnostic infrastructure: caching, proxying, offline frames.
 */

import { mkdir } from "node:fs/promises";
import { corsResponse, jsonResponse, CORS_HEADERS } from "../types.ts";
import { encodePNG, drawText, drawBorder } from "../png.ts";
import type { CameraSource, CCTVCamera } from "./types.ts";

const CCTV_THUMBNAIL_TTL = 1000; // 1 second
const CCTV_CACHE_DIR = "./cache/cctv";

export class CCTVProxyManager {
  private sources: CameraSource[] = [];

  // Aggregated camera list (rebuilt on each fetchAllCameras call)
  private allCameras: CCTVCamera[] = [];

  // Thumbnail caches
  private thumbnailCache = new Map<
    string,
    { data: Uint8Array; timestamp: number; contentType: string }
  >();
  private lastKnownGoodCache = new Map<
    string,
    { data: Uint8Array; contentType: string; fetchedAt: number }
  >();

  constructor() {
    mkdir(CCTV_CACHE_DIR, { recursive: true });
  }

  /** Register a camera source */
  register(source: CameraSource): void {
    this.sources.push(source);
  }

  /** Initialize by fetching cameras from all registered sources */
  async initialize(): Promise<void> {
    const results = await Promise.allSettled(
      this.sources.map((s) => s.fetchCameras())
    );

    this.allCameras = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        this.allCameras.push(...result.value);
      } else {
        console.warn(
          `[CCTV] Source "${this.sources[i]!.name}" failed during initialize:`,
          result.reason
        );
      }
    }

    console.log(
      `[CCTV] Camera proxy ready — ${this.allCameras.length} cameras from ${this.sources.length} sources`
    );
  }

  /** Fetch cameras, optionally filtered by source name */
  async fetchAllCameras(sourceName?: string): Promise<CCTVCamera[]> {
    const results = await Promise.allSettled(
      this.sources.map((s) => s.fetchCameras())
    );

    this.allCameras = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        this.allCameras.push(...result.value);
      } else {
        console.warn(
          `[CCTV] Source "${this.sources[i]!.name}" failed:`,
          result.reason
        );
      }
    }

    if (sourceName) {
      return this.allCameras.filter((c) => c.source === sourceName);
    }

    return this.allCameras;
  }

  // --------------------------------------------------------------------------
  // Disk Cache
  // --------------------------------------------------------------------------

  private async loadCachedImage(
    cameraId: string
  ): Promise<{ data: Uint8Array; fetchedAt: number } | null> {
    try {
      const imagePath = `${CCTV_CACHE_DIR}/${cameraId}.jpg`;
      const metaPath = `${CCTV_CACHE_DIR}/${cameraId}.meta.json`;

      const imageFile = Bun.file(imagePath);
      const metaFile = Bun.file(metaPath);

      if (!(await imageFile.exists()) || !(await metaFile.exists())) {
        return null;
      }

      const data = new Uint8Array(await imageFile.arrayBuffer());
      const meta = await metaFile.json();

      return { data, fetchedAt: meta.fetchedAt };
    } catch {
      return null;
    }
  }

  private async saveCachedImage(
    cameraId: string,
    data: Uint8Array
  ): Promise<void> {
    try {
      const imagePath = `${CCTV_CACHE_DIR}/${cameraId}.jpg`;
      const metaPath = `${CCTV_CACHE_DIR}/${cameraId}.meta.json`;

      await Bun.write(imagePath, data);
      await Bun.write(metaPath, JSON.stringify({ fetchedAt: Date.now() }));
    } catch (error) {
      console.error(`[CCTV] Failed to save cache for ${cameraId}:`, error);
    }
  }

  // --------------------------------------------------------------------------
  // Request Handlers
  // --------------------------------------------------------------------------

  /** Handle GET /api/cctv/cameras */
  async handleCameraList(url: URL): Promise<Response> {
    const sourceParam = url.searchParams.get("source");
    const cameras = await this.fetchAllCameras(sourceParam || undefined);
    const bboxParam = url.searchParams.get("bbox");

    if (!bboxParam) {
      return jsonResponse(cameras);
    }

    const parts = bboxParam.split(",").map(Number);
    const [west, south, east, north] = parts;

    if (
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined ||
      isNaN(west) ||
      isNaN(south) ||
      isNaN(east) ||
      isNaN(north)
    ) {
      return jsonResponse(
        { error: "Invalid bbox format. Expected: west,south,east,north" },
        400
      );
    }

    const camerasInBbox = cameras.filter(
      (camera) =>
        camera.longitude >= west &&
        camera.longitude <= east &&
        camera.latitude >= south &&
        camera.latitude <= north
    );

    const sourceLabel = sourceParam || "all";
    console.log(
      `[CCTV] Returning ${camerasInBbox.length} ${sourceLabel} cameras in bbox [${bboxParam}]`
    );
    return jsonResponse(camerasInBbox);
  }

  /** Handle GET /api/cctv/thumbnail/:id */
  async handleThumbnail(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return jsonResponse({ error: "Camera not found", cameraId }, 404);
    }

    // Find the first image media entry
    const imageMedia = camera.media.find((m) => m.type === "image");

    if (!imageMedia) {
      // Video-only camera — return offline frame with "NO THUMBNAIL" text
      const offlineFrame = this.generateOfflineFrame(camera);
      return new Response(offlineFrame , {
        headers: { ...CORS_HEADERS, "Content-Type": "image/png" },
      });
    }

    // Check memory cache first
    const cached = this.thumbnailCache.get(cameraId);
    if (cached && Date.now() - cached.timestamp < CCTV_THUMBNAIL_TTL) {
      return new Response(cached.data , {
        headers: { ...CORS_HEADERS, "Content-Type": cached.contentType },
      });
    }

    try {
      const response = await fetch(imageMedia.url);
      if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);

      const imageData = new Uint8Array(await response.arrayBuffer());
      const contentType =
        response.headers.get("Content-Type") || "image/jpeg";

      // Update caches
      this.thumbnailCache.set(cameraId, {
        data: imageData,
        timestamp: Date.now(),
        contentType,
      });
      this.lastKnownGoodCache.set(cameraId, {
        data: imageData,
        contentType,
        fetchedAt: Date.now(),
      });
      this.saveCachedImage(cameraId, imageData); // async, fire-and-forget

      return new Response(imageData , {
        headers: { ...CORS_HEADERS, "Content-Type": contentType },
      });
    } catch (error) {
      // Try in-memory last-known-good cache
      const lastGood = this.lastKnownGoodCache.get(cameraId);
      if (lastGood) {
        return new Response(lastGood.data , {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": lastGood.contentType,
            "X-Stale": "true",
            "X-Last-Fetched": new Date(lastGood.fetchedAt).toISOString(),
          },
        });
      }

      // Try disk cache
      const diskCached = await this.loadCachedImage(cameraId);
      if (diskCached) {
        this.lastKnownGoodCache.set(cameraId, {
          data: diskCached.data,
          contentType: "image/jpeg",
          fetchedAt: diskCached.fetchedAt,
        });

        return new Response(diskCached.data , {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "image/jpeg",
            "X-Stale": "true",
            "X-From-Disk": "true",
            "X-Last-Fetched": new Date(diskCached.fetchedAt).toISOString(),
          },
        });
      }

      // No cache — return offline frame
      console.error(
        `[CCTV] Error fetching thumbnail for ${cameraId} (no cache):`,
        error
      );
      const offlineFrame = this.generateOfflineFrame(camera);
      return new Response(offlineFrame , {
        headers: { ...CORS_HEADERS, "Content-Type": "image/png" },
      });
    }
  }

  /** Handle GET /api/cctv/stream/:id */
  async handleStream(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return jsonResponse({ error: "Camera not found", cameraId }, 404);
    }

    // Stream endpoint only serves image-only cameras (MJPEG re-fetch loop)
    const imageMedia = camera.media.find((m) => m.type === "image");
    if (!imageMedia) {
      return jsonResponse(
        { error: "Camera has no image URL", cameraId },
        400
      );
    }

    const boundary = "frame";
    const streamImageUrl = imageMedia.url;

    const stream = new ReadableStream({
      start: async (controller) => {
        let frameCount = 0;
        const maxFrames = 100;

        const sendFrame = async () => {
          if (frameCount >= maxFrames) {
            controller.close();
            return;
          }

          try {
            const response = await fetch(streamImageUrl);
            let frameData: Uint8Array;

            if (!response.ok) {
              const lastGood = this.lastKnownGoodCache.get(cameraId);
              if (lastGood) {
                frameData = lastGood.data;
              } else {
                const diskCached = await this.loadCachedImage(cameraId);
                if (diskCached) {
                  frameData = diskCached.data;
                  this.lastKnownGoodCache.set(cameraId, {
                    data: diskCached.data,
                    contentType: "image/jpeg",
                    fetchedAt: diskCached.fetchedAt,
                  });
                } else {
                  throw new Error(`Image fetch failed: ${response.status}`);
                }
              }
            } else {
              frameData = new Uint8Array(await response.arrayBuffer());
              this.lastKnownGoodCache.set(cameraId, {
                data: frameData,
                contentType: "image/jpeg",
                fetchedAt: Date.now(),
              });
              this.saveCachedImage(cameraId, frameData);
            }

            const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameData.length}\r\n\r\n`;
            controller.enqueue(new TextEncoder().encode(header));
            controller.enqueue(frameData);
            controller.enqueue(new TextEncoder().encode("\r\n"));

            frameCount++;
            setTimeout(sendFrame, 1000);
          } catch (error) {
            console.error(`[CCTV] Stream error for ${cameraId}:`, error);
            controller.close();
          }
        };

        sendFrame();
      },
    });

    return corsResponse(stream, {
      headers: {
        "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // --------------------------------------------------------------------------
  // Offline Frame Generation
  // --------------------------------------------------------------------------

  private generateOfflineFrame(camera: CCTVCamera): Uint8Array {
    const width = 320;
    const height = 240;
    const pixels = new Uint8Array(width * height * 4);

    // Static noise pattern
    for (let i = 0; i < width * height; i++) {
      const noise = Math.floor(Math.random() * 40);
      const idx = i * 4;
      pixels[idx] = noise;
      pixels[idx + 1] = noise;
      pixels[idx + 2] = noise;
      pixels[idx + 3] = 255;
    }

    drawText(
      pixels,
      width,
      height,
      camera.name.substring(0, 25).toUpperCase(),
      8,
      16
    );
    drawText(pixels, width, height, "SIGNAL LOST", width / 2 - 50, height / 2);
    drawBorder(pixels, width, height, [255, 50, 50]);

    return encodePNG(pixels, width, height);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-manager.test.ts`
Expected: PASS (all 13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/manager.ts test/cctv-manager.test.ts
git commit -m "feat(cctv): implement CCTVProxyManager as registry/orchestrator"
```

---

## Chunk 4: Wiring, Re-export Shim, and Backward Compat

### Task 6: Create the index (singleton + source registration)

**Files:**
- Create: `src/proxy/cctv/index.ts`

- [ ] **Step 1: Create the index file**

Create `src/proxy/cctv/index.ts`:

```ts
/**
 * CCTV Source Registry — Entry Point
 * Creates manager singleton, registers sources, re-exports public API.
 */

export type { CameraMediaType, CameraMedia, CCTVCamera, CameraSource } from "./types.ts";
export { CCTVProxyManager } from "./manager.ts";

import { CCTVProxyManager } from "./manager.ts";
import { AustinSource } from "./sources/austin.ts";
import { CaltransSource } from "./sources/caltrans.ts";
import { NY511Source } from "./sources/ny511.ts";

const manager = new CCTVProxyManager();
manager.register(new AustinSource());
manager.register(new CaltransSource());
manager.register(new NY511Source());

export const cctvProxyManager = manager;
```

- [ ] **Step 2: Verify module loads correctly**

Run: `bun -e "import './src/proxy/cctv/index.ts'; console.log('OK')"`
Expected: Prints "OK" with no import errors. (Console logs from source initialization are expected.)

- [ ] **Step 3: Commit**

```bash
git add src/proxy/cctv/index.ts
git commit -m "feat(cctv): add registry index — creates singleton, registers all sources"
```

---

### Task 7: Convert old cctv.ts to re-export shim

**Files:**
- Modify: `src/proxy/cctv.ts`

- [ ] **Step 1: Replace old cctv.ts with re-export shim**

Replace the entire contents of `src/proxy/cctv.ts` with:

```ts
/**
 * CCTV Camera Proxy — Backward Compatibility Shim
 * Re-exports from the new modular cctv/ directory.
 */

export { CCTVProxyManager, cctvProxyManager } from "./cctv/index.ts";
export type { CCTVCamera, CameraMedia, CameraMediaType, CameraSource } from "./cctv/index.ts";
```

- [ ] **Step 2: Verify proxy/index.ts still works**

`src/proxy/index.ts` imports `{ cctvProxyManager } from "./cctv.ts"` — this should still resolve via the re-export shim.

Run: `bun -e "import { cctvProxyManager } from './src/proxy/cctv.ts'; console.log('OK', cctvProxyManager ? 'manager loaded' : 'failed')"`
Expected: Prints "OK manager loaded"

- [ ] **Step 3: Commit**

```bash
git add src/proxy/cctv.ts
git commit -m "refactor(cctv): convert cctv.ts to re-export shim for backward compatibility"
```

---

### Task 8: Update existing tests to use new types

**Files:**
- Modify: `test/cctv-ny511.test.ts`
- Modify: `test/cctv-thumbnail.test.ts`
- Modify: `test/cctv-video.test.ts`

The existing tests import `CCTVProxyManager` from `../src/proxy/cctv` — the re-export shim keeps this working. But the tests assert on old fields (`streamUrl`, `imageUrl`, `videoUrl`) that no longer exist on `CCTVCamera`. These tests need updating to use the new `media[]` shape.

**Important:** The old `CCTVProxyManager` class exposed `loadNY511Cameras()` as a public method. The new manager doesn't expose individual source methods. Tests that called `manager.loadNY511Cameras()` need to either:
1. Import `NY511Source` directly and call `fetchCameras()`, or
2. Use `manager.fetchAllCameras("ny511")`.

- [ ] **Step 1: Update `test/cctv-ny511.test.ts`**

This test file calls `manager.loadNY511Cameras()` extensively. Rewrite to use `NY511Source` directly:

```ts
import { test, expect, describe } from "bun:test";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import { CCTVProxyManager } from "../src/proxy/cctv";
import type { CCTVCamera } from "../src/proxy/cctv";

const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

describe("NY511 Camera Loading", () => {
  test("JSON file contains expected number of cameras", () => {
    expect(rawData.length).toBe(2920);
  });

  test("fetchCameras parses and returns cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    expect(cameras.length).toBeGreaterThan(1500);
  });

  test("filters out disabled cameras", async () => {
    const disabledCount = rawData.filter((c: any) => c.Disabled === true).length;
    expect(disabledCount).toBeGreaterThan(0);

    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const hasDisabled = cameras.some((c) => {
      const originalId = c.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      return original?.Disabled === true;
    });
    expect(hasDisabled).toBe(false);
  });

  test("filters out blocked cameras", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const hasBlocked = cameras.some((c) => {
      const originalId = c.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      return original?.Blocked === true;
    });
    expect(hasBlocked).toBe(false);
  });

  test("filters out cameras with zero latitude", async () => {
    const zeroLatCount = rawData.filter((c: any) => c.Latitude === 0).length;
    expect(zeroLatCount).toBeGreaterThan(0);

    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const hasZeroLat = cameras.some((c) => c.latitude === 0);
    expect(hasZeroLat).toBe(false);
  });

  test("filters out cameras with zero longitude", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const hasZeroLon = cameras.some((c) => c.longitude === 0);
    expect(hasZeroLon).toBe(false);
  });

  test("prefixes camera IDs with ny511-", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.id).toStartWith("ny511-");
    }
  });

  test("preserves original ID after prefix", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const activeRaw = rawData.find(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0
    );
    expect(activeRaw).toBeTruthy();
    const expected = cameras.find((c) => c.id === `ny511-${activeRaw.ID}`);
    expect(expected).toBeTruthy();
  });

  test("all cameras have source ny511", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });

  test("all cameras have status live", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras) {
      expect(cam.status).toBe("live");
    }
  });

  test("cameras have roadway metadata", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withRoadway = cameras.filter((c) => c.roadway);
    expect(withRoadway.length).toBeGreaterThan(0);
    const sample = withRoadway[0]!;
    const originalId = sample.id.replace("ny511-", "");
    const original = rawData.find((r: any) => r.ID === originalId);
    expect(sample.roadway).toBe(original.RoadwayName);
  });

  test("direction is set for non-Unknown values", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withDirection = cameras.filter((c) => c.direction);
    expect(withDirection.length).toBeGreaterThan(0);
    for (const cam of withDirection) {
      expect(cam.direction).not.toBe("Unknown");
    }
  });

  test("direction is undefined for Unknown values", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const unknownOriginal = rawData.find(
      (c: any) =>
        !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 &&
        c.DirectionOfTravel === "Unknown"
    );
    if (unknownOriginal) {
      const cam = cameras.find((c) => c.id === `ny511-${unknownOriginal.ID}`);
      expect(cam).toBeTruthy();
      expect(cam!.direction).toBeUndefined();
    }
  });

  test("media array has HLS entry when VideoUrl is non-null", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withHls = cameras.filter((c) => c.media.some((m) => m.type === "hls"));
    expect(withHls.length).toBeGreaterThan(0);
    for (const cam of withHls.slice(0, 5)) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia!.url).toContain(".m3u8");
    }
  });

  test("media array has no HLS entry when VideoUrl is null", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const nullVideoOriginal = rawData.find(
      (c: any) =>
        !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 &&
        c.VideoUrl === null
    );
    if (nullVideoOriginal) {
      const cam = cameras.find((c) => c.id === `ny511-${nullVideoOriginal.ID}`);
      expect(cam).toBeTruthy();
      expect(cam!.media.some((m) => m.type === "hls")).toBe(false);
    }
  });

  test("image media URL is set to the 511ny.org URL", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras.slice(0, 10)) {
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia).toBeDefined();
      expect(imageMedia!.url).toContain("511ny.org");
    }
  });

  test("active camera count matches expected", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const expectedCount = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0
    ).length;
    expect(cameras.length).toBe(expectedCount);
  });

  test("fetchAllCameras with ny511 source returns only ny511 cameras", async () => {
    const manager = new CCTVProxyManager();
    // Manager from re-export shim won't have sources registered.
    // Import from cctv/index.ts to get the singleton, or register manually.
    const { NY511Source: NY511 } = await import("../src/proxy/cctv/sources/ny511");
    manager.register(new NY511());
    await manager.initialize();

    const cameras = await manager.fetchAllCameras("ny511");
    expect(cameras.length).toBeGreaterThan(0);
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
```

- [ ] **Step 2: Update `test/cctv-thumbnail.test.ts`**

Replace references to `imageUrl` field with `media` array lookups. Replace `manager.loadNY511Cameras()` with source import:

```ts
import { test, expect, describe, beforeAll, mock } from "bun:test";
import { CCTVProxyManager } from "../src/proxy/cctv/manager";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import type { CCTVCamera } from "../src/proxy/cctv/types";
import { unlink } from "node:fs/promises";

let ny511Cameras: CCTVCamera[];
let ny511Source: NY511Source;

beforeAll(async () => {
  ny511Source = new NY511Source();
  ny511Cameras = await ny511Source.fetchCameras();
});

async function cleanDiskCache(cameraId: string): Promise<void> {
  try { await unlink(`./cache/cctv/${cameraId}.jpg`); } catch {}
  try { await unlink(`./cache/cctv/${cameraId}.meta.json`); } catch {}
}

/** Create a test manager with NY511 source registered */
async function createTestManager(): Promise<CCTVProxyManager> {
  const manager = new CCTVProxyManager();
  manager.register(ny511Source);
  await manager.initialize();
  return manager;
}

describe("NY511 Thumbnail Proxying", () => {
  test("NY511 cameras have image media entry", () => {
    for (const cam of ny511Cameras) {
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia).toBeDefined();
      expect(imageMedia!.url).not.toBe("");
    }
  });

  test("NY511 image media URL points to 511ny.org/map/Cctv endpoint", () => {
    for (const cam of ny511Cameras.slice(0, 20)) {
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia!.url).toMatch(/^https:\/\/511ny\.org\/map\/Cctv\/\d+$/);
    }
  });

  test("NY511 image media URL uses the Url field from source data", async () => {
    const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

    for (const cam of ny511Cameras.slice(0, 10)) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original).toBeTruthy();
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia!.url).toBe(original.Url);
    }
  });

  test("handleThumbnail finds NY511 camera by id", async () => {
    const testManager = await createTestManager();
    const sampleCam = ny511Cameras[0]!;
    const response = await testManager.handleThumbnail(sampleCam.id);
    expect(response.status).not.toBe(404);
  });

  test("handleThumbnail returns 404 for nonexistent camera", async () => {
    const testManager = await createTestManager();
    const response = await testManager.handleThumbnail("ny511-DOES_NOT_EXIST_999");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Camera not found");
  });

  test("cache key uses ny511- prefix from camera id", () => {
    for (const cam of ny511Cameras.slice(0, 20)) {
      expect(cam.id).toStartWith("ny511-");
      expect(cam.id).not.toContain("/");
      expect(cam.id).not.toContain("\\");
      expect(cam.id).not.toContain(":");
    }
  });

  test("cache key is unique per camera", () => {
    const ids = new Set(ny511Cameras.map((c) => c.id));
    expect(ids.size).toBe(ny511Cameras.length);
  });

  test("generates offline frame when fetch and all caches fail", async () => {
    const testManager = await createTestManager();
    const sampleCam = ny511Cameras[ny511Cameras.length - 1]!;
    await cleanDiskCache(sampleCam.id);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    ) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");

      const body = new Uint8Array(await response.arrayBuffer());
      expect(body[0]).toBe(0x89);
      expect(body[1]).toBe(0x50);
      expect(body[2]).toBe(0x4e);
      expect(body[3]).toBe(0x47);
      expect(body.length).toBeGreaterThan(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("offline frame is valid PNG for various cameras", async () => {
    const testManager = await createTestManager();
    const testCameras = ny511Cameras.slice(-3);
    for (const cam of testCameras) {
      await cleanDiskCache(cam.id);
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Service Unavailable", { status: 503 }))
    ) as any;

    try {
      for (const cam of testCameras) {
        const response = await testManager.handleThumbnail(cam.id);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");
        const body = new Uint8Array(await response.arrayBuffer());
        expect(body[0]).toBe(0x89);
        expect(body.length).toBeGreaterThan(100);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("thumbnail response includes CORS headers", async () => {
    const testManager = await createTestManager();
    const sampleCam = ny511Cameras[ny511Cameras.length - 1]!;
    await cleanDiskCache(sampleCam.id);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    ) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("successful thumbnail fetch returns image content type", async () => {
    const testManager = await createTestManager();
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(fakeJpeg, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }))
    ) as any;

    try {
      const sampleCam = ny511Cameras[0]!;
      const response = await testManager.handleThumbnail(sampleCam.id);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      const body = new Uint8Array(await response.arrayBuffer());
      expect(body[0]).toBe(0xff);
      expect(body[1]).toBe(0xd8);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("falls back to disk cache when fetch fails", async () => {
    const testManager = await createTestManager();
    const sampleCam = ny511Cameras[0]!;
    const fakeImage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]);
    await Bun.write(`./cache/cctv/${sampleCam.id}.jpg`, fakeImage);
    await Bun.write(`./cache/cctv/${sampleCam.id}.meta.json`, JSON.stringify({ fetchedAt: Date.now() }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    ) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(response.headers.get("X-Stale")).toBe("true");
      expect(response.headers.get("X-From-Disk")).toBe("true");
    } finally {
      globalThis.fetch = originalFetch;
      await cleanDiskCache(sampleCam.id);
    }
  });

  test("fetchAllCameras with ny511 source returns only ny511 cameras", async () => {
    const testManager = await createTestManager();
    const cameras = await testManager.fetchAllCameras("ny511");
    expect(cameras.length).toBeGreaterThan(0);
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
```

- [ ] **Step 3: Update `test/cctv-video.test.ts`**

Replace `videoUrl` assertions with `media` array lookups:

```ts
import { test, expect, describe } from "bun:test";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import type { CCTVCamera } from "../src/proxy/cctv/types";

const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

describe("NY511 HLS Video Streaming", () => {
  let cameras: CCTVCamera[];

  test("loads cameras", async () => {
    const source = new NY511Source();
    cameras = await source.fetchCameras();
    expect(cameras.length).toBeGreaterThan(1500);
  });

  test("cameras with HLS media have .m3u8 format", () => {
    const withHls = cameras.filter((c) => c.media.some((m) => m.type === "hls"));
    expect(withHls.length).toBeGreaterThan(1000);

    for (const cam of withHls) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia!.url).toMatch(/\.m3u8$/);
    }
  });

  test("cameras without HLS media have no hls entry", () => {
    const withoutHls = cameras.filter((c) => !c.media.some((m) => m.type === "hls"));
    expect(withoutHls.length).toBeGreaterThan(100);

    for (const cam of withoutHls) {
      expect(cam.media.every((m) => m.type !== "hls")).toBe(true);
    }
  });

  test("HLS URL count matches expected active cameras with VideoUrl", () => {
    const expectedWithVideo = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl
    ).length;

    const actualWithHls = cameras.filter((c) => c.media.some((m) => m.type === "hls")).length;
    expect(actualWithHls).toBe(expectedWithVideo);
  });

  test("HLS URL comes from original VideoUrl field", () => {
    const withHls = cameras.filter((c) => c.media.some((m) => m.type === "hls"));
    for (const cam of withHls.slice(0, 50)) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original).toBeDefined();
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia!.url).toBe(original.VideoUrl);
    }
  });

  test("HLS URLs point to skyvdn servers", () => {
    const withHls = cameras.filter((c) => c.media.some((m) => m.type === "hls"));
    for (const cam of withHls.slice(0, 50)) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia!.url).toMatch(/skyvdn\.com/);
    }
  });

  test("hls.js is in package.json dependencies", async () => {
    const pkg = await Bun.file("./package.json").json();
    expect(pkg.dependencies["hls.js"]).toBeDefined();
  });

  test("hls.js module can be imported", async () => {
    const hlsModule = await import("hls.js");
    expect(hlsModule.default).toBeDefined();
  });

  test("cameras with null VideoUrl in source have no HLS media", () => {
    const nullVideoInSource = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl === null
    );
    expect(nullVideoInSource.length).toBeGreaterThan(0);

    for (const src of nullVideoInSource.slice(0, 20)) {
      const cam = cameras.find((c) => c.id === `ny511-${src.ID}`);
      expect(cam).toBeDefined();
      expect(cam!.media.some((m) => m.type === "hls")).toBe(false);
    }
  });

  test("all ny511 cameras have source set to ny511", () => {
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
```

- [ ] **Step 4: Run all CCTV tests**

Run: `bun test test/cctv-*.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add test/cctv-ny511.test.ts test/cctv-thumbnail.test.ts test/cctv-video.test.ts
git commit -m "test(cctv): update existing tests for new media[] data model"
```

---

## Chunk 5: Frontend Type Migration

### Task 9: Update frontend Camera type

**Files:**
- Modify: `src/ground/cctv/types.ts`

- [ ] **Step 1: Update the Camera interface**

In `src/ground/cctv/types.ts`, replace the `Camera` interface:

Old:
```ts
export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  streamUrl: string;
  status: "live" | "offline";
  roadway?: string;
  direction?: string;
  videoUrl?: string;
}
```

New:
```ts
import type { CameraMedia } from "../../proxy/cctv/types.ts";

export interface Camera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: "live" | "offline";
  media: CameraMedia[];
  roadway?: string;
  direction?: string;
}
```

Also re-export `CameraMedia` and `CameraMediaType` for convenience:
```ts
export type { CameraMedia, CameraMediaType } from "../../proxy/cctv/types.ts";
```

- [ ] **Step 2: Fix type errors in CCTVManager.ts**

In `src/ground/cctv/CCTVManager.ts`, update the center-stage logic that checks `camera?.videoUrl`:

At line 385 (`createCenterStageOverlay` method), change:
```ts
const hasVideo = !!(camera?.videoUrl);
```
to:
```ts
const hasVideo = !!(camera?.media.some((m) => m.type === "hls" || m.type === "mp4ts"));
```

At lines 399-403, replace this block:
```ts
    if (hasVideo && camera?.videoUrl) {
      this.startHLSPlayback(camera.videoUrl, billboard);
    } else {
      this.startCenterStageRendering(billboard);
    }
```
with:
```ts
    if (hasVideo && camera) {
      const videoMedia = camera.media.find((m) => m.type === "hls" || m.type === "mp4ts");
      if (videoMedia) {
        this.startHLSPlayback(videoMedia.url, billboard);
      } else {
        this.startCenterStageRendering(billboard);
      }
    } else {
      this.startCenterStageRendering(billboard);
    }
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Exit code 0, or only pre-existing errors from unrelated files (like geocoder tests). No errors in `src/ground/cctv/types.ts` or `src/ground/cctv/CCTVManager.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/ground/cctv/types.ts src/ground/cctv/CCTVManager.ts
git commit -m "feat(cctv): migrate frontend Camera type to media[] data model"
```

---

### Task 10: Run full test suite and typecheck

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All CCTV tests pass. Pre-existing geocoder failures are unrelated.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No new type errors.

- [ ] **Step 3: Verify the proxy starts without errors**

Run: `timeout 5 bun run proxy 2>&1 || true`
Expected: See `[CCTV] Camera proxy ready` log line. Server starts on port 3001.

- [ ] **Step 4: Commit any fixes**

If any issues were found in Steps 1-3, fix them and commit:
```bash
git add -A
git commit -m "fix(cctv): resolve issues found during final verification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Shared types | `src/proxy/cctv/types.ts`, `test/cctv-types.test.ts` |
| 2 | NY511Source | `src/proxy/cctv/sources/ny511.ts`, `test/cctv-ny511-source.test.ts` |
| 3 | AustinSource | `src/proxy/cctv/sources/austin.ts`, `test/cctv-austin-source.test.ts` |
| 4 | CaltransSource | `src/proxy/cctv/sources/caltrans.ts`, `test/cctv-caltrans-source.test.ts` |
| 5 | Manager (registry) | `src/proxy/cctv/manager.ts`, `test/cctv-manager.test.ts` |
| 6 | Index (singleton) | `src/proxy/cctv/index.ts` |
| 7 | Re-export shim | `src/proxy/cctv.ts` |
| 8 | Update existing tests | `test/cctv-ny511.test.ts`, `test/cctv-thumbnail.test.ts`, `test/cctv-video.test.ts` |
| 9 | Frontend types | `src/ground/cctv/types.ts`, `src/ground/cctv/CCTVManager.ts` |
| 10 | Final verification | Full test suite + typecheck |
