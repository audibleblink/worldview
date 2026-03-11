# Arkansas CCTV Source Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Arkansas IDrive traffic cameras (535 cameras) to the CCTV proxy system with token-gated HLS streaming support.

**Architecture:** New `ArkansasSource` class implementing `CameraSource` interface. Fetches camera metadata from GeoJSON endpoint, provides thumbnails via direct URL, and obtains signed HLS URLs on-demand via 302 redirect extraction. Manager gets new `handleHlsUrl()` route handler.

**Tech Stack:** Bun, TypeScript, fetch API, existing CCTV proxy patterns

**Spec:** `docs/superpowers/specs/2026-03-10-arkansas-cctv-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/proxy/cctv/sources/arkansas.ts` | ArkansasSource class — fetch cameras, get signed HLS URLs |
| Modify | `src/proxy/cctv/types.ts` | Add optional `getSignedHlsUrl` method to CameraSource interface |
| Modify | `src/proxy/cctv/manager.ts` | Add `handleHlsUrl()` route handler, add source lookup map |
| Modify | `src/proxy/cctv/index.ts` | Register ArkansasSource |
| Create | `test/cctv-arkansas-source.test.ts` | Unit tests for ArkansasSource |

---

## Chunk 1: Types and ArkansasSource

### Task 1: Extend CameraSource Interface

**Files:**
- Modify: `src/proxy/cctv/types.ts:27-31`

- [ ] **Step 1: Add optional getSignedHlsUrl method to interface**

```ts
/** Interface that every camera source must implement */
export interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
  /** Get a fresh signed HLS URL for token-gated streams (optional) */
  getSignedHlsUrl?(cameraId: string): Promise<string>;
}
```

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `bun test`
Expected: All existing tests pass (interface is backward compatible)

- [ ] **Step 3: Commit**

```bash
git add src/proxy/cctv/types.ts
git commit -m "feat(cctv): add optional getSignedHlsUrl to CameraSource interface"
```

---

### Task 2: Create ArkansasSource — Test Structure

**Files:**
- Create: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Create test file with interface test**

