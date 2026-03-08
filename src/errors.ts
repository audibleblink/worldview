/**
 * WorldView - Error Handling Utilities
 * Consistent error logging and handling patterns
 */

/** Log levels for error reporting */
export type LogLevel = "error" | "warn" | "info" | "debug";

/** Standard error log format */
export function logError(prefix: string, message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error ?? "");
  const fullMessage = errorMsg ? `${message}: ${errorMsg}` : message;
  console.error(`[${prefix}] ${fullMessage}`);
}

/** Standard warning log format */
export function logWarn(prefix: string, message: string): void {
  console.warn(`[${prefix}] ${message}`);
}

/** Standard info log format */
export function logInfo(prefix: string, message: string): void {
  console.log(`[${prefix}] ${message}`);
}

/** 
 * Wrap an async function with error handling.
 * Logs errors with consistent format and returns null on failure.
 */
export async function tryAsync<T>(
  prefix: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logError(prefix, operation, error);
    return null;
  }
}

/**
 * Wrap a sync function with error handling.
 * Logs errors with consistent format and returns null on failure.
 */
export function trySync<T>(
  prefix: string,
  operation: string,
  fn: () => T
): T | null {
  try {
    return fn();
  } catch (error) {
    logError(prefix, operation, error);
    return null;
  }
}
