/**
 * Middleware utilities for server routes
 *
 * Provides composable wrappers for:
 * - Error boundary (catch errors, return consistent error response)
 * - Request/response logging with timing
 */

import { errorResponse, type RouteHandler } from "./types.ts";

/**
 * Wrap a handler with error boundary
 *
 * Catches all errors and returns a consistent error response shape.
 * Logs errors to console for debugging.
 */
export function withErrorBoundary(handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      const message = error instanceof Error ? error.message : "Internal server error";

      console.error(`[Error] ${req.method} ${new URL(req.url).pathname}:`, message);

      return errorResponse(isTimeout ? "Request timeout" : message, isTimeout ? 504 : 500);
    }
  };
}

/**
 * Wrap a handler with request/response logging
 *
 * Logs request method, path, and response status with timing.
 */
export function withLogging(handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const url = new URL(req.url);
    const path = url.pathname + url.search;

    const response = await handler(req);

    const duration = (performance.now() - start).toFixed(1);
    const status = response.status;
    const statusColor = status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";

    console.log(
      `[${new Date().toISOString().slice(11, 19)}] ${req.method} ${path} ${statusColor}${status}\x1b[0m ${duration}ms`
    );

    return response;
  };
}

/**
 * Apply standard middleware stack to a handler
 *
 * Applies: Logging → Error Boundary
 * CORS preflight is handled at the server level in index.ts
 */
export function applyMiddleware(handler: RouteHandler): RouteHandler {
  return withLogging(withErrorBoundary(handler));
}

/**
 * Create a route map with middleware applied to all handlers
 *
 * @example
 * const routes = createRoutes({
 *   "/health": () => jsonResponse({ status: "ok" }),
 *   "/tle": handleTLE,
 * });
 */
export function createRoutes(
  handlers: Record<string, RouteHandler>
): Record<string, RouteHandler> {
  const routes: Record<string, RouteHandler> = {};

  for (const [path, handler] of Object.entries(handlers)) {
    routes[path] = applyMiddleware(handler);
  }

  return routes;
}
