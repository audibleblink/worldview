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
});
