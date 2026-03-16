/**
 * Arkansas IDrive Camera Source
 * Fetches from IDrive Arkansas GeoJSON API with token-gated HLS streams
 */

import type { CameraSource, CCTVCamera } from "../types.ts";

interface ArkansasGeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    id: number;
    name: string;
    status: string;
    hls_stream_protected: string;
    camera_type_name: string;
  };
}

interface ArkansasGeoJSON {
  type: "FeatureCollection";
  features: ArkansasGeoJSONFeature[];
}

const ARKANSAS_GEOJSON_URL = "https://layers.idrivearkansas.com/cameras.geojson";
const ARKANSAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class ArkansasSource implements CameraSource {
  readonly name = "arkansas";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < ARKANSAS_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const response = await fetch(ARKANSAS_GEOJSON_URL);

      if (!response.ok) {
        console.error(`[CCTV] Arkansas API error: ${response.status}`);
        return this.cameras;
      }

      const data: ArkansasGeoJSON = await response.json();

      this.cameras = data.features
        .filter((f) => f.properties.status === "online")
        .map((f) => ({
          id: `arkansas-${f.properties.id}`,
          name: f.properties.name,
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
          source: "arkansas" as const,
          status: "live" as const,
          media: [
            { type: "image" as const, url: `https://layers.idrivearkansas.com/cameras/${f.properties.id}.jpg` },
            { type: "hls" as const, url: f.properties.hls_stream_protected },
          ],
        }));

      this.cacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Arkansas GeoJSON`);

      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Arkansas cameras:", error);
      return this.cameras;
    }
  }

  async getSignedHlsUrl(cameraId: string): Promise<string> {
    // Extract numeric ID from "arkansas-{id}"
    const match = cameraId.match(/^arkansas-(\d+)$/);
    if (!match) {
      throw new Error(`Invalid Arkansas camera ID format: ${cameraId}`);
    }

    const numericId = match[1];
    const tokenGateUrl = `https://actis.idrivearkansas.com/index.php/api/cameras/feed/${numericId}.m3u8`;

    const response = await fetch(tokenGateUrl, {
      headers: {
        Referer: "https://www.idrivearkansas.com/",
        Origin: "https://www.idrivearkansas.com",
      },
      redirect: "manual", // Don't follow redirect, we want the Location header
    });

    if (response.status !== 302) {
      throw new Error(`Token gate returned ${response.status}, expected 302`);
    }

    const signedUrl = response.headers.get("Location");
    if (!signedUrl) {
      throw new Error("No Location header in redirect response");
    }

    return signedUrl;
  }
}
