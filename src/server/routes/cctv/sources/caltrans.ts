/**
 * Caltrans Camera Source
 * Fetches from Caltrans CCTV API across all 12 districts
 */

import type { CameraSource, CCTVCamera, CameraMedia } from "../types.ts";

interface CaltransCameraData {
  cctv: {
    index: string;
    location: {
      district: string;
      locationName: string;
      nearbyPlace: string;
      longitude: string;
      latitude: string;
      county: string;
      route: string;
    };
    inService: string;
    imageData: {
      streamingVideoURL: string;
      static: {
        currentImageURL: string;
      };
    };
  };
}

const CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CALTRANS_API_BASE = "https://cwwp2.dot.ca.gov/data";
const CALTRANS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class CaltransSource implements CameraSource {
  readonly name = "caltrans";

  private cameras: CCTVCamera[] = [];
  private cacheTime = 0;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < CALTRANS_CACHE_TTL) {
      return this.cameras;
    }

    try {
      const districtPromises = CALTRANS_DISTRICTS.map(async (district) => {
        const paddedDistrict = district.toString().padStart(2, "0");
        const url = `${CALTRANS_API_BASE}/d${district}/cctv/cctvStatusD${paddedDistrict}.json`;

        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[CCTV] Caltrans D${district} API error: ${response.status}`);
            return [];
          }

          const json = await response.json();
          const data: CaltransCameraData[] = json.data || [];

          return data
            .filter(
              (item) =>
                item.cctv.inService === "true" &&
                item.cctv.imageData?.static?.currentImageURL
            )
            .map((item): CCTVCamera => {
              const media: CameraMedia[] = [
                { type: "image", url: item.cctv.imageData.static.currentImageURL },
              ];

              if (item.cctv.imageData.streamingVideoURL) {
                media.push({ type: "hls", url: item.cctv.imageData.streamingVideoURL });
              }

              return {
                id: `caltrans-d${district}-${item.cctv.index}`,
                name: `${item.cctv.location.route} : ${item.cctv.location.locationName}`,
                latitude: parseFloat(item.cctv.location.latitude),
                longitude: parseFloat(item.cctv.location.longitude),
                source: "caltrans",
                status: "live",
                media,
              };
            });
        } catch (err) {
          console.warn(`[CCTV] Error fetching Caltrans D${district}:`, err);
          return [];
        }
      });

      const districtResults = await Promise.all(districtPromises);
      this.cameras = districtResults.flat();
      this.cacheTime = Date.now();

      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from Caltrans API`);
      return this.cameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Caltrans cameras:", error);
      return this.cameras;
    }
  }
}
