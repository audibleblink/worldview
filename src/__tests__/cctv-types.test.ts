import { test, expect, describe } from "bun:test";
import type { CameraMediaType, CameraMedia, CCTVCamera, CameraSource } from "../server/routes/cctv/types";

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

  test("CCTVCamera has media array instead of flat imageUrl/streamUrl/videoUrl fields", () => {
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

  test("CCTVCamera source is an open string (not a closed union)", () => {
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
