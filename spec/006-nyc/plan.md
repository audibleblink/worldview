# Execution Plan: NY511 Camera Integration

> Generated from PRD: NY511 Camera Integration  
> Plan Created: 2026-03-09

---

## Overview

This execution plan integrates ~1,829 NY511 traffic cameras into WorldView's existing CCTV infrastructure. The implementation is organized into 5 phases, each leaving a complete, tested component.

---

## Phase Dependencies

```
Phase 1 (Backend Data Loading)
    ↓
Phase 2 (Thumbnail Proxying)
    ↓
Phase 3 (Frontend Display & Metadata)
    ↓
Phase 4 (HLS Video Streaming)
    ↓
Phase 5 (Integration & Regression Testing)
```

- **Phase 1**: No dependencies (foundation)
- **Phase 2**: Depends on Phase 1 (cameras must be loaded)
- **Phase 3**: Depends on Phase 2 (thumbnails must work)
- **Phase 4**: Depends on Phase 3 (center-stage must work)
- **Phase 5**: Depends on Phases 1-4

---

## Phase 1: Backend Data Loading & API Integration

**Goal**: Load NY511 cameras from JSON and expose via existing `/api/cctv/cameras` endpoint.

**Dependencies**: None (this is the foundation)

### Tasks

- [x] **1.1** Add `NY511CameraData` interface to `src/proxy/cctv.ts`
  - Match schema from PRD: `ID`, `Name`, `Latitude`, `Longitude`, `Url`, `VideoUrl`, `Disabled`, `Blocked`, `RoadwayName`, `DirectionOfTravel`

- [x] **1.2** Extend `CCTVCamera.source` type to include `"ny511"`
  - Update type: `source: "austin" | "caltrans" | "ny511"`

- [x] **1.3** Implement `loadNY511Cameras()` function
  - Load from `src/data/511ny.json` using `Bun.file()`
  - Filter: exclude `Disabled === true` OR `Blocked === true`
  - Filter: exclude cameras with `Latitude === 0` OR `Longitude === 0`
  - Transform to `CCTVCamera` with `id: "ny511-{original_ID}"`
  - Cache with 1-hour TTL (positions rarely change)

- [x] **1.4** Integrate NY511 into `getAllCameras()` function
  - Merge NY511 cameras with Austin and Caltrans results
  - Ensure bbox filtering applies correctly

- [x] **1.5** Write unit tests for NY511 data loading
  - Test JSON parsing
  - Test disabled/blocked filtering
  - Test coordinate validation (exclude 0,0)
  - Test ID transformation (prefix with `ny511-`)

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/proxy/cctv.ts` | Modify: add NY511 types, loading, merging |
| `test/cctv-ny511.test.ts` | Create: unit tests for NY511 loading |

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# test-phase1.sh - Verify Phase 1 completion

echo "=== Phase 1 Verification ==="

# 1. Run unit tests
echo "Running unit tests..."
bun test test/cctv-ny511.test.ts
if [ $? -ne 0 ]; then
  echo "FAIL: Unit tests failed"
  exit 1
fi

# 2. Start server and check API
echo "Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# 3. Check cameras endpoint includes NY511
echo "Checking /api/cctv/cameras for NY511..."
RESPONSE=$(curl -s "http://localhost:3000/api/cctv/cameras")
NY511_COUNT=$(echo "$RESPONSE" | jq '[.[] | select(.source == "ny511")] | length')

if [ "$NY511_COUNT" -gt 1500 ]; then
  echo "PASS: Found $NY511_COUNT NY511 cameras (expected ~1829)"
else
  echo "FAIL: Only found $NY511_COUNT NY511 cameras"
  kill $SERVER_PID
  exit 1
fi

# 4. Verify camera structure
echo "Verifying camera structure..."
SAMPLE=$(echo "$RESPONSE" | jq '[.[] | select(.source == "ny511")][0]')
HAS_ID=$(echo "$SAMPLE" | jq 'has("id")')
HAS_NAME=$(echo "$SAMPLE" | jq 'has("name")')
HAS_LAT=$(echo "$SAMPLE" | jq 'has("latitude")')
HAS_LON=$(echo "$SAMPLE" | jq 'has("longitude")')
ID_PREFIX=$(echo "$SAMPLE" | jq -r '.id' | grep -c "^ny511-")

if [ "$HAS_ID" = "true" ] && [ "$HAS_NAME" = "true" ] && [ "$ID_PREFIX" -eq 1 ]; then
  echo "PASS: Camera structure is correct"
else
  echo "FAIL: Camera structure invalid"
  kill $SERVER_PID
  exit 1
fi

# 5. Test bbox filtering includes NY area
echo "Testing bbox filtering for NYC area..."
NYC_BBOX="bbox=-74.3,40.4,-73.7,41.0"
NYC_RESPONSE=$(curl -s "http://localhost:3000/api/cctv/cameras?$NYC_BBOX")
NYC_COUNT=$(echo "$NYC_RESPONSE" | jq 'length')

if [ "$NYC_COUNT" -gt 50 ]; then
  echo "PASS: Found $NYC_COUNT cameras in NYC bbox"
else
  echo "FAIL: Only $NYC_COUNT cameras in NYC (expected 50+)"
  kill $SERVER_PID
  exit 1
fi

kill $SERVER_PID
echo "=== Phase 1 COMPLETE ==="
```

