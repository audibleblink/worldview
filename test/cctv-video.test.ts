import { test, expect, describe } from "bun:test";
import { CCTVProxyManager } from "../src/server/routes/cctv";

const rawData: any[] = await Bun.file("./src/data/511ny.json").json();

describe("NY511 HLS Video Streaming", () => {
  let cameras: Awaited<ReturnType<CCTVProxyManager["loadNY511Cameras"]>>;

  // Load cameras once for all tests
  test("loads cameras", async () => {
    const manager = new CCTVProxyManager();
    cameras = await manager.loadNY511Cameras();
    expect(cameras.length).toBeGreaterThan(1500);
  });

  test("cameras with videoUrl have .m3u8 format", () => {
    const withVideo = cameras.filter((c) => c.videoUrl);
    expect(withVideo.length).toBeGreaterThan(1000);

    for (const cam of withVideo) {
      expect(cam.videoUrl).toMatch(/\.m3u8$/);
    }
  });

  test("cameras without videoUrl have undefined videoUrl", () => {
    const withoutVideo = cameras.filter((c) => !c.videoUrl);
    expect(withoutVideo.length).toBeGreaterThan(100);

    for (const cam of withoutVideo) {
      expect(cam.videoUrl).toBeUndefined();
    }
  });

  test("video URL count matches expected active cameras with VideoUrl", () => {
    const expectedWithVideo = rawData.filter(
      (c) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl
    ).length;

    const actualWithVideo = cameras.filter((c) => c.videoUrl).length;
    expect(actualWithVideo).toBe(expectedWithVideo);
  });

  test("videoUrl comes from original VideoUrl field", () => {
    const withVideo = cameras.filter((c) => c.videoUrl);
    for (const cam of withVideo.slice(0, 50)) {
      const originalId = cam.id.replace("ny511-", "");
      const original = rawData.find((r: any) => r.ID === originalId);
      expect(original).toBeDefined();
      expect(cam.videoUrl).toBe(original.VideoUrl);
    }
  });

  test("video URLs point to nysdot HLS servers", () => {
    const withVideo = cameras.filter((c) => c.videoUrl);
    for (const cam of withVideo.slice(0, 50)) {
      expect(cam.videoUrl).toMatch(/skyvdn\.com/);
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

  test("cameras with null VideoUrl in source are excluded from videoUrl", () => {
    const nullVideoInSource = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0 && c.VideoUrl === null
    );
    expect(nullVideoInSource.length).toBeGreaterThan(0);

    for (const src of nullVideoInSource.slice(0, 20)) {
      const cam = cameras.find((c) => c.id === `ny511-${src.ID}`);
      expect(cam).toBeDefined();
      expect(cam!.videoUrl).toBeUndefined();
    }
  });

  test("all ny511 cameras have source set to ny511", () => {
    for (const cam of cameras) {
      expect(cam.source).toBe("ny511");
    }
  });
});
