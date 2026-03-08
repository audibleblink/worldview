/**
 * Shared types for proxy modules
 */

/** CORS headers used across endpoints */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/** Create a response with CORS headers */
export function corsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...init.headers },
  });
}

/** Create a JSON response with CORS headers */
export function jsonResponse(data: object, status = 200): Response {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