### Checklist

- [ ] `NY511CameraData` interface matches PRD schema
- [ ] `CCTVCamera.source` includes `"ny511"` option
- [ ] `loadNY511Cameras()` filters disabled/blocked cameras
- [ ] `loadNY511Cameras()` excludes cameras with (0,0) coordinates
- [ ] Camera IDs prefixed with `ny511-`
- [ ] `getAllCameras()` includes NY511 cameras
- [ ] Bbox filtering works correctly for NYC area
- [ ] Unit tests pass: `bun test test/cctv-ny511.test.ts`
- [ ] No regression in Austin/Caltrans cameras

### Exit Criteria

- Unit tests pass (`bun test test/cctv-ny511.test.ts`)
- API returns 1500+ NY511 cameras
- Camera IDs prefixed with `ny511-`
- Bbox filtering works for NYC area
- No regression in Austin/Caltrans cameras

---

## Phase 2: Thumbnail Proxying

**Goal**: Proxy NY511 thumbnail images through backend to avoid CORS issues.

**Dependencies**: Phase 1 (cameras must be loaded)

### Tasks

- [x] **2.1** Analyze NY511 image URL format
  - Investigated `Url` field (e.g., `https://511ny.org/map/Cctv/4435`)
  - **Finding**: URLs return images directly (PNG or JPEG), NOT HTML pages
  - Camera 4435 returns `image/png` (118KB), camera 4 returns `image/jpeg` (55KB with AXIS EXIF data)
  - No URL transformation needed; `cam.Url` is the correct image endpoint

- [x] **2.2** Update `handleThumbnail()` to support NY511 cameras
  - No changes needed: existing `handleThumbnail()` already works generically for all sources
  - It fetches from `camera.imageUrl` which is correctly set for NY511
  - Caching strategy (1-second TTL, disk cache, last-known-good) applies automatically

- [x] **2.3** Store `imageUrl` on NY511 `CCTVCamera` objects
  - `imageUrl` correctly set to `cam.Url` in `loadNY511Cameras()` (Phase 1)
  - Verified: all NY511 cameras have `imageUrl` matching `https://511ny.org/map/Cctv/{id}` pattern

