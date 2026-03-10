/**
 * Middleware utilities for server routes
 *
 * Provides composable wrappers for:
 * - Error boundary (catch all errors, return consistent error response)
 * - CORS preflight handling
 * - Request/response logging
 */

import { corsResponse, errorResponse, type RouteHandler } from "./types.ts";

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
      const message = error instanceof Error ? error.message : "Internal server error";
      const isTimeout = error instanceof Error && error.name === "AbortError";

      console.error(
        `[Error] ${req.method} ${new URL(req.url).pathname}:`,
        error instanceof Error ? error.message : error
      );

      if (isTimeout) {
        return errorResponse("Request timeout", 504);
      }

      return errorResponse(message, 500);
    }
  };
}

/**
 * Wrap a handler with CORS support
 *
 * Automatically handles OPTIONS preflight requests.
 */
export function withCORS(handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    return handler(req);
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
    const reset = "\x1b[0m";

    console.log(
      `[${new Date().toISOString().slice(11, 19)}] ${req.method} ${path} ${statusColor}${status}${reset} ${duration}ms`
    );

    return response;
  };
}

/**
 * Compose multiple middleware functions
 *
 * @example
 * const handler = compose(withCORS, withLogging, withErrorBoundary)(myHandler);
 */
export function compose(...middlewares: Array<(h: RouteHandler) => RouteHandler>) {
  return (handler: RouteHandler): RouteHandler => {
    return middlewares.reduceRight((h, middleware) => middleware(h), handler);
  };
}

/**
 * Apply standard middleware stack to a handler
 *
 * Applies: CORS → Logging → Error Boundary
 * This is the recommended wrapper for all route handlers.
 */
export function applyMiddleware(handler: RouteHandler): RouteHandler {
  return compose(withCORS, withLogging, withErrorBoundary)(handler);
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
