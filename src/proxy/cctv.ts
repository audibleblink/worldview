/**
 * CCTV Camera Proxy
 * Handles camera listings and thumbnail/stream proxying
 */

import { mkdir } from "node:fs/promises";
import { corsResponse, jsonResponse, CORS_HEADERS } from "./types.ts";
import { encodePNG, drawText, drawBorder } from "./png.ts";

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
    coordinates: [number, number]; // [longitude, latitude]
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
const CAMERAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const NY511_CACHE_TTL = 60 * 60 * 1000; // 1 hour (positions rarely change)
const CCTV_THUMBNAIL_TTL = 1000; // 1 second
const CCTV_CACHE_DIR = "./cache/cctv";

// ============================================================================
// CCTV Manager Class
// ============================================================================

export class CCTVProxyManager {
  // Camera list caches
  private austinCameras: CCTVCamera[] = [];
  private austinCacheTime = 0;
  private caltransCameras: CCTVCamera[] = [];
  private caltransCacheTime = 0;
  private ny511Cameras: CCTVCamera[] = [];
  private ny511CacheTime = 0;

  // Thumbnail caches
  private thumbnailCache = new Map<string, { data: Uint8Array; timestamp: number; contentType: string }>();
  private lastKnownGoodCache = new Map<string, { data: Uint8Array; contentType: string; fetchedAt: number }>();

  constructor() {
    // Ensure cache directory exists
    mkdir(CCTV_CACHE_DIR, { recursive: true });
  }

  /** Initialize by prefetching camera lists */
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
          if (!response.ok) {
            console.warn(`[CCTV] Caltrans D${district} API error: ${response.status}`);
            return [];
          }

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
        } catch (err) {
          console.warn(`[CCTV] Error fetching Caltrans D${district}:`, err);
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

  async loadNY511Cameras(): Promise<CCTVCamera[]> {
    if (this.ny511Cameras.length > 0 && Date.now() - this.ny511CacheTime < NY511_CACHE_TTL) {
      return this.ny511Cameras;
    }

    try {
      const filePath = new URL("../data/511ny.json", import.meta.url).pathname;
      const data: NY511CameraData[] = await Bun.file(filePath).json();

      this.ny511Cameras = data
        .filter(cam => !cam.Disabled && !cam.Blocked)
        .filter(cam => cam.Latitude !== 0 && cam.Longitude !== 0)
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

  /** Handle GET /api/cctv/cameras */
  async handleCameraList(url: URL): Promise<Response> {
    const sourceParam = url.searchParams.get("source") as "austin" | "caltrans" | "ny511" | null;
    const cameras = await this.fetchAllCameras(sourceParam || undefined);
    const bboxParam = url.searchParams.get("bbox");

    if (!bboxParam) {
      return jsonResponse(cameras);
    }

    const parts = bboxParam.split(",").map(Number);
    const [west, south, east, north] = parts;

    if (west === undefined || south === undefined || east === undefined || north === undefined ||
        isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      return jsonResponse({ error: "Invalid bbox format. Expected: west,south,east,north" }, 400);
    }

    const camerasInBbox = cameras.filter((camera) => {
      return (
        camera.longitude >= west &&
        camera.longitude <= east &&
        camera.latitude >= south &&
        camera.latitude <= north
      );
    });

    const sourceLabel = sourceParam || "all";
    console.log(`[CCTV] Returning ${camerasInBbox.length} ${sourceLabel} cameras in bbox [${bboxParam}]`);
    return jsonResponse(camerasInBbox);
  }

  /** Handle GET /api/cctv/thumbnail/:id */
  async handleThumbnail(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return jsonResponse({ error: "Camera not found", cameraId }, 404);
    }

    // Check memory cache first
    const cached = this.thumbnailCache.get(cameraId);
    if (cached && Date.now() - cached.timestamp < CCTV_THUMBNAIL_TTL) {
      return new Response(cached.data as unknown as BlobPart, {
        headers: { ...CORS_HEADERS, "Content-Type": cached.contentType },
      });
    }

    try {
      const imageUrl = camera.imageUrl;
      if (!imageUrl) throw new Error("Camera has no image URL");

      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);

      const imageData = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("Content-Type") || "image/jpeg";

      // Update caches
      this.thumbnailCache.set(cameraId, { data: imageData, timestamp: Date.now(), contentType });
      this.lastKnownGoodCache.set(cameraId, { data: imageData, contentType, fetchedAt: Date.now() });
      this.saveCachedImage(cameraId, imageData); // async

      return new Response(imageData as unknown as BlobPart, {
        headers: { ...CORS_HEADERS, "Content-Type": contentType },
      });
    } catch (error) {
      // Try in-memory cache
      const lastGood = this.lastKnownGoodCache.get(cameraId);
      if (lastGood) {
        return new Response(lastGood.data as unknown as BlobPart, {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": lastGood.contentType,
            "X-Stale": "true",
            "X-Last-Fetched": new Date(lastGood.fetchedAt).toISOString(),
          },
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

        return new Response(diskCached.data as unknown as BlobPart, {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "image/jpeg",
            "X-Stale": "true",
            "X-From-Disk": "true",
            "X-Last-Fetched": new Date(diskCached.fetchedAt).toISOString(),
          },
        });
      }

      // No cache - return offline frame
      console.error(`[CCTV] Error fetching thumbnail for ${cameraId} (no cache):`, error);
      const offlineFrame = this.generateOfflineFrame(camera);
      return new Response(offlineFrame as unknown as BlobPart, {
        headers: { ...CORS_HEADERS, "Content-Type": "image/png" },
      });
    }
  }

  /** Handle GET /api/cctv/stream/:id */
  async handleStream(cameraId: string): Promise<Response> {
    const cameras = await this.fetchAllCameras();
    const camera = cameras.find((c) => c.id === cameraId);

    if (!camera) {
      return jsonResponse({ error: "Camera not found", cameraId }, 404);
    }

    if (!camera.imageUrl) {
      return jsonResponse({ error: "Camera has no image URL", cameraId }, 400);
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
                  this.lastKnownGoodCache.set(cameraId, {
                    data: diskCached.data,
                    contentType: "image/jpeg",
                    fetchedAt: diskCached.fetchedAt,
                  });
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

    return corsResponse(stream, {
      headers: {
        "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // --------------------------------------------------------------------------
  // Offline Frame Generation
  // --------------------------------------------------------------------------

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
export const cctvProxyManager = new CCTVProxyManager();
