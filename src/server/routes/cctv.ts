/**
 * CCTV Route Handler — re-exports from the source registry
 *
 * The actual implementation lives in ./cctv/ (CCTVProxyManager + per-source classes).
 * This file keeps the server/index.ts import stable.
 */

export type { CCTVCamera } from "./cctv/types.ts";
import { cctvProxyManager } from "./cctv/index.ts";
import { errorResponse } from "../types.ts";

/** Extract a path segment after a prefix, e.g. "/api/cctv/thumbnail/abc" → "abc" */
function extractPathParam(url: URL, prefix: string): string | null {
  const match = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null;
  return match || null;
}

export async function initializeCCTV(): Promise<void> {
  return cctvProxyManager.initialize();
}

export async function handleCameraList(req: Request): Promise<Response> {
  return cctvProxyManager.handleCameraList(req);
}

export async function handleThumbnail(req: Request): Promise<Response> {
  const id = extractPathParam(new URL(req.url), "/api/cctv/thumbnail/");
  if (!id) return errorResponse("Missing camera ID", 400);
  return cctvProxyManager.handleThumbnail(id);
}

export async function handleStream(req: Request): Promise<Response> {
  const id = extractPathParam(new URL(req.url), "/api/cctv/stream/");
  if (!id) return errorResponse("Missing camera ID", 400);
  return cctvProxyManager.handleStream(id);
}

export async function handleHlsUrl(req: Request): Promise<Response> {
  const id = extractPathParam(new URL(req.url), "/api/cctv/hls/");
  if (!id) return errorResponse("Missing camera ID", 400);
  return cctvProxyManager.handleHlsUrl(id);
}

/** Handle GET /api/cctv/hls-relay/:id/:path - Proxy HLS content server-side */
export async function handleHlsRelay(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/cctv\/hls-relay\/([^/]+)\/(.+)$/);
  if (!match) return errorResponse("Invalid relay URL", 400);

  const cameraId = decodeURIComponent(match[1]!);
  const relayPath = match[2]!;
  return cctvProxyManager.handleHlsRelay(cameraId, relayPath);
}
