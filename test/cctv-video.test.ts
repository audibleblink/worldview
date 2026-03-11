import { test, expect, describe } from "bun:test";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import type { CCTVCamera } from "../src/proxy/cctv";

const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

describe("NY511 HLS Video Streaming", () => {
  let cameras: CCTVCamera[];

  // Load cameras once for all tests
  test("loads cameras", async () => {
    const source = new NY511Source();
    cameras = await source.fetchCameras();
    expect(cameras.length).toBeGreaterThan(1500);
  });

  test("cameras with HLS media have .m3u8 format", () => {
    const withVideo = cameras.filter((c) => c.media.find((m) => m.type === "hls"));
    expect(withVideo.length).toBeGreaterThan(1000);

    for (const cam of withVideo) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia?.url).toMatch(/\.m3u8$/);
    }
  });

  test("cameras without VideoUrl have no HLS media entry", () => {
    const withoutVideo = cameras.filter((c) => !c.media.find((m) => m.type === "hls"));
    expect(withoutVideo.length).toBeGreaterThan(100);

    for (const cam of withoutVideo) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia).toBeUndefined();
    }
  });

  test("HLS media count matches expected active cameras with VideoUrl", () => {
    const expectedWithVideo = rawData.filter(
      (c) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl
    ).length;

    const actualWithVideo = cameras.filter((c) => c.media.find((m) => m.type === "hls")).length;
    expect(actualWithVideo).toBe(expectedWithVideo);
  });

  test("HLS media URL comes from original VideoUrl field", () => {
    const withVideo = cameras.filter((c) => c.media.find((m) => m.type === "hls"));
    for (const cam of withVideo.slice(0, 50)) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original).toBeDefined();
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia?.url).toBe(original.VideoUrl);
    }
  });

  test("HLS media URLs point to nysdot HLS servers", () => {
    const withVideo = cameras.filter((c) => c.media.find((m) => m.type === "hls"));
    for (const cam of withVideo.slice(0, 50)) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia?.url).toMatch(/skyvdn\.com/);
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

  test("cameras with null VideoUrl in source have no HLS media entry", () => {
    const nullVideoInSource = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl === null
    );
    expect(nullVideoInSource.length).toBeGreaterThan(0);

    for (const src of nullVideoInSource.slice(0, 20)) {
      const cam = cameras.find((c) => c.id === `ny511-${src.ID}`);
      expect(cam).toBeDefined();
      const hlsMedia = cam!.media.find((m) => m.type === "hls");
      expect(hlsMedia).toBeUndefined();
    }
  });

  test("all ny511 cameras have source set to ny511", () => {
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
