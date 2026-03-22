# Arkansas HLS Relay Proxy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proxy Arkansas HLS streams (playlist + segments) through the server so HLS.js can fetch them without CORS errors.

**Architecture:** Add a new `/api/cctv/hls-relay/:id` route to the proxy server. When hit, it resolves the signed `worldssl.net` URL server-side, fetches the `.m3u8` manifest, rewrites all relative segment URLs to point back through a `/api/cctv/hls-relay/:id/*` relay path, and streams the content back with CORS headers. Subsequent HLS.js requests for `.ts` segments hit the same relay route and are proxied transparently. The frontend changes from passing the raw signed URL to HLS.js to passing the relay URL instead.

**Tech Stack:** Bun server (TypeScript), HLS.js (browser), SolidJS (frontend), bun:test

---

## Chunk 1: Server — HLS relay route handler

### Task 1: Add `handleHlsRelay` to `CCTVProxyManager`

**Files:**
- Modify: `src/server/routes/cctv/manager.ts` (add `handleHlsRelay` method)
- Modify: `src/__tests__/cctv-manager.test.ts` (add relay tests)

**Context:** `CCTVProxyManager` already has `handleHlsUrl` which returns the signed URL as JSON. We need a new method `handleHlsRelay(cameraId: string, relayPath: string, req: Request)` that:

1. If `relayPath` is empty / `playlist.m3u8` — resolve the signed URL via `source.getSignedHlsUrl(cameraId)`, fetch the manifest from `worldssl.net`, rewrite relative segment URLs in the `.m3u8` text to point to `/api/cctv/hls-relay/:id/<segment>`, and return the rewritten manifest with `Content-Type: application/vnd.apple.mpegurl` and CORS headers.
2. If `relayPath` is a `.ts` segment or other file — build the upstream URL by replacing the `playlist.m3u8` filename in the signed base URL with the segment path, fetch it server-side, stream it back with CORS headers.

**Important implementation detail:** The signed URL from `worldssl.net` looks like:
```
https://7212406.r.worldssl.net/rtplive/R11_272/playlist.m3u8?token=abc123&...
```
The base CDN URL for segments is the same host + path prefix — just swap the filename. Extract it like:
```ts
const signedUrl = await source.getSignedHlsUrl(cameraId);
const signedUrlObj = new URL(signedUrl);
const basePath = signedUrlObj.pathname.replace(/[^/]+\.m3u8$/, ""); // e.g. /rtplive/R11_272/
const segmentUrl = new URL(basePath + relayPath + signedUrlObj.search, signedUrlObj.origin).toString();
```

