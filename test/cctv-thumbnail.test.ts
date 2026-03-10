import { test, expect, describe, beforeAll, mock } from "bun:test";
import { CCTVProxyManager, type CCTVCamera } from "../src/server/routes/cctv";
import { unlink } from "node:fs/promises";

// Shared manager instance for tests that just read camera data
let ny511Cameras: CCTVCamera[];

beforeAll(async () => {
  const manager = new CCTVProxyManager();
  ny511Cameras = await manager.loadNY511Cameras();
});

/** Remove any disk cache for a camera ID so we test the full fallback path */
async function cleanDiskCache(cameraId: string): Promise<void> {
  try { await unlink(`./cache/cctv/${cameraId}.jpg`); } catch {}
  try { await unlink(`./cache/cctv/${cameraId}.meta.json`); } catch {}
}

describe("NY511 Thumbnail Proxying", () => {
  // -----------------------------------------------------------------------
  // Task 2.3: imageUrl is stored correctly
  // -----------------------------------------------------------------------

  test("NY511 cameras have imageUrl set", () => {
    for (const cam of ny511Cameras) {
      expect(cam.imageUrl).toBeDefined();
      expect(cam.imageUrl).not.toBe("");
    }
  });

  test("NY511 imageUrl points to 511ny.org/map/Cctv endpoint", () => {
    for (const cam of ny511Cameras.slice(0, 20)) {
      expect(cam.imageUrl).toMatch(/^https:\/\/511ny\.org\/map\/Cctv\/\d+$/);
    }
  });

  test("NY511 imageUrl uses the Url field from source data", async () => {
    const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

    for (const cam of ny511Cameras.slice(0, 10)) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original).toBeTruthy();
      expect(cam.imageUrl).toBe(original.Url);
    }
  });

  // -----------------------------------------------------------------------
  // Thumbnail handler: camera lookup
  // -----------------------------------------------------------------------

  test("handleThumbnail finds NY511 camera by id", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    const sampleCam = ny511Cameras[0]!;
    const response = await testManager.handleThumbnail(sampleCam.id);

    // Should return 200 (live image or cached or offline frame), not 404
    expect(response.status).not.toBe(404);
  });

  test("handleThumbnail returns 404 for nonexistent camera", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    const response = await testManager.handleThumbnail("ny511-DOES_NOT_EXIST_999");
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("Camera not found");
  });

  // -----------------------------------------------------------------------
  // Cache key format with ny511- prefix
  // -----------------------------------------------------------------------

  test("cache key uses ny511- prefix from camera id", () => {
    for (const cam of ny511Cameras.slice(0, 20)) {
      expect(cam.id).toStartWith("ny511-");
      // Should not contain characters invalid in file paths
      expect(cam.id).not.toContain("/");
      expect(cam.id).not.toContain("\\");
      expect(cam.id).not.toContain(":");
    }
  });

  test("cache key is unique per camera", () => {
    const ids = new Set(ny511Cameras.map((c) => c.id));
    expect(ids.size).toBe(ny511Cameras.length);
  });

  // -----------------------------------------------------------------------
  // Offline frame generation
  // -----------------------------------------------------------------------

  test("generates offline frame for NY511 camera when fetch and all caches fail", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    // Use a camera unlikely to have disk cache and clean it to be sure
    const sampleCam = ny511Cameras[ny511Cameras.length - 1]!;
    await cleanDiskCache(sampleCam.id);

    // Mock global fetch to return 404 for image requests
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);

      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toBe("image/png");

      const body = new Uint8Array(await response.arrayBuffer());
      // PNG signature: 0x89 P N G
      expect(body[0]).toBe(0x89);
      expect(body[1]).toBe(0x50); // P
      expect(body[2]).toBe(0x4e); // N
      expect(body[3]).toBe(0x47); // G
      expect(body.length).toBeGreaterThan(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("offline frame is valid PNG for various cameras", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    // Use cameras from the end of the list (less likely to be cached)
    const testCameras = ny511Cameras.slice(-3);
    for (const cam of testCameras) {
      await cleanDiskCache(cam.id);
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      return Promise.resolve(new Response("Service Unavailable", { status: 503 }));
    }) as any;

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

  // -----------------------------------------------------------------------
  // Thumbnail response format
  // -----------------------------------------------------------------------

  test("thumbnail response includes CORS headers", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    const sampleCam = ny511Cameras[ny511Cameras.length - 1]!;
    await cleanDiskCache(sampleCam.id);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("successful thumbnail fetch returns image content type", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    // Mock fetch to return a fake JPEG
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(fakeJpeg, {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        })
      )
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

  // -----------------------------------------------------------------------
  // Fallback chain: fetch failure -> disk cache -> offline frame
  // -----------------------------------------------------------------------

  test("falls back to disk cache when fetch fails", async () => {
    const testManager = new CCTVProxyManager();
    await testManager.loadNY511Cameras();

    // Pick a camera, write a fake cached image to disk
    const sampleCam = ny511Cameras[0]!;
    const fakeImage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]); // fake JPEG header
    await Bun.write(`./cache/cctv/${sampleCam.id}.jpg`, fakeImage);
    await Bun.write(`./cache/cctv/${sampleCam.id}.meta.json`, JSON.stringify({ fetchedAt: Date.now() }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as any;

    try {
      const response = await testManager.handleThumbnail(sampleCam.id);

      expect(response.status).toBe(200);
      // Should return the disk-cached image
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(response.headers.get("X-Stale")).toBe("true");
      expect(response.headers.get("X-From-Disk")).toBe("true");
    } finally {
      globalThis.fetch = originalFetch;
      await cleanDiskCache(sampleCam.id);
    }
  });

  // -----------------------------------------------------------------------
  // Source filtering
  // -----------------------------------------------------------------------

  test("fetchAllCameras with ny511 source returns only ny511 cameras", async () => {
    const testManager = new CCTVProxyManager();
    const cameras = await testManager.fetchAllCameras("ny511");

    expect(cameras.length).toBeGreaterThan(0);
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
