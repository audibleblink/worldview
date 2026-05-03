/**
 * Tests for src/server/recordings.ts
 *
 * Spins up a Bun.serve with port:0 (auto-assign) and drives the recording
 * API via fetch. Uses a temp dir per test to keep tests isolated.
 *
 * RECORDINGS_DIR is read dynamically on each handler call (via
 * process.env.WORLDVIEW_RECORDINGS_DIR) so we can change it between tests
 * even though the module is only imported once.
 */

import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleRecordings, _testOnlyFireFinalize } from "../server/recordings.ts";

let tmpDir: string;
let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "wv-rec-test-"));
  process.env.WORLDVIEW_RECORDINGS_DIR = tmpDir;

  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }
      return handleRecordings(req);
    },
  });
  base = `http://localhost:${server.port}`;
});

afterEach(async () => {
  server.stop(true);
  await rm(tmpDir, { recursive: true, force: true });
  delete process.env.WORLDVIEW_RECORDINGS_DIR;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleBbox = { west: -1, south: -1, east: 1, north: 1 };
const sampleTles = [
  { name: "ISS", noradId: "25544", line1: "1 25544U", line2: "2 25544", category: "stations" as const },
];
const sampleFrame = {
  t: 1000,
  planes: [{ icao24: "abc123", latitude: 51.5, longitude: -0.1, altitude: 10000, heading: 90, velocity: 250, callsign: "BA001" }],
  ships: [],
  seismic: [],
};

async function createRecording(name?: string): Promise<{ id: string }> {
  const res = await fetch(`${base}/api/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox: sampleBbox, tles: sampleTles, ...(name ? { name } : {}) }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function appendFrame(id: string, t: number): Promise<void> {
  const res = await fetch(`${base}/api/recordings/${id}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sampleFrame, t }),
  });
  expect(res.status).toBe(204);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/recordings", () => {
  test("returns id; meta.json on disk has correct shape", async () => {
    const { id } = await createRecording("my-test-rec");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const metaText = await Bun.file(join(tmpDir, id, "meta.json")).text();
    const meta = JSON.parse(metaText);
    expect(meta.id).toBe(id);
    expect(meta.name).toBe("my-test-rec");
    expect(meta.complete).toBe(false);
    expect(meta.endTime).toBeNull();
    expect(meta.bbox).toEqual(sampleBbox);
    expect(meta.frameCount).toBe(0);
  });

  test("returns 400 when bbox is missing", async () => {
    const res = await fetch(`${base}/api/recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tles: sampleTles }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/recordings/:id/frames + stop", () => {
  test("append two frames then stop; meta has frameCount=2, complete=true", async () => {
    const { id } = await createRecording();
    await appendFrame(id, 1000);
    await appendFrame(id, 2000);

    const stopRes = await fetch(`${base}/api/recordings/${id}/stop`, { method: "POST" });
    expect(stopRes.status).toBe(200);
    const meta = await stopRes.json();

    expect(meta.frameCount).toBe(2);
    expect(meta.complete).toBe(true);
    expect(typeof meta.endTime).toBe("number");
  });
});

describe("GET /api/recordings", () => {
  test("list returns recently-created recording", async () => {
    const { id } = await createRecording("list-test");

    const res = await fetch(`${base}/api/recordings`);
    expect(res.status).toBe(200);
    const list = await res.json();

    expect(Array.isArray(list)).toBe(true);
    const found = list.find((m: { id: string }) => m.id === id);
    expect(found).toBeDefined();
    expect(found.name).toBe("list-test");
  });

  test("returns empty array when no recordings exist", async () => {
    const res = await fetch(`${base}/api/recordings`);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toEqual([]);
  });
});

describe("GET /api/recordings/:id/frames", () => {
  test("streams two NDJSON lines after two appends", async () => {
    const { id } = await createRecording();
    await appendFrame(id, 1000);
    await appendFrame(id, 2000);

    const res = await fetch(`${base}/api/recordings/${id}/frames`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(2);

    expect(JSON.parse(lines[0]).t).toBe(1000);
    expect(JSON.parse(lines[1]).t).toBe(2000);
  });

  test("returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/recordings/does-not-exist/frames`);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/recordings/:id", () => {
  test("removes directory; subsequent list excludes it", async () => {
    const { id } = await createRecording("delete-me");

    const delRes = await fetch(`${base}/api/recordings/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    const dirExists = await Bun.file(join(tmpDir, id, "meta.json")).exists();
    expect(dirExists).toBe(false);

    const listRes = await fetch(`${base}/api/recordings`);
    const list = await listRes.json();
    expect(list.find((m: { id: string }) => m.id === id)).toBeUndefined();
  });
});

describe("6-hour watchdog via _testOnlyFireFinalize", () => {
  test("sets endTime, leaves complete=false, counts frames", async () => {
    const { id } = await createRecording("watchdog-test");
    await appendFrame(id, 1000);

    // Fire the finalize logic immediately instead of waiting 6h
    await _testOnlyFireFinalize(id);

    const metaText = await Bun.file(join(tmpDir, id, "meta.json")).text();
    const meta = JSON.parse(metaText);

    expect(typeof meta.endTime).toBe("number");
    // Watchdog leaves complete=false (plan §2.3)
    expect(meta.complete).toBe(false);
    expect(meta.frameCount).toBe(1);
  });
});
