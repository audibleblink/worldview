import { test, expect, describe } from "bun:test";
import { NY511Source } from "../src/proxy/cctv/sources/ny511";
import type { CCTVCamera } from "../src/proxy/cctv";

// Load raw JSON for comparison
const rawData = await Bun.file("./src/data/511ny.json").json();

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
    // Find a known camera from raw data that should pass filters
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
    // Verify a roadway value matches source data
    const sample = withRoadway[0];
    const originalId = sample.id.replace("ny511-", "");
    const original = rawData.find((r: any) => r.ID === originalId);
    expect(sample.roadway).toBe(original.RoadwayName);
  });

  test("direction is set for non-Unknown values", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withDirection = cameras.filter((c) => c.direction);
    expect(withDirection.length).toBeGreaterThan(0);
    // Verify none have "Unknown" as direction
    for (const cam of withDirection) {
      expect(cam.direction).not.toBe("Unknown");
    }
  });

  test("direction is undefined for Unknown values", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    // Find a camera whose original had DirectionOfTravel === "Unknown"
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

  test("media array contains HLS entry when VideoUrl is non-null", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    const withVideo = cameras.filter((c) => c.media.find((m) => m.type === "hls"));
    expect(withVideo.length).toBeGreaterThan(0);
    // Verify it's a valid HLS URL
    for (const cam of withVideo.slice(0, 5)) {
      const hlsMedia = cam.media.find((m) => m.type === "hls");
      expect(hlsMedia?.url).toContain(".m3u8");
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
      const hlsMedia = cam!.media.find((m) => m.type === "hls");
      expect(hlsMedia).toBeUndefined();
    }
  });

  test("media array contains image entry pointing to 511ny.org URL", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    for (const cam of cameras.slice(0, 10)) {
      const imageMedia = cam.media.find((m) => m.type === "image");
      expect(imageMedia).toBeDefined();
      expect(imageMedia?.url).toContain("511ny.org");
    }
  });

  test("active camera count matches expected ~1825", async () => {
    const source = new NY511Source();
    const cameras = await source.fetchCameras();
    // Should be exactly the count of non-disabled, non-blocked, non-zero-coord cameras
    const expectedCount = rawData.filter(
      (c: any) => !c.Disabled && !c.Blocked && c.Latitude !== 0 && c.Longitude !== 0
    ).length;
    expect(cameras.length).toBe(expectedCount);
  });
});