**M3U8 rewriting:** In the manifest text, lines that don't start with `#` are segment file references. Replace each bare filename with its proxied path:
```ts
const proxyBase = `/api/cctv/hls-relay/${encodeURIComponent(cameraId)}/`;
const rewritten = manifestText.split("\n").map(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    // Could be "media_xxx.ts" or a relative path
    return proxyBase + trimmed;
  }
  return line;
}).join("\n");
```

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/cctv-manager.test.ts`:

```ts
describe("CCTVProxyManager HLS Relay", () => {
  function makeHlsSource(signedUrl: string): CameraSource {
    return {
      name: "arkansas",
      fetchCameras: async () => [
        makeCamera({
          id: "arkansas-99",
          source: "arkansas",
          media: [{ type: "hls", url: "https://actis.idrivearkansas.com/feed/99.m3u8" }],
        }),
      ],
      getSignedHlsUrl: async (_id: string) => signedUrl,
    };
  }

  test("handleHlsRelay returns rewritten manifest with proxied segment URLs", async () => {
    const manager = new CCTVProxyManager();
    const signedUrl = "https://cdn.example.com/rtplive/CAM1/playlist.m3u8?token=abc";
    manager.register(makeHlsSource(signedUrl));
    await manager.initialize();

    const rawManifest = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXTINF:2.0,",
      "media_w123_001.ts",
      "#EXTINF:2.0,",
      "media_w123_002.ts",
      "#EXT-X-ENDLIST",
    ].join("\n");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(rawManifest, {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl" },
      }))
    ) as typeof fetch;

    try {
      const response = await manager.handleHlsRelay("arkansas-99", "playlist.m3u8", new Request("http://localhost/"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("mpegurl");
      const body = await response.text();
      expect(body).toContain("/api/cctv/hls-relay/arkansas-99/media_w123_001.ts");
      expect(body).toContain("/api/cctv/hls-relay/arkansas-99/media_w123_002.ts");
      expect(body).not.toContain("media_w123_001.ts\n"); // bare filename gone
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handleHlsRelay proxies .ts segments with correct URL construction", async () => {
    const manager = new CCTVProxyManager();
    const signedUrl = "https://cdn.example.com/rtplive/CAM1/playlist.m3u8?token=abc";
    manager.register(makeHlsSource(signedUrl));
    await manager.initialize();

    let fetchedUrl = "";
    const fakeSegmentData = new Uint8Array([0x47, 0x00, 0x00]); // MPEG-TS sync byte
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string | URL | Request) => {
      fetchedUrl = url.toString();
      return Promise.resolve(new Response(fakeSegmentData, {
        status: 200,
        headers: { "Content-Type": "video/MP2T" },
      }));
    }) as typeof fetch;

    try {
      const response = await manager.handleHlsRelay("arkansas-99", "media_w123_001.ts", new Request("http://localhost/"));
      expect(response.status).toBe(200);
      expect(fetchedUrl).toBe("https://cdn.example.com/rtplive/CAM1/media_w123_001.ts?token=abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handleHlsRelay returns 404 for unknown camera", async () => {
    const manager = new CCTVProxyManager();
    await manager.initialize();
    const response = await manager.handleHlsRelay("arkansas-999", "playlist.m3u8", new Request("http://localhost/"));
    expect(response.status).toBe(404);
  });

  test("handleHlsRelay returns 400 for source without getSignedHlsUrl", async () => {
    const manager = new CCTVProxyManager();
    manager.register(fakeSource("notoken", []));
    await manager.initialize();
    const response = await manager.handleHlsRelay("notoken-1", "playlist.m3u8", new Request("http://localhost/"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/__tests__/cctv-manager.test.ts --test-name-pattern "HLS Relay"
```

Expected: 4 failures — `manager.handleHlsRelay is not a function`

- [ ] **Step 3: Implement `handleHlsRelay` in manager**

Add this method to `CCTVProxyManager` in `src/server/routes/cctv/manager.ts`, after `handleHlsUrl`:

```ts
/** Handle GET /api/cctv/hls-relay/:id/:path - Proxy HLS stream server-side (avoids CORS) */
async handleHlsRelay(cameraId: string, relayPath: string, _req: Request): Promise<Response> {
  const dashIndex = cameraId.indexOf("-");
  if (dashIndex === -1) {
    return errorResponse("Invalid camera ID format", 400);
  }
  const sourceName = cameraId.slice(0, dashIndex);
  const source = this.sourceMap.get(sourceName);
  if (!source) {
    return errorResponse(`Unknown source: ${sourceName}`, 404);
  }
  if (!source.getSignedHlsUrl) {
    return errorResponse("Source does not support signed HLS URLs", 400);
  }

  try {
    const signedUrl = await source.getSignedHlsUrl(cameraId);
    const signedUrlObj = new URL(signedUrl);

    // Strip the playlist filename to get base path (e.g. /rtplive/CAM1/)
    const basePath = signedUrlObj.pathname.replace(/[^/]+$/, "");
    const upstreamUrl = new URL(basePath + relayPath + signedUrlObj.search, signedUrlObj.origin).toString();

    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!upstream.ok) {
      return errorResponse(`Upstream error: ${upstream.status}`, 502);
    }

    const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";

    // For HLS manifests, rewrite relative segment URLs to go through this relay
    if (contentType.includes("mpegurl") || relayPath.endsWith(".m3u8")) {
      const manifestText = await upstream.text();
      const proxyBase = `/api/cctv/hls-relay/${encodeURIComponent(cameraId)}/`;
      const rewritten = manifestText
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          // Non-comment, non-empty lines are segment/playlist references
          if (trimmed && !trimmed.startsWith("#")) {
            return proxyBase + trimmed;
          }
          return line;
        })
        .join("\n");
      return new Response(rewritten, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache",
        },
      });
    }

    // For segments and other binary content, stream through
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error(`[CCTV] HLS relay error for ${cameraId}/${relayPath}:`, error);
    return errorResponse("HLS relay error", 502);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/__tests__/cctv-manager.test.ts --test-name-pattern "HLS Relay"
```

Expected: 4 passing

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
bun test src/__tests__/cctv-manager.test.ts
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/cctv/manager.ts src/__tests__/cctv-manager.test.ts
git commit -m "feat: add HLS relay proxy handler to CCTVProxyManager"
```

---

## Chunk 2: Server — Wire relay route in server/index.ts and cctv.ts

### Task 2: Expose the relay route

**Files:**
- Modify: `src/server/routes/cctv.ts` (add `handleHlsRelay` export)
- Modify: `src/server/index.ts` (add `/api/cctv/hls-relay/` dynamic route)

**Context:** The pattern for dynamic routes in `src/server/index.ts` is in `handleDynamicRoutes`. The route pattern is `/api/cctv/hls-relay/:id/:path` where `:id` can contain hyphens and `:path` can contain `.` and `-`. The path after the camera ID starts with the next `/`.

Example: `/api/cctv/hls-relay/arkansas-123/media_w703955845_14033.ts`

- [ ] **Step 1: Add `handleHlsRelay` export to cctv.ts**

Open `src/server/routes/cctv.ts`. The file already exports `handleStream` and `handleHlsUrl`. Add an analogous export:

```ts
/** Handle GET /api/cctv/hls-relay/:id/:path - Proxy HLS content server-side */
export async function handleHlsRelay(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Path format: /api/cctv/hls-relay/:id/:relayPath
  // :id contains exactly one hyphen prefix (e.g. "arkansas-123")
  // :relayPath is everything after the second slash following the prefix
  const match = url.pathname.match(/^\/api\/cctv\/hls-relay\/([^/]+)\/(.+)$/);
  if (!match) {
    return new Response(JSON.stringify({ error: "Invalid relay URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const cameraId = decodeURIComponent(match[1]!);
  const relayPath = match[2]!;
  return cctvProxyManager.handleHlsRelay(cameraId, relayPath, req);
}
```

Read the current `src/server/routes/cctv.ts` first to understand the existing pattern before editing.

- [ ] **Step 2: Register the route in server/index.ts**

In `handleDynamicRoutes`, add after the existing `hls` route block:

```ts
// CCTV HLS relay: /api/cctv/hls-relay/:id/:path
if (path.startsWith("/api/cctv/hls-relay/")) {
  return applyMiddleware(handleHlsRelay)(req);
}
```

Import `handleHlsRelay` at the top alongside the other cctv imports.

- [ ] **Step 3: Verify server starts without errors**

```bash
bun src/server/index.ts &
sleep 2
curl -s http://localhost:3001/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/cctv.ts src/server/index.ts
git commit -m "feat: expose /api/cctv/hls-relay route in server"
```

---

## Chunk 3: Frontend — Use relay URL instead of direct signed URL

### Task 3: Update CCTVPanel to use the relay endpoint

**Files:**
- Modify: `src/ui/panels/CCTVPanel.tsx` (replace direct signed URL with relay URL)
- Modify: `src/config.ts` (add `cctvHlsRelay` endpoint helper)

**Context:** Currently, `CCTVPanel.tsx` lines 76–87 fetch the signed URL from `/api/cctv/hls/:id` and pass it directly to HLS.js. Instead, we should give HLS.js a relay URL that the server understands — no need to even tell the browser the signed URL exists.

The relay URL format is: `${PROXY_BASE_URL}/api/cctv/hls-relay/${encodeURIComponent(cameraId)}/playlist.m3u8`

HLS.js will then request segments like `.../hls-relay/arkansas-123/media_xxx.ts` which the server proxies transparently.

- [ ] **Step 1: Add relay URL builder to config.ts**

In `src/config.ts`, add to `PROXY_ENDPOINTS`:

```ts
/** CCTV HLS relay URL (server-side proxy for CORS-blocked streams) */
cctvHlsRelay: (id: string) => `${PROXY_BASE_URL}/api/cctv/hls-relay/${encodeURIComponent(id)}/playlist.m3u8`,
```

- [ ] **Step 2: Update CCTVPanel to use the relay URL**

In `src/ui/panels/CCTVPanel.tsx`, replace the token-gated fetch block (lines 72–90):

```ts
// Before (fetches signed URL and passes it directly - CORS blocked)
if (tokenGatedSources.includes(sourcePrefix ?? "")) {
  fetch(PROXY_ENDPOINTS.cctvHlsUrl(cameraId))
    .then((res) => res.json())
    .then((data: { url?: string }) => {
      if (data.url) {
        startHls(data.url);
      } else {
        console.warn("[CCTVPanel] No signed HLS URL returned for", cameraId);
      }
    })
    .catch((err) => console.error("[CCTVPanel] Failed to resolve HLS URL:", err));
} else {
  startHls(hlsMedia.url);
}
```

Replace with:

```ts
// After (relay URL - server proxies the stream, no CORS issue)
if (tokenGatedSources.includes(sourcePrefix ?? "")) {
  startHls(PROXY_ENDPOINTS.cctvHlsRelay(cameraId));
} else {
  startHls(hlsMedia.url);
}
```

This eliminates the async fetch entirely — HLS.js hits the relay endpoint directly.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
bun test src/__tests__/
```

Expected: all tests pass. TypeScript errors in `config.ts`/`CCTVPanel.tsx` will also surface when the dev server starts in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/ui/panels/CCTVPanel.tsx
git commit -m "feat: use HLS relay proxy URL for Arkansas streams in CCTVPanel"
```

---

## Chunk 4: Manual smoke test

### Task 4: End-to-end verification in browser

**No code changes in this task — verification only.**

- [ ] **Step 1: Start server and dev server**

In two terminals:
```bash
# Terminal 1 - proxy
bun src/server/index.ts

# Terminal 2 - dev server  
bun src/server.ts
```

- [ ] **Step 2: Navigate to Bentonville, AR**

Open `http://localhost:3000` in browser. Use the command bar to navigate to `Bentonville, AR`. Cameras should load in the left panel.

- [ ] **Step 3: Click an Arkansas camera**

Click any camera in the list. The CCTV panel should open.

- [ ] **Step 4: Verify no CORS errors in browser console**

Open DevTools → Console. Confirm:
- No `Access to XMLHttpRequest...blocked by CORS` errors
- No `net::ERR_ABORTED` on `.m3u8` or `.ts` files
- Video plays (or shows a loading state while buffering)

- [ ] **Step 5: Check server logs**

In the proxy terminal, confirm you see requests like:
```
GET /api/cctv/hls-relay/arkansas-xxx/playlist.m3u8
GET /api/cctv/hls-relay/arkansas-xxx/media_w703955845_XXXX.ts
```

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve CORS issue for Arkansas HLS streams via relay proxy"
```
