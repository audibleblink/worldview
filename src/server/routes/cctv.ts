/**
 * CCTV Route Handler — re-exports from the source registry
 *
 * The actual implementation lives in ./cctv/ (CCTVProxyManager + per-source classes).
 * This file keeps the server/index.ts import stable.
 */

export type { CCTVCamera } from "./cctv/types.ts";
import { cctvProxyManager } from "./cctv/index.ts";

export async function initializeCCTV(): Promise<void> {
  return cctvProxyManager.initialize();
}

export async function handleCameraList(req: Request): Promise<Response> {
  return cctvProxyManager.handleCameraList(req);
}

export async function handleThumbnail(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/cctv\/thumbnail\/(.+)$/);
  if (!match?.[1]) {
    const { errorResponse } = await import("../types.ts");
    return errorResponse("Missing camera ID", 400);
  }
  return cctvProxyManager.handleThumbnail(match[1]);
}

export async function handleStream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/cctv\/stream\/(.+)$/);
  if (!match?.[1]) {
    const { errorResponse } = await import("../types.ts");
    return errorResponse("Missing camera ID", 400);
  }
  return cctvProxyManager.handleStream(match[1]);
}

export async function handleHlsUrl(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/api\/cctv\/hls\/(.+)$/);
  if (!match?.[1]) {
    const { errorResponse } = await import("../types.ts");
    return errorResponse("Missing camera ID", 400);
  }
  return cctvProxyManager.handleHlsUrl(match[1]);
}

/** Handle GET /api/cctv/hls-relay/:id/:path - Proxy HLS content server-side */
export async function handleHlsRelay(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Path format: /api/cctv/hls-relay/:id/:relayPath
  const match = url.pathname.match(/^\/api\/cctv\/hls-relay\/([^/]+)\/(.+)$/);
  if (!match) {
    const { errorResponse } = await import("../types.ts");
    return errorResponse("Invalid relay URL", 400);
  }
  const cameraId = decodeURIComponent(match[1]!);
  const relayPath = match[2]!;
  return cctvProxyManager.handleHlsRelay(cameraId, relayPath);
}
