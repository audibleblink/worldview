/**
 * Shared types and response helpers for server routes
 *
 * Provides consistent response shapes across all endpoints.
 */

/** CORS headers used across all endpoints */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/**
 * Standard error shape for all API responses
 */
export interface ErrorResponse {
  error: string;
  status: number;
}

/**
 * Route handler type for Bun.serve routes
 */
export type RouteHandler = (req: Request) => Response | Promise<Response>;

/**
 * Create a response with CORS headers
 */
export function corsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...init.headers },
  });
}

/**
 * Create a JSON response with CORS headers
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a consistent error response
 *
 * Always returns `{ error: string, status: number }` shape
 */
export function errorResponse(message: string, status: number): Response {
  const body: ErrorResponse = { error: message, status };
  return corsResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create an image response with CORS headers
 */
export function imageResponse(
  data: Uint8Array | ArrayBuffer,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return corsResponse(data as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...extraHeaders,
    },
  });
}

/**
 * Create a text response with CORS headers
 */
export function textResponse(text: string, status = 200, contentType = "text/plain"): Response {
  return corsResponse(text, {
    status,
    headers: { "Content-Type": `${contentType}; charset=utf-8` },
  });
}

/**
 * Create a streaming response with CORS headers
 */
export function streamResponse(
  stream: ReadableStream,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return corsResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...extraHeaders,
    },
  });
}
