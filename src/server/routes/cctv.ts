/**
 * CCTV Camera Route Handler
 *
 * Handles camera listings and thumbnail/stream proxying.
 * Uses imageResponse() helper - NO unsafe casts (Blocklist #11)
 */

import { mkdir } from "node:fs/promises";
import { TTLCache } from "../cache.ts";
import {
  jsonResponse,
  errorResponse,
  imageResponse,
  streamResponse,
  corsResponse,
  CORS_HEADERS,
} from "../types.ts";
import { encodePNG, drawText, drawBorder } from "../../proxy/png.ts";

// ============================================================================
// Types
// ============================================================================

export interface CCTVCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  streamUrl: string;
  status: "live" | "offline";
  source: "austin" | "caltrans" | "ny511";
  imageUrl?: string;
  roadway?: string;
  direction?: string;
  videoUrl?: string;
}

interface AustinCameraData {
  camera_id: string;
  location_name: string;
  camera_status: string;
  screenshot_address: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };
}

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

// ============================================================================
// Configuration
// ============================================================================

const AUSTIN_CAMERA_API = "https://data.austintexas.gov/resource/b4k4-adkb.json";
const CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CALTRANS_API_BASE = "https://cwwp2.dot.ca.gov/data";
const CAMERAS_CACHE_TTL = 5 * 60 * 1000;
const NY511_CACHE_TTL = 60 * 60 * 1000;
const CCTV_THUMBNAIL_TTL = 1000;
const CCTV_CACHE_DIR = "./cache/cctv";

// ============================================================================
// CCTV Manager Class
// ============================================================================

class CCTVManager {
  private austinCameras: CCTVCamera[] = [];
  private austinCacheTime = 0;
  private caltransCameras: CCTVCamera[] = [];
  private caltransCacheTime = 0;
  private ny511Cameras: CCTVCamera[] = [];
  private ny511CacheTime = 0;

  private thumbnailCache = new TTLCache<string, { data: Uint8Array; contentType: string }>({
    ttl: CCTV_THUMBNAIL_TTL,
  });

  private lastKnownGoodCache = new Map<string, { data: Uint8Array; contentType: string; fetchedAt: number }>();

