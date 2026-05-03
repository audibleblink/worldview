/**
 * Recording API - Fetch wrapper for recording endpoints
 */

import type { BBox, TLERecord, RecordingMeta, Frame } from "./types";
import { PROXY_BASE_URL } from "../config";

const BASE = `${PROXY_BASE_URL}/api/recordings`;

export async function createRecording(
  bbox: BBox,
  tles: TLERecord[],
  cameraAltitude?: number,
  name?: string,
): Promise<{ id: string }> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox, tles, cameraAltitude, name }),
  });
  if (!res.ok) throw new Error(`createRecording failed: ${res.status}`);
  return res.json();
}

export async function appendFrame(id: string, frame: Frame): Promise<void> {
  const res = await fetch(`${BASE}/${id}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(frame),
  });
  if (!res.ok) throw new Error(`appendFrame failed: ${res.status}`);
}

export async function stopRecording(id: string): Promise<RecordingMeta> {
  const res = await fetch(`${BASE}/${id}/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`stopRecording failed: ${res.status}`);
  return res.json();
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`listRecordings failed: ${res.status}`);
  return res.json();
}

export async function fetchFrames(id: string): Promise<Frame[]> {
  const res = await fetch(`${BASE}/${id}/frames`);
  if (!res.ok) throw new Error(`fetchFrames failed: ${res.status}`);
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Frame);
}

export async function deleteRecording(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteRecording failed: ${res.status}`);
}
