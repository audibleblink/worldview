/**
 * CCTV Source Registry — Shared Types
 */

export type CameraMediaType = "image" | "hls" | "mp4ts";

export interface CameraMedia {
  type: CameraMediaType;
  url: string;
}

export interface CCTVCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  status: "live" | "offline";
  media: CameraMedia[];
  roadway?: string;
  direction?: string;
}

export interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
  getSignedHlsUrl?(cameraId: string): Promise<string>;
}

/**
 * Base class for camera sources with built-in TTL caching
 */
export abstract class CachedCameraSource implements CameraSource {
  abstract readonly name: string;
  protected cameras: CCTVCamera[] = [];
  protected cacheTime = 0;
  protected abstract cacheTtl: number;

  abstract fetchFromUpstream(): Promise<CCTVCamera[]>;

  async fetchCameras(): Promise<CCTVCamera[]> {
    if (this.cameras.length > 0 && Date.now() - this.cacheTime < this.cacheTtl) {
      return this.cameras;
    }
    try {
      this.cameras = await this.fetchFromUpstream();
      this.cacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.cameras.length} cameras from ${this.name}`);
    } catch (error) {
      console.error(`[CCTV] Error fetching ${this.name} cameras:`, error);
    }
    return this.cameras;
  }
}