- [x] **2.4** Write integration tests for thumbnail proxying
  - Created `test/cctv-thumbnail.test.ts` with 13 tests covering:
  - imageUrl validation, camera lookup, 404 for missing cameras
  - Cache key format with ny511- prefix, uniqueness
  - Offline frame generation (PNG with valid signature)
  - CORS headers, content type handling
  - Disk cache fallback with X-Stale/X-From-Disk headers
  - Source filtering

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/proxy/cctv.ts` | Modify: add NY511 thumbnail handling |
| `test/cctv-thumbnail.test.ts` | Create: thumbnail proxy tests |

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# test-phase2.sh - Verify Phase 2 completion

echo "=== Phase 2 Verification ==="

# 1. Run integration tests
echo "Running thumbnail tests..."
bun test test/cctv-thumbnail.test.ts
if [ $? -ne 0 ]; then
  echo "FAIL: Thumbnail tests failed"
  exit 1
fi

# 2. Start server
echo "Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# 3. Get a sample NY511 camera ID
CAMERA_ID=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq -r '[.[] | select(.source == "ny511")][0].id')
echo "Testing thumbnail for camera: $CAMERA_ID"

# 4. Fetch thumbnail
echo "Fetching thumbnail..."
HTTP_CODE=$(curl -s -o /tmp/ny511_thumb.jpg -w "%{http_code}" \
  "http://localhost:3000/api/cctv/thumbnail/$CAMERA_ID")

if [ "$HTTP_CODE" = "200" ]; then
  echo "PASS: Thumbnail fetch returned 200"
else
  echo "FAIL: Thumbnail fetch returned $HTTP_CODE"
  kill $SERVER_PID
  exit 1
fi

# 5. Verify it's a valid image
FILE_TYPE=$(file /tmp/ny511_thumb.jpg | grep -c "JPEG\|PNG\|image")
if [ "$FILE_TYPE" -ge 1 ]; then
  echo "PASS: Response is a valid image"
else
  echo "FAIL: Response is not a valid image"
  kill $SERVER_PID
  exit 1
fi

# 6. Test caching (second request should be faster)
echo "Testing cache behavior..."
START=$(date +%s%N)
curl -s -o /dev/null "http://localhost:3000/api/cctv/thumbnail/$CAMERA_ID"
END=$(date +%s%N)
CACHED_TIME=$((($END - $START) / 1000000))

if [ "$CACHED_TIME" -lt 100 ]; then
  echo "PASS: Cached response in ${CACHED_TIME}ms"
else
  echo "WARN: Cached response took ${CACHED_TIME}ms (expected <100ms)"
fi

# 7. Test existing camera still works (no regression)
echo "Testing Austin camera thumbnail (regression)..."
AUSTIN_ID=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq -r '[.[] | select(.source == "austin")][0].id')
AUSTIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/cctv/thumbnail/$AUSTIN_ID")

if [ "$AUSTIN_CODE" = "200" ]; then
  echo "PASS: Austin thumbnails still work"
else
  echo "FAIL: Austin thumbnail returned $AUSTIN_CODE"
  kill $SERVER_PID
  exit 1
fi

kill $SERVER_PID
echo "=== Phase 2 COMPLETE ==="
```

### Checklist

- [ ] NY511 image URL format analyzed and documented
- [ ] `handleThumbnail()` supports `ny511-` prefixed IDs
- [ ] Thumbnails fetch successfully via proxy
- [ ] Images are valid JPEG/PNG format
- [ ] Caching works (repeated requests are fast)
- [ ] Offline frame generated on fetch failure
- [ ] Austin/Caltrans thumbnails still work (no regression)
- [ ] Integration tests pass: `bun test test/cctv-thumbnail.test.ts`

### Exit Criteria

1. NY511 thumbnails fetch successfully via proxy
2. Images are valid JPEG/PNG format
3. Caching works (repeated requests are fast)
4. Offline frame generated on fetch failure
5. Austin/Caltrans thumbnails still work (no regression)

---

## Phase 3: Frontend Display & Metadata

**Goal**: Display NY511 cameras on map, in panel, and as billboards with proper metadata.

**Dependencies**: Phase 2 (thumbnails must work)

### Tasks

- [x] **3.1** Extend frontend `Camera` type for metadata
  - Add optional `roadway?: string` field
  - Add optional `direction?: string` field
  - Add optional `videoUrl?: string` field (for Phase 4)
  - Update `src/ground/cctv/types.ts`

