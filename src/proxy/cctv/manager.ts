/**
 * CCTV Proxy Manager — Registry & Orchestrator
 *
 * Manages camera sources, provides route handlers for camera list/thumbnail/stream,
 * and implements caching (memory, disk, last-known-good).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { corsResponse, jsonResponse, CORS_HEADERS } from "../types.ts";
import { encodePNG, drawText, drawBorder } from "../png.ts";
import type { CameraSource, CCTVCamera } from "./types.ts";

const CCTV_THUMBNAIL_TTL = 1000; // 1 second memory cache
const CCTV_CACHE_DIR = "./cache/cctv";

interface ThumbnailCacheEntry {
  data: Uint8Array;
  timestamp: number;
  contentType: string;
}

interface LastKnownGoodEntry {
  data: Uint8Array;
  contentType: string;
  fetchedAt: number;
}

export class CCTVProxyManager {
  private sources: CameraSource[] = [];
  private allCameras: CCTVCamera[] = [];
  private thumbnailCache = new Map<string, ThumbnailCacheEntry>();
  private lastKnownGoodCache = new Map<string, LastKnownGoodEntry>();
  private sourceMap = new Map<string, CameraSource>();

  constructor() {
    // Ensure cache directory exists (fire and forget)
    mkdir(CCTV_CACHE_DIR, { recursive: true }).catch(() => {});
  }

  /** Register a camera source */
  register(source: CameraSource): void {
    this.sources.push(source);
    this.sourceMap.set(source.name, source);
  }

  /** Initialize by fetching cameras from all sources */
  async initialize(): Promise<void> {
    const results = await Promise.allSettled(this.sources.map((s) => s.fetchCameras()));
    this.allCameras = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        this.allCameras.push(...result.value);
      } else {
        console.warn(`[CCTV] Source "${this.sources[i]!.name}" failed:`, result.reason);
      }
    }

    console.log(`[CCTV] Camera proxy ready — ${this.allCameras.length} cameras from ${this.sources.length} sources`);
  }

  /** Fetch all cameras, optionally filtered by source name */
  async fetchAllCameras(sourceName?: string): Promise<CCTVCamera[]> {
    // Re-fetch from sources
    const results = await Promise.allSettled(this.sources.map((s) => s.fetchCameras()));
    this.allCameras = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        this.allCameras.push(...result.value);
      }
    }

    if (sourceName) {
      return this.allCameras.filter((c) => c.source === sourceName);
    }
    return this.allCameras;
  }

  /** Get a camera by ID from the cached list */
  private getCameraById(id: string): CCTVCamera | undefined {
    return this.allCameras.find((c) => c.id === id);
  }

  // ─────────────────────────────────────────────────────────────────
  // Disk Cache
  // ─────────────────────────────────────────────────────────────────

  private getCachePath(cameraId: string): string {
    return `${CCTV_CACHE_DIR}/${cameraId.replace(/[^a-zA-Z0-9-_]/g, "_")}.jpg`;
  }

  private async loadCachedImage(cameraId: string): Promise<Uint8Array | null> {
    try {
      const data = await readFile(this.getCachePath(cameraId));
      return new Uint8Array(data);
    } catch {
      return null;
    }
  }

  private async saveCachedImage(cameraId: string, data: Uint8Array): Promise<void> {
    try {
      await writeFile(this.getCachePath(cameraId), data);
    } catch {
      // Ignore write errors
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Route Handlers
  // ─────────────────────────────────────────────────────────────────

  /** Handle GET /api/cctv/cameras */
  async handleCameraList(url: URL): Promise<Response> {
    const sourceFilter = url.searchParams.get("source");
    const bboxParam = url.searchParams.get("bbox");

    let cameras = this.allCameras;

    // Filter by source
    if (sourceFilter) {
      cameras = cameras.filter((c) => c.source === sourceFilter);
    }

    // Filter by bounding box
    if (bboxParam) {
      const parts = bboxParam.split(",").map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        return jsonResponse({ error: "Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat" }, 400);
      }

      const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
      cameras = cameras.filter(
        (c) =>
          c.longitude >= minLon &&
          c.longitude <= maxLon &&
          c.latitude >= minLat &&
          c.latitude <= maxLat
      );
    }

    return jsonResponse(cameras);
  }

  /** Handle GET /api/cctv/thumbnail/:id */
  async handleThumbnail(cameraId: string): Promise<Response> {
    const camera = this.getCameraById(cameraId);
    if (!camera) {
      return jsonResponse({ error: "Camera not found" }, 404);
    }

    // Find image media
    const imageMedia = camera.media.find((m) => m.type === "image");
    if (!imageMedia) {
      // No image media - return offline frame
      const offlineFrame = this.generateOfflineFrame(camera);
      return corsResponse(offlineFrame, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }

    // Check memory cache
    const now = Date.now();
    const cached = this.thumbnailCache.get(cameraId);
    if (cached && now - cached.timestamp < CCTV_THUMBNAIL_TTL) {
      return corsResponse(cached.data, {
        status: 200,
        headers: { "Content-Type": cached.contentType },
      });
    }

    // Fetch from source
    try {
      const response = await fetch(imageMedia.url, {
        headers: {
          "User-Agent": "WorldView/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("Content-Type") || "image/jpeg";

      // Update memory cache
      this.thumbnailCache.set(cameraId, { data, timestamp: now, contentType });

      // Update last-known-good
      this.lastKnownGoodCache.set(cameraId, { data, contentType, fetchedAt: now });

      // Save to disk (async, fire and forget)
      this.saveCachedImage(cameraId, data);

      return corsResponse(data, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    } catch (error) {
      // Try last-known-good from memory
      const lkg = this.lastKnownGoodCache.get(cameraId);
      if (lkg) {
        return corsResponse(lkg.data, {
          status: 200,
          headers: {
            "Content-Type": lkg.contentType,
            "X-Stale": "true",
          },
        });
      }

      // Try disk cache
      const diskData = await this.loadCachedImage(cameraId);
      if (diskData) {
        return corsResponse(diskData, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "X-Stale": "true",
          },
        });
      }

      // Generate offline frame
      const offlineFrame = this.generateOfflineFrame(camera);
      return corsResponse(offlineFrame, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }
  }

  /** Handle GET /api/cctv/stream/:id - MJPEG stream */
  async handleStream(cameraId: string): Promise<Response> {
    const camera = this.getCameraById(cameraId);
    if (!camera) {
      return jsonResponse({ error: "Camera not found" }, 404);
    }

    // Find image media - stream only works for image type
    const imageMedia = camera.media.find((m) => m.type === "image");
    if (!imageMedia) {
      return jsonResponse({ error: "Camera does not support image streaming" }, 400);
    }

    // Create MJPEG stream
    const encoder = new TextEncoder();
    const boundary = "frame";

    let interval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start: async (controller) => {
        const fetchFrame = async (): Promise<Uint8Array | null> => {
          try {
            const response = await fetch(imageMedia.url, {
              headers: { "User-Agent": "WorldView/1.0" },
            });
            if (!response.ok) return null;
            return new Uint8Array(await response.arrayBuffer());
          } catch {
            return null;
          }
        };

        const pushFrame = async () => {
          const frame = await fetchFrame();
          if (!frame) return;

          const header = encoder.encode(
            `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
          );
          controller.enqueue(header);
          controller.enqueue(frame);
          controller.enqueue(encoder.encode("\r\n"));
        };

        // Push first frame immediately
        await pushFrame();

        // Then push at interval
        interval = setInterval(async () => {
          try {
            await pushFrame();
          } catch {
            if (interval) clearInterval(interval);
            controller.close();
          }
        }, 1000);
      },
      cancel: () => {
        // Clean up when stream is cancelled
        if (interval) clearInterval(interval);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
        "Cache-Control": "no-cache",
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Offline Frame Generation
  // ─────────────────────────────────────────────────────────────────

  /** Generate a "SIGNAL LOST" PNG frame for offline cameras */
  private generateOfflineFrame(camera: CCTVCamera): Uint8Array {
    const width = 320;
    const height = 240;
    const pixels = new Uint8Array(width * height * 4);

    // Fill with dark background
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 20;     // R
      pixels[i + 1] = 20; // G
      pixels[i + 2] = 30; // B
      pixels[i + 3] = 255; // A
    }

    // Draw border
    drawBorder(pixels, width, height, [255, 50, 50]);

    // Draw text
    const signalText = "SIGNAL LOST";
    const nameText = camera.name.substring(0, 40);

    drawText(pixels, width, height, signalText, 110, 100, [255, 50, 50]);
    drawText(pixels, width, height, nameText, 10, 200, [100, 100, 100]);

    return encodePNG(pixels, width, height);
  }
}