```ts
import { test, expect, describe, mock } from "bun:test";
import { ArkansasSource } from "../src/proxy/cctv/sources/arkansas";

describe("ArkansasSource", () => {
  test("implements CameraSource interface", () => {
    const source = new ArkansasSource();
    expect(source.name).toBe("arkansas");
    expect(typeof source.fetchCameras).toBe("function");
    expect(typeof source.getSignedHlsUrl).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create minimal ArkansasSource stub**

Create `src/proxy/cctv/sources/arkansas.ts`:

```ts
/**
 * Arkansas IDrive Camera Source
 * Fetches from IDrive Arkansas GeoJSON API with token-gated HLS streams
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

export class ArkansasSource implements CameraSource {
  readonly name = "arkansas";

  async fetchCameras(): Promise<CCTVCamera[]> {
    return [];
  }

  async getSignedHlsUrl(cameraId: string): Promise<string> {
    throw new Error("Not implemented");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/arkansas.ts test/cctv-arkansas-source.test.ts
git commit -m "feat(cctv): add ArkansasSource stub with interface test"
```

---

### Task 3: Implement fetchCameras — GeoJSON Parsing

**Files:**
- Modify: `src/proxy/cctv/sources/arkansas.ts`
- Modify: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Add test for GeoJSON parsing**

Add to test file:

```ts
describe("fetchCameras", () => {
  test("parses GeoJSON response correctly", async () => {
    const fakeGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-92.2896, 34.7465] },
          properties: {
            id: 750,
            name: "I-30 at Arkansas River Bridge",
            status: "online",
            hls_stream_protected: "https://actis.idrivearkansas.com/index.php/api/cameras/feed/750.m3u8",
            camera_type_name: "Traffic",
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-94.1574, 36.3729] },
          properties: {
            id: 100,
            name: "I-49 at US 71B",
            status: "online",
            hls_stream_protected: "https://actis.idrivearkansas.com/index.php/api/cameras/feed/100.m3u8",
            camera_type_name: "Traffic",
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeGeoJSON), { status: 200 }))
    ) as any;

    try {
      const source = new ArkansasSource();
      const cameras = await source.fetchCameras();

      expect(cameras).toHaveLength(2);
      expect(cameras[0]!.id).toBe("arkansas-750");
      expect(cameras[0]!.name).toBe("I-30 at Arkansas River Bridge");
      expect(cameras[0]!.source).toBe("arkansas");
      expect(cameras[0]!.latitude).toBe(34.7465);
      expect(cameras[0]!.longitude).toBe(-92.2896);
      expect(cameras[0]!.status).toBe("live");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: FAIL — cameras array is empty

- [ ] **Step 3: Implement fetchCameras**

Update `src/proxy/cctv/sources/arkansas.ts`:

```ts
/**
 * Arkansas IDrive Camera Source
 * Fetches from IDrive Arkansas GeoJSON API with token-gated HLS streams
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface ArkansasGeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    id: number;
    name: string;
    status: string;
    hls_stream_protected: string;
    camera_type_name: string;
  };
}

interface ArkansasGeoJSON {
  type: "FeatureCollection";
  features: ArkansasGeoJSONFeature[];
}

const ARKANSAS_GEOJSON_URL = "https://layers.idrivearkansas.com/cameras.geojson";
const ARKANSAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class ArkansasSource implements CameraSource {
  readonly name = "arkansas";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < ARKANSAS_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const response = await fetch(ARKANSAS_GEOJSON_URL);

      if (!response.ok) {
        console.error(`[CCTV] Arkansas API error: ${response.status}`);
        return this.cameras;
      }

      const data: ArkansasGeoJSON = await response.json();

      this.cameras = data.features
        .filter((f) => f.properties.status === "online")
        .map((f) => ({
          id: `arkansas-${f.properties.id}`,
          name: f.properties.name,
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
          source: "arkansas" as const,
          status: "live" as const,
          media: [
            { type: "image" as const, url: `https://layers.idrivearkansas.com/cameras/${f.properties.id}.jpg` },
            { type: "hls" as const, url: f.properties.hls_stream_protected },
          ],
        }));

      this.cacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Arkansas GeoJSON`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Arkansas cameras:", error);
      return this.cameras;
    }
  }

  async getSignedHlsUrl(cameraId: string): Promise<string> {
    throw new Error("Not implemented");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/arkansas.ts test/cctv-arkansas-source.test.ts
git commit -m "feat(cctv): implement ArkansasSource.fetchCameras with GeoJSON parsing"
```

---

### Task 4: Test Media Array

**Files:**
- Modify: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Add test for media array structure**

Add to `describe("fetchCameras")`:

```ts
  test("media array has image and hls entries", async () => {
    const fakeGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-92.28, 34.74] },
          properties: {
            id: 750,
            name: "Test Camera",
            status: "online",
            hls_stream_protected: "https://actis.idrivearkansas.com/index.php/api/cameras/feed/750.m3u8",
            camera_type_name: "Traffic",
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeGeoJSON), { status: 200 }))
    ) as any;

    try {
      const source = new ArkansasSource();
      const cameras = await source.fetchCameras();

      expect(cameras[0]!.media).toHaveLength(2);
      expect(cameras[0]!.media[0]!.type).toBe("image");
      expect(cameras[0]!.media[0]!.url).toBe("https://layers.idrivearkansas.com/cameras/750.jpg");
      expect(cameras[0]!.media[1]!.type).toBe("hls");
      expect(cameras[0]!.media[1]!.url).toBe("https://actis.idrivearkansas.com/index.php/api/cameras/feed/750.m3u8");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS (already implemented)

- [ ] **Step 3: Commit**

```bash
git add test/cctv-arkansas-source.test.ts
git commit -m "test(cctv): add media array structure test for Arkansas"
```

---

### Task 5: Test Offline Camera Filtering

**Files:**
- Modify: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Add test for filtering offline cameras**

Add to `describe("fetchCameras")`:

```ts
  test("filters out offline cameras", async () => {
    const fakeGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-92.28, 34.74] },
          properties: {
            id: 750,
            name: "Online Camera",
            status: "online",
            hls_stream_protected: "https://example.com/750.m3u8",
            camera_type_name: "Traffic",
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-94.15, 36.37] },
          properties: {
            id: 100,
            name: "Disabled Camera",
            status: "disabled",
            hls_stream_protected: "https://example.com/100.m3u8",
            camera_type_name: "Traffic",
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeGeoJSON), { status: 200 }))
    ) as any;

    try {
      const source = new ArkansasSource();
      const cameras = await source.fetchCameras();

      expect(cameras).toHaveLength(1);
      expect(cameras[0]!.id).toBe("arkansas-750");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/cctv-arkansas-source.test.ts
git commit -m "test(cctv): add offline camera filtering test for Arkansas"
```

---

### Task 6: Test Cache Behavior

**Files:**
- Modify: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Add cache test**

Add to `describe("fetchCameras")`:

```ts
  test("caches results within TTL", async () => {
    const fakeGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-92.28, 34.74] },
          properties: {
            id: 750,
            name: "Test",
            status: "online",
            hls_stream_protected: "https://example.com/750.m3u8",
            camera_type_name: "Traffic",
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify(fakeGeoJSON), { status: 200 }));
    }) as any;

    try {
      const source = new ArkansasSource();
      await source.fetchCameras();
      await source.fetchCameras();
      expect(callCount).toBe(1); // Only one fetch, second was cached
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/cctv-arkansas-source.test.ts
git commit -m "test(cctv): add cache TTL test for Arkansas"
```

---

## Chunk 2: Signed HLS URL and Manager Integration

### Task 7: Implement getSignedHlsUrl

**Files:**
- Modify: `src/proxy/cctv/sources/arkansas.ts`
- Modify: `test/cctv-arkansas-source.test.ts`

- [ ] **Step 1: Add test for getSignedHlsUrl**

Add new describe block:

```ts
describe("getSignedHlsUrl", () => {
  test("extracts signed URL from 302 redirect", async () => {
    const signedUrl = "https://7212406.r.worldssl.net/7212406/_definst_/idrive_750_base.stream/playlist.m3u8?token=abc123";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      if (url.includes("cameras/feed/750")) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: signedUrl },
          })
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as any;

    try {
      const source = new ArkansasSource();
      const result = await source.getSignedHlsUrl("arkansas-750");
      expect(result).toBe(signedUrl);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sends required Referer header", async () => {
    const signedUrl = "https://example.com/stream.m3u8?token=xyz";
    let capturedHeaders: HeadersInit | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      capturedHeaders = options?.headers;
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { Location: signedUrl },
        })
      );
    }) as any;

    try {
      const source = new ArkansasSource();
      await source.getSignedHlsUrl("arkansas-750");

      expect(capturedHeaders).toBeDefined();
      const headers = new Headers(capturedHeaders);
      expect(headers.get("Referer")).toBe("https://www.idrivearkansas.com/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on invalid camera ID format", async () => {
    const source = new ArkansasSource();
    await expect(source.getSignedHlsUrl("invalid-id")).rejects.toThrow();
  });

  test("throws when redirect fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Error", { status: 500 }))
    ) as any;

    try {
      const source = new ArkansasSource();
      await expect(source.getSignedHlsUrl("arkansas-750")).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: FAIL — "Not implemented" error

- [ ] **Step 3: Implement getSignedHlsUrl**

Update method in `src/proxy/cctv/sources/arkansas.ts`:

```ts
  async getSignedHlsUrl(cameraId: string): Promise<string> {
    // Extract numeric ID from "arkansas-{id}"
    const match = cameraId.match(/^arkansas-(\d+)$/);
    if (!match) {
      throw new Error(`Invalid Arkansas camera ID format: ${cameraId}`);
    }

    const numericId = match[1];
    const tokenGateUrl = `https://actis.idrivearkansas.com/index.php/api/cameras/feed/${numericId}.m3u8`;

    const response = await fetch(tokenGateUrl, {
      headers: {
        Referer: "https://www.idrivearkansas.com/",
        Origin: "https://www.idrivearkansas.com",
      },
      redirect: "manual", // Don't follow redirect, we want the Location header
    });

    if (response.status !== 302) {
      throw new Error(`Token gate returned ${response.status}, expected 302`);
    }

    const signedUrl = response.headers.get("Location");
    if (!signedUrl) {
      throw new Error("No Location header in redirect response");
    }

    return signedUrl;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cctv-arkansas-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cctv/sources/arkansas.ts test/cctv-arkansas-source.test.ts
git commit -m "feat(cctv): implement ArkansasSource.getSignedHlsUrl with 302 redirect extraction"
```

---

### Task 8: Add Source Lookup to Manager

**Files:**
- Modify: `src/proxy/cctv/manager.ts`

- [ ] **Step 1: Add source map for lookup**

Add after line 32 (after `private lastKnownGoodCache`):

```ts
  private sourceMap = new Map<string, CameraSource>();
```

- [ ] **Step 2: Update register method to populate map**

Update the `register` method:

```ts
  /** Register a camera source */
  register(source: CameraSource): void {
    this.sources.push(source);
    this.sourceMap.set(source.name, source);
  }