- [x] **3.2** Update backend to include metadata in response
  - Add `roadway` from `RoadwayName`
  - Add `direction` from `DirectionOfTravel` (exclude "Unknown")
  - Add `videoUrl` field for HLS streams (Phase 4 prep)

- [x] **3.3** Update `CCTVPanel` to display additional metadata
  - Show roadway name under camera name
  - Show direction if available (e.g., "I-87 Northbound")
  - Style consistently with existing camera cards

- [x] **3.4** Verify map markers work for NY511 cameras
  - Camera icons appear at correct locations
  - Click to project creates billboard
  - Billboard displays thumbnail correctly

- [x] **3.5** Test billboard refresh behavior
  - 30-second refresh interval
  - Thumbnail updates correctly
  - No memory leaks (canvas/texture cleanup)

- [x] **3.6** Manual UI testing checklist
  - Navigate to NYC area (40.7, -74.0)
  - Verify camera markers appear
  - Click panel thumbnails to project
  - Verify center-stage mode works

### Files to Modify

| File | Action |
|------|--------|
| `src/ground/cctv/types.ts` | Modify: add metadata fields |
| `src/proxy/cctv.ts` | Modify: include metadata in response |
| `src/ground/cctv/CCTVPanel.ts` | Modify: display roadway/direction |

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# test-phase3.sh - Verify Phase 3 completion

echo "=== Phase 3 Verification ==="

# 1. Start server
echo "Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# 2. Verify metadata in API response
echo "Checking metadata fields..."
SAMPLE=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "ny511" and .roadway != null)][0]')

HAS_ROADWAY=$(echo "$SAMPLE" | jq 'has("roadway")')
HAS_DIRECTION=$(echo "$SAMPLE" | jq 'has("direction")')

if [ "$HAS_ROADWAY" = "true" ]; then
  ROADWAY=$(echo "$SAMPLE" | jq -r '.roadway')
  echo "PASS: Roadway metadata present: $ROADWAY"
else
  echo "FAIL: Roadway metadata missing"
  kill $SERVER_PID
  exit 1
fi

# 3. Count cameras with metadata
ROADWAY_COUNT=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "ny511" and .roadway != null)] | length')
echo "INFO: $ROADWAY_COUNT NY511 cameras have roadway metadata"

# 4. Verify videoUrl field exists (for Phase 4)
VIDEO_COUNT=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "ny511" and .videoUrl != null)] | length')
echo "INFO: $VIDEO_COUNT NY511 cameras have videoUrl"

if [ "$VIDEO_COUNT" -gt 1500 ]; then
  echo "PASS: Most cameras have videoUrl for Phase 4"
else
  echo "WARN: Only $VIDEO_COUNT cameras have videoUrl"
fi

# 5. Frontend build check
echo "Building frontend..."
bun build src/frontend/index.tsx --outdir dist
if [ $? -ne 0 ]; then
  echo "FAIL: Frontend build failed"
  kill $SERVER_PID
  exit 1
fi
echo "PASS: Frontend builds successfully"

kill $SERVER_PID

