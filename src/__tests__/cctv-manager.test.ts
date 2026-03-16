import { test, expect, describe, mock } from "bun:test";
import { CCTVProxyManager } from "../server/routes/cctv/manager";
import type { CameraSource, CCTVCamera } from "../server/routes/cctv/types";

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

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("CCTVProxyManager Registry", () => {
  test("register adds a source", () => {
    const manager = new CCTVProxyManager();
    const source = fakeSource("test", []);
    manager.register(source);
  });

  test("initialize calls fetchCameras on all sources", async () => {
    const manager = new CCTVProxyManager();
    let called = false;
    const source: CameraSource = {
      name: "test",
      fetchCameras: async () => { called = true; return []; },
    };
    manager.register(source);
    await manager.initialize();
    expect(called).toBe(true);
  });

  test("fetchAllCameras returns cameras from all sources", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("a", [makeCamera({ id: "a-1", source: "a" })]));
    manager.register(fakeSource("b", [makeCamera({ id: "b-1", source: "b" }), makeCamera({ id: "b-2", source: "b" })]));
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
    await manager.initialize();
    const cameras = await manager.fetchAllCameras();
    expect(cameras).toHaveLength(1);
    expect(cameras[0]!.source).toBe("good");
  });
});

describe("CCTVProxyManager Route Handlers", () => {
  test("handleCameraList returns JSON array", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [makeCamera({ id: "test-1", source: "test", latitude: 40.7, longitude: -74.0 })]));
    await manager.initialize();
    const response = await manager.handleCameraList(makeRequest("http://localhost/api/cctv/cameras"));
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
    const response = await manager.handleCameraList(makeRequest("http://localhost/api/cctv/cameras?source=a"));
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
    const response = await manager.handleCameraList(makeRequest("http://localhost/api/cctv/cameras?bbox=-75,40,-73,41"));
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("in-bbox");
  });

  test("handleCameraList returns 400 for invalid bbox", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();
    const response = await manager.handleCameraList(makeRequest("http://localhost/api/cctv/cameras?bbox=invalid"));
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
      makeCamera({ id: "test-1", source: "test", media: [{ type: "image", url: "https://example.com/cam.jpg" }] }),
    ]));
    await manager.initialize();
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.resolve(new Response(fakeJpeg, { status: 200, headers: { "Content-Type": "image/jpeg" } }))) as typeof fetch;
    try {
      const response = await manager.handleThumbnail("test-1");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handleThumbnail returns offline frame (PNG) for camera with no image media", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("test", [
      makeCamera({ id: "video-only", source: "test", name: "Video Only Cam", media: [{ type: "hls", url: "https://example.com/stream.m3u8" }] }),
    ]));
    await manager.initialize();
    const response = await manager.handleThumbnail("video-only");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    const body = new Uint8Array(await response.arrayBuffer());
    // PNG signature: 0x89 0x50 ('P')
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
      makeCamera({ id: "video-only", source: "test", media: [{ type: "hls", url: "https://example.com/stream.m3u8" }] }),
    ]));
    await manager.initialize();
    const response = await manager.handleStream("video-only");
    expect(response.status).toBe(400);
  });

  test("handleHlsUrl returns 400 for invalid camera ID format", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();
    const response = await manager.handleHlsUrl("nodash");
    expect(response.status).toBe(400);
  });

  test("handleHlsUrl returns 404 for unknown source", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();
    const response = await manager.handleHlsUrl("unknownsource-cam1");
    expect(response.status).toBe(404);
  });

  test("handleHlsUrl returns 400 for source without getSignedHlsUrl", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("mysource", []));
    await manager.initialize();
    const response = await manager.handleHlsUrl("mysource-cam1");
    expect(response.status).toBe(400);
  });
});
