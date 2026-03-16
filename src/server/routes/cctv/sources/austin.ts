/**
 * Austin Camera Source
 * Fetches from Austin Open Data API (data.austintexas.gov)
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface AustinCameraData {
  camera_id: string;
  location_name: string;
  camera_status: string;
  screenshot_address: string;
  location?: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
  };
}

const AUSTIN_CAMERA_API = "https://data.austintexas.gov/resource/b4k4-adkb.json";
const AUSTIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class AustinSource implements CameraSource {
  readonly name = "austin";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < AUSTIN_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const response = await fetch(
        `${AUSTIN_CAMERA_API}?$where=camera_status='TURNED_ON'&$limit=500`
      );

      if (!response.ok) {
        console.error(`[CCTV] Austin API error: ${response.status}`);
        return this.cameras;
      }

      const data: AustinCameraData[] = await response.json();

      this.cameras = data
        .filter((cam) => cam.location && cam.screenshot_address)
        .map((cam) => ({
          id: `austin-${cam.camera_id}`,
          name: cam.location_name.trim(),
          latitude: cam.location!.coordinates[1],
          longitude: cam.location!.coordinates[0],
          source: "austin",
          status: "live" as const,
          media: [
            { type: "image" as const, url: `https://cctv.austinmobility.io/image/${cam.camera_id}.jpg` },
          ],
        }));

      this.cacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Austin API`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Austin cameras:", error);
      return this.cameras;
    }
  }
}