# 6. Manual test checklist output
echo ""
echo "=== MANUAL TESTING REQUIRED ==="
echo "Please verify the following in browser:"
echo "  [ ] Navigate to NYC (40.7128, -74.0060)"
echo "  [ ] Camera markers appear on map"
echo "  [ ] Panel shows NY511 camera thumbnails"
echo "  [ ] Thumbnails display roadway name"
echo "  [ ] Click thumbnail to project billboard"
echo "  [ ] Billboard shows correct image"
echo "  [ ] Center-stage mode opens on second click"
echo "  [ ] Close center-stage with X button"
echo "  [ ] Unproject removes billboard"
echo ""
echo "Run: bun --hot src/index.ts"
echo "Open: http://localhost:3000"
echo ""
echo "=== Phase 3 COMPLETE (pending manual verification) ==="
```

### Checklist

- [ ] `Camera` type extended with `roadway`, `direction`, `videoUrl` fields
- [ ] API includes `roadway` and `direction` fields for NY511 cameras
- [ ] API includes `videoUrl` field for cameras with HLS streams
- [ ] `CCTVPanel` displays roadway/direction metadata
- [ ] Frontend builds without errors
- [ ] Camera markers visible in NYC area
- [ ] Thumbnails load in panel
- [ ] Billboard projection works
- [ ] Center-stage mode works
- [ ] Manual verification complete

### Exit Criteria

1. API includes `roadway`, `direction`, and `videoUrl` fields
2. CCTVPanel displays roadway/direction metadata
3. Frontend builds without errors
4. Manual verification complete (cameras visible, billboards work, center-stage works)

---

## Phase 4: HLS Video Streaming

**Goal**: Enable HLS video playback in center-stage mode for cameras with `VideoUrl`.

**Dependencies**: Phase 3 (center-stage must work)

### Tasks

- [x] **4.1** Add HLS.js dependency
  - Install: `bun add hls.js`
  - Add types: `bun add -d @types/hls.js`

- [x] **4.2** Test HLS stream accessibility
  - Test if HLS streams are directly accessible from browser
  - If CORS issues, implement backend proxy for HLS playlist

- [x] **4.3** Update center-stage mode for video support
  - Detect if camera has `videoUrl` field
  - Create `<video>` element alongside canvas
  - Initialize HLS.js with stream URL
  - Show video element when playing, hide canvas

- [x] **4.4** Implement video-to-canvas fallback
  - If HLS playback fails, fall back to static refresh
  - Handle network errors gracefully
  - Show loading state while video buffers

- [x] **4.5** Implement billboard thumbnail strategy
  - Continue using static image proxy for billboards (simpler)
  - HLS video only plays in center-stage mode

- [x] **4.6** Handle stream errors
  - HLS.js error events
  - Network timeout handling
  - Automatic fallback to static images
  - User-visible error state

- [x] **4.7** Write integration tests for video playback
  - Test HLS initialization
  - Test fallback behavior
  - Test error handling

### Files to Modify/Create

| File | Action |
|------|--------|
| `package.json` | Modify: add hls.js dependency |
| `src/ground/cctv/CCTVManager.ts` | Modify: add HLS video support |
| `test/cctv-video.test.ts` | Create: video playback tests |

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# test-phase4.sh - Verify Phase 4 completion

echo "=== Phase 4 Verification ==="

# 1. Check HLS.js is installed
echo "Checking HLS.js dependency..."
HLS_INSTALLED=$(grep -c "hls.js" package.json)
if [ "$HLS_INSTALLED" -ge 1 ]; then
  echo "PASS: HLS.js is installed"
else
  echo "FAIL: HLS.js not found in package.json"
  exit 1
fi

# 2. Build check
echo "Building frontend with HLS..."
bun build src/frontend/index.tsx --outdir dist
if [ $? -ne 0 ]; then
  echo "FAIL: Build failed"
  exit 1
fi
echo "PASS: Build succeeded"

# 3. Start server
echo "Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# 4. Find a camera with videoUrl
echo "Finding camera with HLS stream..."
VIDEO_CAMERA=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq -r '[.[] | select(.source == "ny511" and .videoUrl != null)][0]')
VIDEO_URL=$(echo "$VIDEO_CAMERA" | jq -r '.videoUrl')
CAMERA_ID=$(echo "$VIDEO_CAMERA" | jq -r '.id')

echo "Camera: $CAMERA_ID"
echo "Video URL: $VIDEO_URL"

# 5. Test HLS stream is accessible
echo "Testing HLS stream accessibility..."
HLS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$VIDEO_URL" 2>/dev/null)
if [ "$HLS_CODE" = "200" ]; then
  echo "PASS: HLS stream accessible (status $HLS_CODE)"
elif [ "$HLS_CODE" = "000" ]; then
  echo "WARN: HLS stream may require proxy (connection failed)"
else
  echo "WARN: HLS stream returned $HLS_CODE"
fi

# 6. Unit tests
echo "Running video tests..."
bun test test/cctv-video.test.ts
if [ $? -ne 0 ]; then
  echo "FAIL: Video tests failed"
  kill $SERVER_PID
  exit 1
fi

kill $SERVER_PID

# 7. Manual test checklist
echo ""
echo "=== MANUAL TESTING REQUIRED ==="
echo "Please verify the following in browser:"
echo "  [ ] Open camera with HLS stream in center-stage"
echo "  [ ] Video plays automatically"
echo "  [ ] Video controls work (if shown)"
echo "  [ ] Close center-stage stops playback"
echo "  [ ] Open camera WITHOUT HLS stream"
echo "  [ ] Falls back to static image refresh"
echo "  [ ] Test camera where HLS fails (network disconnect)"
echo "  [ ] Fallback to static images works"
echo ""
echo "Test camera with video: $CAMERA_ID"
echo ""
echo "Run: bun --hot src/index.ts"
echo "Open: http://localhost:3000"
echo ""
echo "=== Phase 4 COMPLETE (pending manual verification) ==="
```

