/**
 * NY511 Camera Source - Local JSON file (511ny.org data)
 */

import { CachedCameraSource, type CCTVCamera } from "../types.ts";

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

export class NY511Source extends CachedCameraSource {
  readonly name = "ny511";
  protected cacheTtl = 60 * 60 * 1000; // 1 hour (static file)

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const filePath = new URL("../../../../data/511ny.json", import.meta.url).pathname;
    const data: NY511CameraData[] = await Bun.file(filePath).json();

    return data
      .filter((cam) => !cam.Disabled && !cam.Blocked && cam.Latitude !== 0 && cam.Longitude !== 0)
      .map((cam) => {
        const media: CCTVCamera["media"] = [{ type: "image", url: cam.Url }];
        if (cam.VideoUrl) media.push({ type: "hls", url: cam.VideoUrl });

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
  }
}
