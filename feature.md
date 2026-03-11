## IDrive Arkansas CCTV Stream — Technical Summary for Agent

### Overview
The site exposes **535 live traffic cameras** across Arkansas via a token-gated HLS streaming system. All camera metadata is publicly available via GeoJSON. Streams require a fresh signed token per session.

---

### Camera Discovery

**GeoJSON endpoint (no auth required):**
```
GET https://layers.idrivearkansas.com/cameras.geojson
```
Returns a GeoJSON FeatureCollection. Each feature's `properties` contains:
```json
{
  "id": 750,
  "name": "I-30 at Arkansas River Bridge",
  "status": "online",
  "hls_stream_protected": "https://actis.idrivearkansas.com/index.php/api/cameras/feed/750.m3u8",
  "camera_type_name": "Traffic"
}
```
The `hls_stream_protected` field is the **token gate URL** — use this as the entry point per camera.

---

### Stream Flow (3-step redirect chain)

**Step 1 — Hit the token gate:**
```
GET https://actis.idrivearkansas.com/index.php/api/cameras/feed/{id}.m3u8
```
- Returns **HTTP 302** with a `Location` header pointing to a signed Wowza CDN URL
- The signed token is in the query string: `?token=<sha256_hex>`
- Required headers (set by the site):
  - `Origin: https://www.idrivearkansas.com`
  - `Referer: https://www.idrivearkansas.com/`
- Token is **time-limited** — fetch fresh per session, do not cache

**Step 2 — Fetch master playlist:**
```
GET https://7212406.r.worldssl.net/7212406/_definst_/idrive_{id}_base.stream/playlist.m3u8?token=<token>
```
Response is an HLS master playlist:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=196606,CODECS="avc1.100.41",RESOLUTION=1280x720
chunklist_w{session_id}.m3u8?token=<token>
```
- Single quality level: **720p H.264, ~197 kbps**
- Server: **Wowza FlashCom/3.5.7**

**Step 3 — Poll chunklist (live sliding window):**
```
GET https://7212406.r.worldssl.net/7212406/_definst_/idrive_{id}_base.stream/chunklist_w{session_id}.m3u8?token=<token>
```
Response:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-ALLOW-CACHE:NO
#EXT-X-TARGETDURATION:16
#EXT-X-MEDIA-SEQUENCE:1352
#EXTINF:15.5,
media-{stream_id}_w{session_id}_1352.ts?token=<token>
#EXTINF:15.5,
media-{stream_id}_w{session_id}_1353.ts?token=<token>
#EXTINF:15.5,
media-{stream_id}_w{session_id}_1354.ts?token=<token>
```
- **3 segments** in window, each ~15.5 seconds
- **Must re-poll** this URL every ~15s to get new segment URLs
- `#EXT-X-ALLOW-CACHE:NO` — do not cache segments

**Step 4 — Fetch MPEG-TS segments:**
```
GET https://7212406.r.worldssl.net/7212406/_definst_/idrive_{id}_base.stream/media-{stream_id}_w{session_id}_{seq}.ts?token=<token>
```
- `Content-Type: video/MP2T`
- Size: ~230–415 KB per segment
- `Cache-Control: max-age=3600`

---

### Thumbnail / Still Image
```
GET https://actis.idrivearkansas.com/index.php/api/cameras/image?camera={id}
→ 302 → https://layers.idrivearkansas.com/cameras/{id}.jpg
```
No auth required on the final `.jpg` URL. Served via CloudFront, refreshes periodically.

---

### Key Implementation Notes

1. **Token is per-session, not per-camera** — one call to the token gate gives you a token valid for that stream session. Tokens appear to be SHA256-based and time-bound.
2. **No credentials needed for the CDN** — `withCredentials` is only set if the URL contains `wowza` (legacy path). The current CDN (`worldssl.net`) does not require it.
3. **CORS** — The CDN responds with `Access-Control-Allow-Origin: *`, so browser-based fetching works fine.
4. **Stream naming pattern** — `idrive_{camera_id}_base.stream` is consistent across all cameras.
5. **Player used by the site** — [Clappr.js](https://github.com/clappr/clappr) with hls.js under the hood. Any HLS-capable player (hls.js, Video.js, ffmpeg, VLC) will work once you have the signed playlist URL.
6. **Offline cameras** — `status` field in GeoJSON will be `"disabled"` instead of `"online"`. The token gate still redirects but the stream will be empty/error.

---

### Minimal Pseudocode
```python
# 1. Get all cameras
cameras = GET("https://layers.idrivearkansas.com/cameras.geojson").features

# 2. For each camera you want to play:
camera = cameras[0]  # e.g. id=750

# 3. Get signed stream URL (follow redirect, don't fetch body)
response = GET(camera.properties.hls_stream_protected, 
               headers={"Referer": "https://www.idrivearkansas.com/"},
               allow_redirects=False)
signed_master_url = response.headers["Location"]  # the ?token=... URL

# 4. Feed signed_master_url into any HLS player or parse manually:
#    - Fetch master playlist → extract chunklist URL
#    - Poll chunklist every ~15s → extract .ts segment URLs
#    - Fetch and decode .ts segments (H.264/MPEG-TS)

# 5. For thumbnail:
thumb_url = f"https://layers.idrivearkansas.com/cameras/{camera.properties.id}.jpg"
```
