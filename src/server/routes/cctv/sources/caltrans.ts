/**
 * Caltrans Camera Source - All 12 California DOT districts
 */

import { CachedCameraSource, type CCTVCamera, type CameraMedia } from "../types.ts";

interface CaltransCameraData {
  cctv: {
    index: string;
    location: { locationName: string; longitude: string; latitude: string; route: string };
    inService: string;
    imageData: { streamingVideoURL: string; static: { currentImageURL: string } };
  };
}

const DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const API_BASE = "https://cwwp2.dot.ca.gov/data";

export class CaltransSource extends CachedCameraSource {
  readonly name = "caltrans";
  protected cacheTtl = 5 * 60 * 1000;

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const results = await Promise.all(DISTRICTS.map((d) => this.fetchDistrict(d)));
    return results.flat();
  }

  private async fetchDistrict(district: number): Promise<CCTVCamera[]> {
    const padded = district.toString().padStart(2, "0");
    try {
      const response = await fetch(`${API_BASE}/d${district}/cctv/cctvStatusD${padded}.json`);
      if (!response.ok) {
        console.warn(`[CCTV] Caltrans D${district} error: ${response.status}`);
        return [];
      }

      const json = await response.json();
      const data: CaltransCameraData[] = json.data || [];

      return data
        .filter((item) => item.cctv.inService === "true" && item.cctv.imageData?.static?.currentImageURL)
        .map((item): CCTVCamera => {
          const media: CameraMedia[] = [{ type: "image", url: item.cctv.imageData.static.currentImageURL }];
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
  }
}