```

- [ ] **Step 3: Run existing tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/proxy/cctv/manager.ts
git commit -m "refactor(cctv): add source lookup map to manager"
```

---

### Task 9: Add handleHlsUrl Route Handler

**Files:**
- Modify: `src/proxy/cctv/manager.ts`

- [ ] **Step 1: Add handleHlsUrl method**

Add after `handleStream` method (around line 308):

```ts
  /** Handle GET /api/cctv/hls/:id - Get signed HLS URL */
  async handleHlsUrl(cameraId: string): Promise<Response> {
    const camera = this.getCameraById(cameraId);
    if (!camera) {
      return jsonResponse({ error: "Camera not found" }, 404);
    }

    // Find HLS media
    const hlsMedia = camera.media.find((m) => m.type === "hls");
    if (!hlsMedia) {
      return jsonResponse({ error: "Camera does not support HLS" }, 400);
    }

    // Get source
    const source = this.sourceMap.get(camera.source);
    if (!source || !source.getSignedHlsUrl) {
      return jsonResponse({ error: "Source does not support signed HLS URLs" }, 400);
    }

    try {
      const signedUrl = await source.getSignedHlsUrl(cameraId);
      return jsonResponse({ url: signedUrl });
    } catch (error) {
      console.error(`[CCTV] Error getting signed HLS URL for ${cameraId}:`, error);
      return jsonResponse({ error: "Failed to get stream URL" }, 502);
    }
  }
```

