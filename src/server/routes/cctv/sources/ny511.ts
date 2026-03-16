/**
 * NY511 Camera Source
 * Loads camera data from local JSON file (511ny.org)
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface NY511CameraData {
  Latitude: number;
  Longitude: number;
  ID: string;
  Name: string;
  DirectionOfTravel: string;
  RoadwayName: string;
  Url: string;
  VideoUrl: string | null;
  Disabled: boolean;
  Blocked: boolean;
}

const NY511_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export class NY511Source implements CameraSource {
  readonly name = "ny511";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < NY511_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const filePath = new URL("../../../../data/511ny.json", import.meta.url).pathname;
      const data: NY511CameraData[] = await Bun.file(filePath).json();

      this.cameras = data
        .filter((cam) => !cam.Disabled && !cam.Blocked)
        .filter((cam) => cam.Latitude !== 0 && cam.Longitude !== 0)
        .map((cam) => {
          const media: CCTVCamera["media"] = [
            { type: "image", url: cam.Url },
          ];

          if (cam.VideoUrl) {
            media.push({ type: "hls", url: cam.VideoUrl });
          }

          return {
            id: `ny511-${cam.ID}`,
            name: cam.Name,
            latitude: cam.Latitude,
            longitude: cam.Longitude,
            source: "ny511",
            status: "live" as const,
            media,
            roadway: cam.RoadwayName,
            direction: cam.DirectionOfTravel !== "Unknown" ? cam.DirectionOfTravel : undefined,
          };
        });

      this.cacheTime = Date.now();
      console.log(`[CCTV] Loaded ${this.cameras.length} cameras from NY511 data`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error loading NY511 cameras:", error);
      return this.cameras;
    }
  }
}
