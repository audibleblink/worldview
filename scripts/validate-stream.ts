#!/usr/bin/env bun
/**
 * Validate one or more stream URLs.
 *
 *   bun scripts/validate-stream.ts <url> [url ...]
 *   bun scripts/validate-stream.ts --source 511ny           # validate all from a CCTV source
 *   bun scripts/validate-stream.ts --source mdot --limit 20
 *
 * For HLS (.m3u8): GETs the playlist and confirms it parses + has segments.
 * For images / mp4 / generic: HEAD (falls back to GET range) and checks status.
 */

const TIMEOUT_MS = 8000;

type Result = { url: string; ok: boolean; status: number | string; detail: string; ms: number };

async function probe(url: string): Promise<Result> {
  const t0 = Date.now();
  const ctl = AbortSignal.timeout(TIMEOUT_MS);
  const isHls = /\.m3u8(\?|$)/i.test(url);

  try {
    const res = await fetch(url, { signal: ctl, redirect: "follow" });
    const ms = Date.now() - t0;
    if (!res.ok) return { url, ok: false, status: res.status, detail: res.statusText, ms };

    if (isHls) {
      const text = await res.text();
      if (!text.startsWith("#EXTM3U")) return { url, ok: false, status: res.status, detail: "not an HLS playlist", ms };
      const segments = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      const variants = (text.match(/#EXT-X-STREAM-INF/g) || []).length;
      return {
        url, ok: segments.length > 0, status: res.status,
        detail: variants ? `master: ${variants} variants` : `media: ${segments.length} segments`,
        ms,
      };
    }

    const len = res.headers.get("content-length");
    const ct = res.headers.get("content-type") || "?";
    return { url, ok: true, status: res.status, detail: `${ct}${len ? ` ${len}b` : ""}`, ms };
  } catch (e) {
    return { url, ok: false, status: "ERR", detail: (e as Error).message, ms: Date.now() - t0 };
  }
}

async function urlsFromSource(source: string, limit: number): Promise<string[]> {
  const { cctvProxyManager } = await import("../src/server/routes/cctv/index.ts");
  await cctvProxyManager.initialize();
  const cams = await cctvProxyManager.fetchAllCameras(source);
  return cams
    .flatMap((c) => c.media.filter((m) => m.type === "hls").map((m) => m.url))
    .slice(0, limit);
}

const args = Bun.argv.slice(2);
let urls: string[] = [];
const sourceIdx = args.indexOf("--source");
if (sourceIdx >= 0) {
  const source = args[sourceIdx + 1]!;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 50;
  urls = await urlsFromSource(source, limit);
  console.log(`Validating ${urls.length} HLS URLs from source "${source}"\n`);
} else {
  urls = args.filter((a) => a.startsWith("http"));
  if (!urls.length) {
    console.error("usage: bun scripts/validate-stream.ts <url> | --source <name> [--limit N]");
    process.exit(1);
  }
}

const results = await Promise.all(urls.map(probe));
const pass = results.filter((r) => r.ok).length;

for (const r of results) {
  const tag = r.ok ? "\x1b[32mOK \x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag} [${String(r.status).padEnd(3)}] ${String(r.ms).padStart(4)}ms  ${r.detail.padEnd(28)}  ${r.url}`);
}
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