- [ ] **Step 2: Run existing tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/proxy/cctv/manager.ts
git commit -m "feat(cctv): add handleHlsUrl route handler to manager"
```

---

### Task 10: Register ArkansasSource

**Files:**
- Modify: `src/proxy/cctv/index.ts`

- [ ] **Step 1: Import and register ArkansasSource**

Update `src/proxy/cctv/index.ts`:

```ts
/**
 * CCTV Source Registry — Entry Point
 * Creates manager singleton, registers sources, re-exports public API.
 */

export type { CameraMediaType, CameraMedia, CCTVCamera, CameraSource } from "./types.ts";
export { CCTVProxyManager } from "./manager.ts";

import { CCTVProxyManager } from "./manager.ts";
import { ArkansasSource } from "./sources/arkansas.ts";
import { AustinSource } from "./sources/austin.ts";
import { CaltransSource } from "./sources/caltrans.ts";
import { NY511Source } from "./sources/ny511.ts";

const manager = new CCTVProxyManager();
manager.register(new ArkansasSource());
manager.register(new AustinSource());
manager.register(new CaltransSource());
manager.register(new NY511Source());

export const cctvProxyManager = manager;
```

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/proxy/cctv/index.ts
git commit -m "feat(cctv): register ArkansasSource in manager"
```

---

### Task 11: Integration Smoke Test

**Files:**
- Create: `scripts/arkansas-smoke.ts`

- [ ] **Step 1: Create smoke test script**

```ts
/**
 * Arkansas CCTV Smoke Test
 * Verifies end-to-end connectivity with live API
 */

import { ArkansasSource } from "../src/proxy/cctv/sources/arkansas";

async function main() {
  console.log("Testing Arkansas CCTV source...\n");

  const source = new ArkansasSource();

  // Test 1: Fetch cameras
  console.log("1. Fetching camera list...");
  const cameras = await source.fetchCameras();
  console.log(`   Found ${cameras.length} cameras`);

  if (cameras.length === 0) {
    console.error("   FAIL: No cameras returned");
    process.exit(1);
  }

  // Sample camera
  const camera = cameras[0]!;
  console.log(`\n2. Sample camera:`);
  console.log(`   ID: ${camera.id}`);
  console.log(`   Name: ${camera.name}`);
  console.log(`   Location: ${camera.latitude}, ${camera.longitude}`);
  console.log(`   Media types: ${camera.media.map((m) => m.type).join(", ")}`);

  // Test 2: Get signed HLS URL
  console.log(`\n3. Getting signed HLS URL for ${camera.id}...`);
  try {
    const signedUrl = await source.getSignedHlsUrl(camera.id);
    console.log(`   URL: ${signedUrl.substring(0, 80)}...`);
    console.log(`   Has token: ${signedUrl.includes("token=")}`);
  } catch (error) {
    console.error(`   FAIL: ${error}`);
    process.exit(1);
  }

  // Test 3: Verify thumbnail URL works
  const imageMedia = camera.media.find((m) => m.type === "image");
  if (imageMedia) {
    console.log(`\n4. Testing thumbnail URL...`);
    const response = await fetch(imageMedia.url, { method: "HEAD" });
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get("Content-Type")}`);
  }

  console.log("\nAll smoke tests passed!");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run smoke test**

Run: `bun scripts/arkansas-smoke.ts`
Expected: All tests pass with live API

- [ ] **Step 3: Commit**

```bash
git add scripts/arkansas-smoke.ts
git commit -m "test(cctv): add Arkansas smoke test script"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `bun run tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify camera count matches expectation**

Run: `bun scripts/arkansas-smoke.ts | head -5`
Expected: ~500+ cameras (spec says 535)

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Extend CameraSource interface | types.ts |
| 2 | Create ArkansasSource stub | arkansas.ts, test |
| 3 | Implement fetchCameras | arkansas.ts |
| 4-6 | Add media/filter/cache tests | test |
| 7 | Implement getSignedHlsUrl | arkansas.ts |
| 8-9 | Add manager HLS handler | manager.ts |
| 10 | Register source | index.ts |
| 11-12 | Integration verification | smoke test |
