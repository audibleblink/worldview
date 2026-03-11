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
