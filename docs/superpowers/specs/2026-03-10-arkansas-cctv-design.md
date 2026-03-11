# Arkansas IDrive CCTV Source — Design Spec

## Overview

Add support for Arkansas IDrive traffic cameras (535 cameras) to the CCTV proxy system. Arkansas uses a token-gated HLS streaming system requiring a 3-step redirect chain to obtain signed stream URLs.

## Requirements

- Fetch camera metadata from public GeoJSON endpoint
- Provide both thumbnail images and HLS video streams
- Handle token-gated HLS URLs (fetch signed URL on demand, pass through to frontend)
- Follow existing `CameraSource` interface patterns

## Architecture

### New Components

**`src/proxy/cctv/sources/arkansas.ts`** — ArkansasSource class

```
ArkansasSource implements CameraSource
├── name: "arkansas"
├── fetchCameras() → CCTVCamera[]
│   ├── GET https://layers.idrivearkansas.com/cameras.geojson
│   ├── Filter: status === "online"
│   └── Map to CCTVCamera with media[]
│
└── getSignedHlsUrl(cameraId: string) → Promise<string>
    ├── GET hls_stream_protected URL with Referer header
    ├── Follow 302, extract Location header
    └── Return signed CDN URL
```

### Modified Components

**`src/proxy/cctv/types.ts`** — Extend CameraSource interface

```ts
interface CameraSource {
  readonly name: string;
  fetchCameras(): Promise<CCTVCamera[]>;
  getSignedHlsUrl?(cameraId: string): Promise<string>;  // Optional
}
```

**`src/proxy/cctv/manager.ts`** — Add HLS URL handler

```ts
async handleHlsUrl(cameraId: string): Promise<Response>
// Returns { url: signedHlsUrl } for frontend to consume
```

**`src/proxy/cctv/index.ts`** — Register ArkansasSource

## Data Model

Camera record example:
```ts
{
  id: "arkansas-750",
  name: "I-30 at Arkansas River Bridge",
  latitude: 34.7465,
  longitude: -92.2896,
  source: "arkansas",
  status: "live",
  media: [
    { type: "image", url: "https://layers.idrivearkansas.com/cameras/750.jpg" },
    { type: "hls", url: "https://actis.idrivearkansas.com/index.php/api/cameras/feed/750.m3u8" }
  ]
}
```

## API Flow

### Camera Discovery
```
GET https://layers.idrivearkansas.com/cameras.geojson
→ GeoJSON FeatureCollection with 535 cameras
→ Filter online, map to CCTVCamera[]
```

### Thumbnail (existing flow)
```
Frontend: GET /api/cctv/thumbnail/arkansas-750
Manager: fetch camera.media[type=image].url
→ Returns JPEG from layers.idrivearkansas.com
```

### HLS Playback (new flow)
```
Frontend: GET /api/cctv/hls/arkansas-750
Manager: find source, call getSignedHlsUrl("arkansas-750")
Source: GET token gate URL with Referer header
       → 302 redirect with signed URL in Location
Manager: return { url: "https://...?token=..." }
Frontend: feed URL to hls.js player
```

## External Dependencies

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `layers.idrivearkansas.com/cameras.geojson` | None | Camera metadata |
| `layers.idrivearkansas.com/cameras/{id}.jpg` | None | Thumbnails |
| `actis.idrivearkansas.com/.../feed/{id}.m3u8` | Referer | Token gate |
| `7212406.r.worldssl.net/...` | Token in URL | CDN streams |

Required headers for token gate:
- `Referer: https://www.idrivearkansas.com/`

## Error Handling

| Scenario | Response |
|----------|----------|
| Camera not found | 404 `{ error: "Camera not found" }` |
| Camera offline (status: disabled) | Filtered from list, or status: "offline" |
| Token fetch fails | 502 `{ error: "Failed to get stream URL" }` |
| No HLS media for camera | 400 `{ error: "Camera does not support HLS" }` |

## Testing

New test file: `test/cctv-arkansas-source.test.ts`

Test cases:
- Parses GeoJSON response correctly
- Extracts coordinates from geometry
- Filters offline cameras (status !== "online")
- Generates correct media[] array (image + hls)
- Extracts signed URL from 302 redirect
- Handles token fetch errors gracefully
- Caches camera list within TTL

## Notes

- Tokens are time-limited; frontend should request fresh URL before playing
- CDN has `Access-Control-Allow-Origin: *` so browser fetch works
- Stream is 720p H.264 at ~197 kbps
- HLS segments are ~15.5 seconds each