### Checklist

- [ ] HLS.js installed and bundled
- [ ] HLS stream accessibility tested
- [ ] Center-stage detects cameras with `videoUrl`
- [ ] Video element created and HLS.js initialized
- [ ] Video plays in center-stage for HLS-enabled cameras
- [ ] Fallback to static images for cameras without HLS
- [ ] Fallback works when HLS playback fails
- [ ] Error handling for network failures
- [ ] No regression in non-video cameras
- [ ] Manual verification of video playback

### Exit Criteria

1. HLS.js installed and bundled
2. Center-stage shows live video for cameras with `videoUrl`
3. Fallback to static images when video unavailable
4. Error handling works (network failures)
5. No regression in non-video cameras
6. Manual verification of video playback

---

## Phase 5: Final Integration & Regression Testing

**Goal**: Full end-to-end testing and documentation.

**Dependencies**: Phases 1-4

### Tasks

- [x] **5.1** Run complete test suite
  - All unit tests pass
  - All integration tests pass
  - No console errors in browser

- [x] **5.2** Performance testing
  - Load time with 1800+ cameras
  - Memory usage during scrolling
  - Thumbnail refresh performance

- [x] **5.3** Regression testing for existing sources
  - Austin cameras work as before
  - Caltrans cameras work as before
  - No visual regressions

- [x] **5.4** Edge case testing
  - Zoom to area with no cameras
  - Rapid viewport changes
  - Network disconnection handling
  - Browser back/forward navigation

- [x] **5.5** Documentation & cleanup
  - Update any relevant docs
  - Remove debug logs
  - Code review checklist

### Verification (Autonomous Feedback Loop)

