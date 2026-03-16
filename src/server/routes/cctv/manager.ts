/**
 * CCTV Proxy Manager — Registry & Orchestrator
 *
 * Manages camera sources, provides route handlers for camera list/thumbnail/stream,
 * and implements caching (memory, disk, last-known-good).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { jsonResponse, imageResponse, streamResponse, errorResponse, CORS_HEADERS } from "../../types.ts";
import { encodePNG, drawText, drawBorder } from "../../utils/png.ts";
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
  async handleCameraList(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sourceFilter = url.searchParams.get("source") ?? undefined;
    const bboxParam = url.searchParams.get("bbox");

    let cameras = this.allCameras;

    if (sourceFilter) {
      cameras = cameras.filter((c) => c.source === sourceFilter);
    }

    if (bboxParam) {
      const parts = bboxParam.split(",").map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        return errorResponse("Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat", 400);
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
      return errorResponse("Camera not found", 404);
    }

    const imageMedia = camera.media.find((m) => m.type === "image");
    if (!imageMedia) {
      const offlineFrame = this.generateOfflineFrame(camera);
      return imageResponse(offlineFrame, "image/png");
    }

    // Check memory cache
    const now = Date.now();
    const cached = this.thumbnailCache.get(cameraId);
    if (cached && now - cached.timestamp < CCTV_THUMBNAIL_TTL) {
      return imageResponse(cached.data, cached.contentType);
    }

    try {
      const response = await fetch(imageMedia.url, {
        headers: { "User-Agent": "WorldView/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("Content-Type") || "image/jpeg";

      this.thumbnailCache.set(cameraId, { data, timestamp: now, contentType });
      this.lastKnownGoodCache.set(cameraId, { data, contentType, fetchedAt: now });
      this.saveCachedImage(cameraId, data);

      return imageResponse(data, contentType);
    } catch (error) {
      // Try last-known-good from memory
      const lkg = this.lastKnownGoodCache.get(cameraId);
      if (lkg) {
        return imageResponse(lkg.data, lkg.contentType, { "X-Stale": "true" });
      }

      // Try disk cache
      const diskData = await this.loadCachedImage(cameraId);
      if (diskData) {
        return imageResponse(diskData, "image/jpeg", {
          "X-Stale": "true",
          "X-From-Disk": "true",
        });
      }

      const offlineFrame = this.generateOfflineFrame(camera);
      return imageResponse(offlineFrame, "image/png");
    }
  }

  /** Handle GET /api/cctv/stream/:id - MJPEG stream */
  async handleStream(cameraId: string): Promise<Response> {
    const camera = this.getCameraById(cameraId);
    if (!camera) {
      return errorResponse("Camera not found", 404);
    }

    const imageMedia = camera.media.find((m) => m.type === "image");
    if (!imageMedia) {
      return errorResponse("Camera does not support image streaming", 400);
    }

    const boundary = "frame";
    const imageUrl = imageMedia.url;
    const encoder = new TextEncoder();

    let interval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start: async (controller) => {
        const fetchFrame = async (): Promise<Uint8Array | null> => {
          try {
            const response = await fetch(imageUrl, {
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

        await pushFrame();

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
        if (interval) clearInterval(interval);
      },
    });

    return streamResponse(stream, `multipart/x-mixed-replace; boundary=${boundary}`);
  }

  /** Handle GET /api/cctv/hls/:id - Get signed HLS URL */
  async handleHlsUrl(cameraId: string): Promise<Response> {
    const dashIndex = cameraId.indexOf("-");
    if (dashIndex === -1) {
      return errorResponse("Invalid camera ID format", 400);
    }
    const sourceName = cameraId.slice(0, dashIndex);

    const source = this.sourceMap.get(sourceName);
    if (!source) {
      return errorResponse(`Unknown source: ${sourceName}`, 404);
    }

    if (!source.getSignedHlsUrl) {
      return errorResponse("Source does not support signed HLS URLs", 400);
    }

    try {
      const signedUrl = await source.getSignedHlsUrl(cameraId);
      return jsonResponse({ url: signedUrl });
    } catch (error) {
      console.error(`[CCTV] Error getting signed HLS URL for ${cameraId}:`, error);
      return errorResponse("Failed to get stream URL", 502);
    }
  }

  /** Handle GET /api/cctv/hls-relay/:id/:path - Proxy HLS stream server-side (avoids CORS) */
  async handleHlsRelay(cameraId: string, relayPath: string, _req: Request): Promise<Response> {
    const dashIndex = cameraId.indexOf("-");
    if (dashIndex === -1) {
      return errorResponse("Invalid camera ID format", 400);
    }
    const sourceName = cameraId.slice(0, dashIndex);
    const source = this.sourceMap.get(sourceName);
    if (!source) {
      return errorResponse(`Unknown source: ${sourceName}`, 404);
    }
    if (!source.getSignedHlsUrl) {
      return errorResponse("Source does not support signed HLS URLs", 400);
    }

    try {
      const signedUrl = await source.getSignedHlsUrl(cameraId);
      const signedUrlObj = new URL(signedUrl);

      // Strip the playlist filename to get base path (e.g. /rtplive/R11_272/)
      const basePath = signedUrlObj.pathname.replace(/[^/]+$/, "");
      const upstreamUrl = new URL(basePath + relayPath + signedUrlObj.search, signedUrlObj.origin).toString();

      const upstream = await fetch(upstreamUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!upstream.ok) {
        return errorResponse(`Upstream error: ${upstream.status}`, 502);
      }

      const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";

      // For HLS manifests, rewrite relative segment URLs to go through this relay
      if (contentType.includes("mpegurl") || relayPath.endsWith(".m3u8")) {
        const manifestText = await upstream.text();
        const proxyBase = `/api/cctv/hls-relay/${encodeURIComponent(cameraId)}/`;
        const rewritten = manifestText
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            // Non-comment, non-empty lines are segment/playlist references
            if (trimmed && !trimmed.startsWith("#")) {
              return proxyBase + trimmed;
            }
            return line;
          })
          .join("\n");
        return new Response(rewritten, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-cache",
          },
        });
      }

      // For segments and other binary content, stream through
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error(`[CCTV] HLS relay error for ${cameraId}/${relayPath}:`, error);
      return errorResponse("HLS relay error", 502);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Offline Frame Generation
  // ─────────────────────────────────────────────────────────────────

  private generateOfflineFrame(camera: CCTVCamera): Uint8Array {
    const width = 320;
    const height = 240;
    const pixels = new Uint8Array(width * height * 4);

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 20;
      pixels[i + 1] = 20;
      pixels[i + 2] = 30;
      pixels[i + 3] = 255;
    }

    drawBorder(pixels, width, height, [255, 50, 50]);
    drawText(pixels, width, height, "SIGNAL LOST", 110, 100, [255, 50, 50]);
    drawText(pixels, width, height, camera.name.substring(0, 40), 10, 200, [100, 100, 100]);

    return encodePNG(pixels, width, height);
  }
}