  constructor() {
    mkdir(CCTV_CACHE_DIR, { recursive: true }).catch(() => {});
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.fetchAustinCameras(),
      this.fetchCaltransCameras(),
      this.loadNY511Cameras(),
    ]);
    console.log("[CCTV] Camera proxy ready - fetched Austin + Caltrans + NY511 cameras");
  }

  // --------------------------------------------------------------------------
  // Camera List Fetching
  // --------------------------------------------------------------------------

  private async fetchAustinCameras(): Promise<CCTVCamera[]> {
    if (this.austinCameras.length > 0 && Date.now() - this.austinCacheTime < CAMERAS_CACHE_TTL) {
      return this.austinCameras;
    }

    try {
      const response = await fetch(
        `${AUSTIN_CAMERA_API}?$where=camera_status='TURNED_ON'&$limit=500`
      );

      if (!response.ok) {
        console.error(`[CCTV] Austin API error: ${response.status}`);
        return this.austinCameras;
      }

      const data: AustinCameraData[] = await response.json();

      this.austinCameras = data
        .filter(cam => cam.location && cam.screenshot_address)
        .map(cam => ({
          id: `austin-${cam.camera_id}`,
          name: cam.location_name.trim(),
          latitude: cam.location!.coordinates[1],
          longitude: cam.location!.coordinates[0],
          streamUrl: cam.screenshot_address,
          status: "live" as const,
          source: "austin" as const,
          imageUrl: `https://cctv.austinmobility.io/image/${cam.camera_id}.jpg`,
        }));

      this.austinCacheTime = Date.now();
      console.log(`[CCTV] Fetched ${this.austinCameras.length} cameras from Austin API`);
      return this.austinCameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Austin cameras:", error);
      return this.austinCameras;
    }
  }

  private async fetchCaltransCameras(): Promise<CCTVCamera[]> {
    if (this.caltransCameras.length > 0 && Date.now() - this.caltransCacheTime < CAMERAS_CACHE_TTL) {
      return this.caltransCameras;
    }

    try {
      const districtPromises = CALTRANS_DISTRICTS.map(async (district) => {
        const paddedDistrict = district.toString().padStart(2, "0");
        const url = `${CALTRANS_API_BASE}/d${district}/cctv/cctvStatusD${paddedDistrict}.json`;

        try {
          const response = await fetch(url);
          if (!response.ok) return [];

          const json = await response.json();
          const data: CaltransCameraData[] = json.data || [];

          return data
            .filter(item => item.cctv.inService === "true" && item.cctv.imageData?.static?.currentImageURL)
            .map(item => ({
              id: `caltrans-d${district}-${item.cctv.index}`,
              name: `${item.cctv.location.route} : ${item.cctv.location.locationName}`,
              latitude: parseFloat(item.cctv.location.latitude),
              longitude: parseFloat(item.cctv.location.longitude),
              streamUrl: item.cctv.imageData.streamingVideoURL || "",
              status: "live" as const,
              source: "caltrans" as const,
              imageUrl: item.cctv.imageData.static.currentImageURL,
            }));
        } catch {
          return [];
        }
      });

      const districtResults = await Promise.all(districtPromises);
      this.caltransCameras = districtResults.flat();
      this.caltransCacheTime = Date.now();

      console.log(`[CCTV] Fetched ${this.caltransCameras.length} cameras from Caltrans API`);
      return this.caltransCameras;
    } catch (error) {
      console.error("[CCTV] Error fetching Caltrans cameras:", error);
      return this.caltransCameras;
    }
  }

  private async loadNY511Cameras(): Promise<CCTVCamera[]> {
    if (this.ny511Cameras.length > 0 && Date.now() - this.ny511CacheTime < NY511_CACHE_TTL) {
      return this.ny511Cameras;
    }

    try {
      const filePath = new URL("../../data/511ny.json", import.meta.url).pathname;
      const data: NY511CameraData[] = await Bun.file(filePath).json();

      this.ny511Cameras = data
        .filter(cam => !cam.Disabled && !cam.Blocked && cam.Latitude !== 0 && cam.Longitude !== 0)
        .map(cam => ({
          id: `ny511-${cam.ID}`,
          name: cam.Name,
          latitude: cam.Latitude,
          longitude: cam.Longitude,
          streamUrl: cam.Url,
          status: "live" as const,
          source: "ny511" as const,
          imageUrl: cam.Url,
          roadway: cam.RoadwayName,
          direction: cam.DirectionOfTravel !== "Unknown" ? cam.DirectionOfTravel : undefined,
          videoUrl: cam.VideoUrl || undefined,
        }));

      this.ny511CacheTime = Date.now();
      console.log(`[CCTV] Loaded ${this.ny511Cameras.length} cameras from NY511 data`);
      return this.ny511Cameras;
    } catch (error) {
      console.error("[CCTV] Error loading NY511 cameras:", error);
      return this.ny511Cameras;
    }
  }

  async fetchAllCameras(source?: "austin" | "caltrans" | "ny511"): Promise<CCTVCamera[]> {
    if (source === "austin") return this.fetchAustinCameras();
    if (source === "caltrans") return this.fetchCaltransCameras();
    if (source === "ny511") return this.loadNY511Cameras();

    const [austin, caltrans, ny511] = await Promise.all([
      this.fetchAustinCameras(),
      this.fetchCaltransCameras(),
      this.loadNY511Cameras(),
    ]);

    return [...austin, ...caltrans, ...ny511];
  }

  // --------------------------------------------------------------------------
  // Disk Cache
  // --------------------------------------------------------------------------

  private async loadCachedImage(cameraId: string): Promise<{ data: Uint8Array; fetchedAt: number } | null> {
    try {
      const imagePath = `${CCTV_CACHE_DIR}/${cameraId}.jpg`;
      const metaPath = `${CCTV_CACHE_DIR}/${cameraId}.meta.json`;

      const imageFile = Bun.file(imagePath);
      const metaFile = Bun.file(metaPath);

      if (!(await imageFile.exists()) || !(await metaFile.exists())) {
        return null;
      }

      const data = new Uint8Array(await imageFile.arrayBuffer());
      const meta = await metaFile.json();

      return { data, fetchedAt: meta.fetchedAt };
    } catch {
      return null;
    }
  }

  private async saveCachedImage(cameraId: string, data: Uint8Array): Promise<void> {
    try {
      const imagePath = `${CCTV_CACHE_DIR}/${cameraId}.jpg`;
      const metaPath = `${CCTV_CACHE_DIR}/${cameraId}.meta.json`;

      await Bun.write(imagePath, data);
      await Bun.write(metaPath, JSON.stringify({ fetchedAt: Date.now() }));
    } catch (error) {
      console.error(`[CCTV] Failed to save cache for ${cameraId}:`, error);
    }
  }

  // --------------------------------------------------------------------------
  // Request Handlers
  // --------------------------------------------------------------------------

  async handleCameraList(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sourceParam = url.searchParams.get("source") as "austin" | "caltrans" | "ny511" | null;
    const cameras = await this.fetchAllCameras(sourceParam || undefined);
    const bboxParam = url.searchParams.get("bbox");

    if (!bboxParam) {
      return jsonResponse(cameras);
    }

    const parts = bboxParam.split(",").map(Number);
    const [west, south, east, north] = parts;

    if (parts.some(isNaN) || parts.length !== 4) {
      return errorResponse("Invalid bbox format. Expected: west,south,east,north", 400);
    }

    const camerasInBbox = cameras.filter((camera) =>
      camera.longitude >= west! &&
      camera.longitude <= east! &&
      camera.latitude >= south! &&
      camera.latitude <= north!
    );

    console.log(`[CCTV] Returning ${camerasInBbox.length} cameras in bbox [${bboxParam}]`);
    return jsonResponse(camerasInBbox);
  }

  async handleThumbnail(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return errorResponse("Camera not found", 404);
    }

    // Check memory cache
    const cached = this.thumbnailCache.get(cameraId);
    if (cached) {
      return imageResponse(cached.data, cached.contentType);
    }

    try {
      const imageUrl = camera.imageUrl;
      if (!imageUrl) throw new Error("Camera has no image URL");

      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);

      const imageData = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("Content-Type") || "image/jpeg";

      // Update caches
      this.thumbnailCache.set(cameraId, { data: imageData, contentType });
      this.lastKnownGoodCache.set(cameraId, { data: imageData, contentType, fetchedAt: Date.now() });
      this.saveCachedImage(cameraId, imageData);

      return imageResponse(imageData, contentType);
    } catch (error) {
      // Try in-memory cache
      const lastGood = this.lastKnownGoodCache.get(cameraId);
      if (lastGood) {
        return imageResponse(lastGood.data, lastGood.contentType, {
          "X-Stale": "true",
          "X-Last-Fetched": new Date(lastGood.fetchedAt).toISOString(),
        });
      }

      // Try disk cache
      const diskCached = await this.loadCachedImage(cameraId);
      if (diskCached) {
        this.lastKnownGoodCache.set(cameraId, {
          data: diskCached.data,
          contentType: "image/jpeg",
          fetchedAt: diskCached.fetchedAt,
        });

        return imageResponse(diskCached.data, "image/jpeg", {
          "X-Stale": "true",
          "X-From-Disk": "true",
          "X-Last-Fetched": new Date(diskCached.fetchedAt).toISOString(),
        });
      }

      // Return offline frame
      console.error(`[CCTV] Error fetching thumbnail for ${cameraId}:`, error);
      const offlineFrame = this.generateOfflineFrame(camera);
      return imageResponse(offlineFrame, "image/png");
    }
  }

  async handleStream(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return errorResponse("Camera not found", 404);
    }

    if (!camera.imageUrl) {
      return errorResponse("Camera has no image URL", 400);
    }

    const boundary = "frame";
    const streamImageUrl = camera.imageUrl;

    const stream = new ReadableStream({
      start: async (controller) => {
        let frameCount = 0;
        const maxFrames = 100;

        const sendFrame = async () => {
          if (frameCount >= maxFrames) {
            controller.close();
            return;
          }

          try {
            const response = await fetch(streamImageUrl);
            let frameData: Uint8Array;

            if (!response.ok) {
              const lastGood = this.lastKnownGoodCache.get(cameraId);
              if (lastGood) {
                frameData = lastGood.data;
              } else {
                const diskCached = await this.loadCachedImage(cameraId);
                if (diskCached) {
                  frameData = diskCached.data;
                } else {
                  throw new Error(`Image fetch failed: ${response.status}`);
                }
              }
            } else {
              frameData = new Uint8Array(await response.arrayBuffer());
              this.lastKnownGoodCache.set(cameraId, {
                data: frameData,
                contentType: "image/jpeg",
                fetchedAt: Date.now(),
              });
              this.saveCachedImage(cameraId, frameData);
            }

            const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameData.length}\r\n\r\n`;
            controller.enqueue(new TextEncoder().encode(header));
            controller.enqueue(frameData);
            controller.enqueue(new TextEncoder().encode("\r\n"));

            frameCount++;
            setTimeout(sendFrame, 1000);
          } catch (error) {
            console.error(`[CCTV] Stream error for ${cameraId}:`, error);
            controller.close();
          }
        };

        sendFrame();
      },
    });

    return streamResponse(stream, `multipart/x-mixed-replace; boundary=${boundary}`);
  }

  private generateOfflineFrame(camera: CCTVCamera): Uint8Array {
    const width = 320;
    const height = 240;
    const pixels = new Uint8Array(width * height * 4);

    // Static noise pattern
    for (let i = 0; i < width * height; i++) {
      const noise = Math.floor(Math.random() * 40);
      const idx = i * 4;
      pixels[idx] = noise;
      pixels[idx + 1] = noise;
      pixels[idx + 2] = noise;
      pixels[idx + 3] = 255;
    }

    drawText(pixels, width, height, camera.name.substring(0, 25).toUpperCase(), 8, 16);
    drawText(pixels, width, height, "SIGNAL LOST", width / 2 - 50, height / 2);
    drawBorder(pixels, width, height, [255, 50, 50]);

    return encodePNG(pixels, width, height);
  }
}

// Singleton instance
const cctvManager = new CCTVManager();

// Export handlers
export async function initializeCCTV(): Promise<void> {
  return cctvManager.initialize();
}

export async function handleCameraList(req: Request): Promise<Response> {
  return cctvManager.handleCameraList(req);
}

export async function handleThumbnail(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/cctv\/thumbnail\/(.+)$/);
  if (!match?.[1]) {
    return errorResponse("Missing camera ID", 400);
  }
  return cctvManager.handleThumbnail(match[1]);
}

export async function handleStream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/cctv\/stream\/(.+)$/);
  if (!match?.[1]) {
    return errorResponse("Missing camera ID", 400);
  }
  return cctvManager.handleStream(match[1]);
}
