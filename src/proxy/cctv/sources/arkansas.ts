/**
 * Arkansas IDrive Camera Source
 * Fetches from IDrive Arkansas GeoJSON API with token-gated HLS streams
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

export class ArkansasSource implements CameraSource {
  readonly name = "arkansas";

  async fetchCameras(): Promise<CCTVCamera[]> {
    return [];
  }

  async getSignedHlsUrl(cameraId: string): Promise<string> {
    throw new Error("Not implemented");
  }
}
