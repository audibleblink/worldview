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
