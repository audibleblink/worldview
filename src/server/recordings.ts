/**
 * Recording route handlers + on-disk storage helpers.
 *
 * On-disk layout:
 *   recordings/<id>/meta.json
 *   recordings/<id>/frames.ndjson
 *
 * Id format: <ISO-timestamp-with-dashes>_<4-hex>
 *   e.g. 2026-04-29T14-00-00-000Z_a3f1
 *   Colons and dots in ISO strings are replaced with dashes for filename safety.
 *
 * Frame append uses node:fs/promises appendFile — Bun.file writer append is
 * unreliable across Bun versions (plan.md risk mitigation).
 */

import { mkdir, rm, readdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecordingMeta, Frame } from "../recording/types.ts";
import { jsonResponse, errorResponse, corsResponse } from "./types.ts";

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Read recordings directory from env each call so tests can override
 * process.env.WORLDVIEW_RECORDINGS_DIR between test cases.
 */
export function getRecordingsDir(): string {
  return process.env.WORLDVIEW_RECORDINGS_DIR ?? join(process.cwd(), "recordings");
}

export function recordingDir(id: string): string {
  return join(getRecordingsDir(), id);
}

export function metaPath(id: string): string {
  return join(recordingDir(id), "meta.json");
}

export function framesPath(id: string): string {
  return join(recordingDir(id), "frames.ndjson");
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readMeta(id: string): Promise<RecordingMeta | null> {
  try {
    const file = Bun.file(metaPath(id));
    const text = await file.text();
    return JSON.parse(text) as RecordingMeta;
  } catch {
    return null;
  }
}

export async function writeMeta(id: string, meta: RecordingMeta): Promise<void> {
  await Bun.write(metaPath(id), JSON.stringify(meta));
}

export async function appendFrameLine(id: string, line: string): Promise<void> {
  await appendFile(framesPath(id), line);
}

/** Generate a recording id: ISO timestamp (colons/dots → dashes) + _ + 4 random hex chars. */
export function genId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${ts}_${hex}`;
}

// ---------------------------------------------------------------------------
// 6-hour watchdog
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Active watchdog timers keyed by recording id. */
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

async function finalizeRecording(id: string): Promise<void> {
  const meta = await readMeta(id);
  if (!meta || meta.complete) return;

  // Count frames by counting newlines in frames.ndjson
  let frameCount = 0;
  try {
    const text = await Bun.file(framesPath(id)).text();
    frameCount = text.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    frameCount = frameCounts.get(id) ?? 0;
  }

  await writeMeta(id, {
    ...meta,
    endTime: Date.now(),
    frameCount,
    // watchdog finalize leaves complete=false per plan §2.3
    complete: false,
  });
}

/**
 * Exported for test injection (plan §2.3 / §2.5).
 * Tests call this directly instead of waiting 6 hours.
 */
export async function _testOnlyFireFinalize(id: string): Promise<void> {
  cancelWatchdog(id);
  await finalizeRecording(id);
}

function scheduleWatchdog(id: string): void {
  const timer = setTimeout(() => {
    watchdogs.delete(id);
    finalizeRecording(id).catch((e) =>
      console.error(`[recordings] watchdog finalize failed for ${id}:`, e)
    );
  }, SIX_HOURS_MS);
  watchdogs.set(id, timer);
}

function cancelWatchdog(id: string): void {
  const timer = watchdogs.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    watchdogs.delete(id);
  }
}

// ---------------------------------------------------------------------------
// In-memory frame counters (avoid rewriting meta.json on every frame append)
// ---------------------------------------------------------------------------

const frameCounts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function createRecordingHandler(req: Request): Promise<Response> {
  let body: { bbox?: unknown; tles?: unknown; name?: string; cameraAltitude?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body.bbox || !body.tles) {
    return errorResponse("Missing required fields: bbox, tles", 400);
  }

  const id = genId();
  const dir = recordingDir(id);
  await ensureDir(dir);

  const meta: RecordingMeta = {
    id,
    name: body.name ?? id,
    startTime: Date.now(),
    endTime: null,
    bbox: body.bbox as RecordingMeta["bbox"],
    cameraAltitude: body.cameraAltitude ?? 0,
    tles: body.tles as RecordingMeta["tles"],
    frameCount: 0,
    complete: false,
  };

  await writeMeta(id, meta);
  // Touch empty frames file
  await Bun.write(framesPath(id), "");

  frameCounts.set(id, 0);
  scheduleWatchdog(id);

  return jsonResponse({ id }, 201);
}

async function appendFrameHandler(req: Request, id: string): Promise<Response> {
  const meta = await readMeta(id);
  if (!meta) return errorResponse("Recording not found", 404);

  let frame: Frame;
  try {
    frame = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  await appendFrameLine(id, JSON.stringify(frame) + "\n");
  frameCounts.set(id, (frameCounts.get(id) ?? 0) + 1);

  return corsResponse(null, { status: 204 });
}

async function stopRecordingHandler(_req: Request, id: string): Promise<Response> {
  const meta = await readMeta(id);
  if (!meta) return errorResponse("Recording not found", 404);

  cancelWatchdog(id);

  // Count lines in frames.ndjson for accurate frameCount
  let frameCount = frameCounts.get(id) ?? 0;
  try {
    const text = await Bun.file(framesPath(id)).text();
    frameCount = text.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    // fall back to in-memory counter
  }

  const updated: RecordingMeta = {
    ...meta,
    endTime: Date.now(),
    frameCount,
    complete: true,
  };

  await writeMeta(id, updated);
  frameCounts.delete(id);

  return jsonResponse(updated, 200);
}

async function listRecordingsHandler(_req: Request): Promise<Response> {
  let entries: string[];
  try {
    entries = await readdir(getRecordingsDir());
  } catch {
    // Directory doesn't exist yet — return empty list
    return jsonResponse([], 200);
  }

  const metas: RecordingMeta[] = [];
  for (const entry of entries) {
    const meta = await readMeta(entry);
    if (meta) {
      metas.push(meta);
    } else {
      console.warn(`[recordings] skipping ${entry}: missing or unreadable meta.json`);
    }
  }

  metas.sort((a, b) => b.startTime - a.startTime);
  return jsonResponse(metas, 200);
}

async function fetchFramesHandler(_req: Request, id: string): Promise<Response> {
  const meta = await readMeta(id);
  if (!meta) return errorResponse("Recording not found", 404);

  const file = Bun.file(framesPath(id));
  const exists = await file.exists();
  if (!exists) return errorResponse("Frames file not found", 404);

  return corsResponse(file.stream() as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

async function deleteRecordingHandler(_req: Request, id: string): Promise<Response> {
  const dir = recordingDir(id);
  await rm(dir, { recursive: true, force: true });
  frameCounts.delete(id);
  cancelWatchdog(id);
  return corsResponse(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle all /api/recordings/* requests.
 * Called from src/server/index.ts for paths prefixed with /api/recordings.
 */
export async function handleRecordings(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /api/recordings
  if (method === "POST" && path === "/api/recordings") {
    return createRecordingHandler(req);
  }

  // GET /api/recordings
  if (method === "GET" && path === "/api/recordings") {
    return listRecordingsHandler(req);
  }

  // Extract /:id from /api/recordings/:id[/...]
  const match = path.match(/^\/api\/recordings\/([^/]+)(\/.*)?$/);
  if (!match) {
    return errorResponse("Not found", 404);
  }

  const id = match[1];
  const sub = match[2] ?? "";

  // POST /api/recordings/:id/frames
  if (method === "POST" && sub === "/frames") {
    return appendFrameHandler(req, id);
  }

  // POST /api/recordings/:id/stop
  if (method === "POST" && sub === "/stop") {
    return stopRecordingHandler(req, id);
  }

  // GET /api/recordings/:id/frames
  if (method === "GET" && sub === "/frames") {
    return fetchFramesHandler(req, id);
  }

  // DELETE /api/recordings/:id
  if (method === "DELETE" && sub === "") {
    return deleteRecordingHandler(req, id);
  }

  return errorResponse("Not found", 404);
}
