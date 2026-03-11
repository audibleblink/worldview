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
