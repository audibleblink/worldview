/**
 * Austin Camera Source - Austin Open Data API
 */

import { CachedCameraSource, type CCTVCamera } from "../types.ts";

interface AustinCameraData {
  camera_id: string;
  location_name: string;
  camera_status: string;
  screenshot_address: string;
  location?: { coordinates: [number, number] };
}

const API_URL = "https://data.austintexas.gov/resource/b4k4-adkb.json?$where=camera_status='TURNED_ON'&$limit=500";

export class AustinSource extends CachedCameraSource {
  readonly name = "austin";
  protected cacheTtl = 5 * 60 * 1000;

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`Austin API error: ${response.status}`);

    const data: AustinCameraData[] = await response.json();

    return data
      .filter((cam) => cam.location && cam.screenshot_address)
      .map((cam) => ({
        id: `austin-${cam.camera_id}`,
        name: cam.location_name.trim(),
        latitude: cam.location!.coordinates[1],
        longitude: cam.location!.coordinates[0],
        source: "austin",
        status: "live" as const,
        media: [{ type: "image" as const, url: `https://cctv.austinmobility.io/image/${cam.camera_id}.jpg` }],
      }));
  }
}
