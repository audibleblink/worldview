# PRD: NY511 Camera Integration

## Overview

Add New York State 511 traffic cameras to WorldView's existing CCTV/ground feeds layer. This integrates ~1,829 active cameras from the NY511 system alongside the existing Austin and Caltrans camera sources.

## Background

WorldView currently supports traffic cameras from two sources:
- **Austin Traffic Cameras** - Texas DOT cameras via `data.austintexas.gov` API
- **Caltrans Cameras** - California DOT cameras via `cwwp2.dot.ca.gov` API

These cameras are managed by `CCTVManager` and displayed as:
1. Map markers (green camera icons)
2. Thumbnail grid in the left panel (`CCTVPanel`)
3. 3D billboard projections in the Cesium scene
4. Center-stage modal for focused viewing

## Goals

1. Add NY511 cameras as a merged source (no separate source filter)
2. Maintain consistent UX with existing camera behavior
3. Support video streams for center-stage mode where available
4. Exclude disabled/blocked cameras

## Data Source

### Source File
- **Location**: `src/data/511ny.json`
- **Total cameras**: 2,920
- **Active cameras** (Disabled=false): ~1,829
- **With video streams**: ~1,754

### Camera Schema (from 511NY API)
```typescript
interface NY511Camera {
  Latitude: number;           // -90 to 90
  Longitude: number;          // -180 to 180
  ID: string;                 // e.g., "NYSDOT-1", "Skyline-12403"
  Name: string;               // Location description
  DirectionOfTravel: string;  // "Northbound", "Eastbound", "Unknown", etc.
  RoadwayName: string;        // e.g., "I-87 - NYS Thruway"
  Url: string;                // Static image URL (e.g., "https://511ny.org/map/Cctv/123")
  VideoUrl: string | null;    // HLS stream URL (e.g., "https://s51.nysdot.skyvdn.com/.../playlist.m3u8")
  Disabled: boolean;          // Exclude if true
  Blocked: boolean;           // Exclude if true
}
```

### Internal Camera ID Format
- **Prefix**: `ny511-{original_ID}`
- **Examples**: `ny511-NYSDOT-1`, `ny511-Skyline-12403`

## Requirements

### Functional Requirements

#### FR-1: Load NY511 Camera Data
- Load cameras from `src/data/511ny.json` at startup
- Filter out cameras where `Disabled === true` OR `Blocked === true`
- Filter out cameras with invalid coordinates (Lat/Long = 0)
- Transform to internal `Camera` type with `ny511-` prefix

#### FR-2: Merge with Existing Camera Sources
- NY511 cameras appear in the same camera pool as Austin/Caltrans
- No separate source filter - all cameras merged into unified feed
- Viewport-based filtering applies (only show cameras in current bbox)

#### FR-3: Thumbnail Display
- Use `Url` field for static thumbnail images
- Proxy thumbnails through backend to avoid CORS issues
- Cache thumbnails with existing TTL strategy (1 second)
- 30-second refresh interval (matches existing behavior)

#### FR-4: Billboard Projection
- Static images for 3D billboard projections (matches existing)
- Same refresh rate as other camera sources (30 seconds)

#### FR-5: Center-Stage Video Support
- When `VideoUrl` is available and not null, use HLS video stream
- Fall back to static image refresh if video unavailable
- HLS streams use `.m3u8` playlist format (e.g., Skyline cameras)

#### FR-6: Camera Metadata Display
- Show `Name` as camera title
- Show `RoadwayName` as subtitle/location
- Show `DirectionOfTravel` if available and not "Unknown"

### Non-Functional Requirements

#### NFR-1: Performance
- Lazy load camera data (only when ground layer activates)
- 1-hour cache TTL for camera list (positions rarely change)
- Max 2 concurrent thumbnail requests (matches existing)

#### NFR-2: Error Handling
- Graceful degradation if JSON file missing/corrupt
- Mark cameras as offline if thumbnail fetch fails
- Use existing offline frame generation (static noise pattern)

## Technical Design

### Backend Changes (`src/proxy/cctv.ts`)

1. **Add NY511 source support**
   - Load and parse `src/data/511ny.json`
   - Transform to `CCTVCamera` interface
   - Add `source: "ny511"` identifier

2. **Thumbnail proxying**
   - Route: `/api/cctv/thumbnail/ny511-{id}`
   - Fetch from `https://511ny.org/map/Cctv/{cctv_num}` (extract from Url)
   - Apply existing caching/retry logic

3. **Video stream proxying** (for center-stage)
   - Route: `/api/cctv/stream/ny511-{id}`
   - Return HLS playlist URL for client-side playback
   - OR proxy the HLS stream if CORS issues arise

### Frontend Changes

1. **CCTVManager** (`src/ground/cctv/CCTVManager.ts`)
   - No changes needed - works with any camera source

2. **CCTVPanel** (`src/ground/cctv/CCTVPanel.ts`)
   - Display additional metadata (RoadwayName, DirectionOfTravel)

3. **Center-Stage Mode**
   - Detect if camera has video stream
   - Use HLS.js or native HLS support for video playback
   - Fallback to static image refresh

### Data Flow

```
┌─────────────────┐
│  511ny.json     │
│  (static file)  │
└────────┬────────┘
         │ startup
         ▼
┌─────────────────┐
│  CCTVProxy      │
│  Manager        │
│  (ny511 source) │
└────────┬────────┘
         │ /api/cctv/cameras
         ▼
┌─────────────────┐     ┌─────────────────┐
│  CCTVManager    │────▶│  CCTVPanel      │
│  (frontend)     │     │  (thumbnails)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Map Markers    │     │  Center-Stage   │
│  (billboard)    │     │  (HLS video)    │
└─────────────────┘     └─────────────────┘
```

## Implementation Phases

### Phase 1: Backend Integration
- Load 511ny.json and expose via existing `/api/cctv/cameras` endpoint
- Implement thumbnail proxying for NY511 URLs
- Filter disabled/blocked cameras

### Phase 2: Frontend Display
- Verify NY511 cameras display correctly on map
- Update metadata display for camera details
- Test thumbnail refresh behavior

### Phase 3: Video Streaming
- Integrate HLS.js for center-stage video playback
- Implement fallback to static images
- Handle stream errors gracefully

## Testing Strategy

1. **Unit Tests**
   - JSON parsing and filtering logic
   - Camera ID transformation
   - Coordinate validation

2. **Integration Tests**
   - Proxy thumbnail fetching
   - API endpoint returns merged camera list
   - Viewport filtering includes NY511 cameras

3. **Manual Testing**
   - Zoom to NYC/NY State area
   - Verify cameras appear on map
   - Test thumbnail display in panel
   - Test center-stage with video-enabled cameras
   - Test fallback for cameras without video

## Out of Scope

- Live API fetching (using static JSON file)
- Separate source filter for NY511 cameras
- Region-based filtering within NY State
- Real-time camera status polling

## Dependencies

- HLS.js library for video playback (if not natively supported)
- Existing `CCTVProxyManager` infrastructure
- Existing `CCTVManager` and `CCTVPanel` components

## Success Metrics

- NY511 cameras visible in NYC/NY State areas
- Thumbnails load reliably with <2s latency
- Video streams play in center-stage mode
- No regression in Austin/Caltrans camera functionality

## Open Questions

None - all requirements clarified.

---

**Reminder**: Start a new session with `/new` before creating the execution plan.