```bash
#!/bin/bash
# test-phase5.sh - Full integration verification

echo "=== Phase 5: Final Verification ==="

# 1. Run all tests
echo "Running all tests..."
bun test
if [ $? -ne 0 ]; then
  echo "FAIL: Test suite failed"
  exit 1
fi
echo "PASS: All tests pass"

# 2. Build production bundle
echo "Building production bundle..."
bun build src/frontend/index.tsx --outdir dist --minify
if [ $? -ne 0 ]; then
  echo "FAIL: Production build failed"
  exit 1
fi
echo "PASS: Production build succeeded"

# 3. Start server
echo "Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# 4. Comprehensive API check
echo "=== API Health Check ==="

# Total cameras
TOTAL=$(curl -s "http://localhost:3000/api/cctv/cameras" | jq 'length')
echo "Total cameras: $TOTAL"

# By source
AUSTIN=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "austin")] | length')
CALTRANS=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "caltrans")] | length')
NY511=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
  jq '[.[] | select(.source == "ny511")] | length')

echo "Austin: $AUSTIN"
echo "Caltrans: $CALTRANS"
echo "NY511: $NY511"

# Verify counts
if [ "$NY511" -gt 1500 ]; then
  echo "PASS: NY511 camera count OK"
else
  echo "FAIL: NY511 count too low: $NY511"
  kill $SERVER_PID
  exit 1
fi

# 5. Test thumbnails from each source
echo ""
echo "=== Thumbnail Tests ==="
for SOURCE in austin caltrans ny511; do
  CAMERA_ID=$(curl -s "http://localhost:3000/api/cctv/cameras" | \
    jq -r "[.[] | select(.source == \"$SOURCE\")][0].id")
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:3000/api/cctv/thumbnail/$CAMERA_ID")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "PASS: $SOURCE thumbnail works ($CAMERA_ID)"
  else
    echo "FAIL: $SOURCE thumbnail returned $HTTP_CODE"
    kill $SERVER_PID
    exit 1
  fi
done

kill $SERVER_PID

# 6. Summary
echo ""
echo "========================================="
echo "  PHASE 5 VERIFICATION COMPLETE"
echo "========================================="
echo ""
echo "Results:"
echo "  - All tests pass: YES"
echo "  - Production build: YES"
echo "  - API health: OK"
echo "  - Thumbnails: OK (all sources)"
echo ""
echo "Manual verification checklist:"
echo "  [ ] Navigate to NYC - cameras visible"
echo "  [ ] Navigate to Austin - cameras visible"
echo "  [ ] Navigate to California - cameras visible"
echo "  [ ] Project billboard - displays correctly"
echo "  [ ] Center-stage mode - video plays (NY511)"
echo "  [ ] Center-stage mode - static refresh (Austin)"
echo "  [ ] Panel metadata - roadway names shown"
echo "  [ ] Performance - smooth with many cameras"
echo ""
echo "Ready for PR!"
```

### Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No console errors in browser
- [ ] Production build succeeds
- [ ] All three sources work correctly (Austin, Caltrans, NY511)
- [ ] Performance acceptable with 3000+ cameras
- [ ] Manual verification complete
- [ ] Debug logs removed
- [ ] Code review complete

### Exit Criteria

1. All automated tests pass
2. Production build succeeds
3. All three sources work correctly
4. Performance acceptable with 3000+ cameras
5. Manual verification complete

---

## Summary

| Phase | Description | Dependencies | Estimated Effort |
|-------|-------------|--------------|------------------|
| 1 | Backend Data Loading | None | 2-3 hours |
| 2 | Thumbnail Proxying | Phase 1 | 2 hours |
| 3 | Frontend Display | Phase 2 | 3-4 hours |
| 4 | HLS Video Streaming | Phase 3 | 4-5 hours |
| 5 | Integration Testing | Phases 1-4 | 2 hours |

**Total estimated effort**: 13-16 hours

---

## File Modification Summary

### New Files

| File | Purpose |
|------|---------|
| `test/cctv-ny511.test.ts` | Unit tests for NY511 loading |
| `test/cctv-thumbnail.test.ts` | Thumbnail proxy tests |
| `test/cctv-video.test.ts` | HLS video tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/proxy/cctv.ts` | Add NY511 source, types, loading, thumbnail handling |
| `src/ground/cctv/types.ts` | Add metadata fields (`roadway`, `direction`, `videoUrl`) |
| `src/ground/cctv/CCTVPanel.ts` | Display roadway/direction metadata |
| `src/ground/cctv/CCTVManager.ts` | Add HLS video support in center-stage |
| `package.json` | Add hls.js dependency |

### Existing Files (no changes expected)

| File | Reason |
|------|--------|
| `src/data/511ny.json` | Already exists with camera data |
| `src/proxy/index.ts` | Routes already support current pattern |
| `src/ground/cctv/CCTVBillboard.ts` | Should work as-is for NY511 |
| `src/ground/cctv/index.ts` | Module exports unchanged |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NY511 image URL format unknown | Investigate actual endpoints in Phase 2.1; document findings |
| CORS issues with thumbnails | Backend proxy already handles CORS; apply same pattern |
| HLS streams inaccessible | Test in Phase 4.2; implement HLS proxy if needed |
| Performance with 3000+ cameras | Viewport-based filtering limits visible cameras; test in Phase 5 |
| Breaking existing cameras | Regression tests in Phase 2 and Phase 5 |

---

*Plan Status: Ready for Execution*
