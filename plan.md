# Execution Plan: Ship Tracking Layer

> Generated from PRD: Ship Tracking Layer  
> Plan Created: 2026-03-08

---

## Overview

This execution plan implements real-time ship tracking for WorldView using AIS (Automatic Identification System) data via the AISStream WebSocket API. The plan is organized into 5 phases, each leaving a complete, tested component.

---

## Phase Dependencies

```
Phase 1 (Proxy + WebSocket Buffer)
    ↓
Phase 2 (Ship Layer + Visualization)
    ↓
Phase 3 (UI Integration - Toggle + Click)
    ↓
Phase 4 (Info Panel + Follow Mode)
    ↓
Phase 5 (Polish + Error Handling)
```

- **Phase 1**: No dependencies (foundation - server-side)
- **Phase 2**: Depends on Phase 1 (needs `/ships` endpoint)
- **Phase 3**: Depends on Phase 2 (needs ShipLayer class)
- **Phase 4**: Depends on Phase 3 (needs ship selection working)
- **Phase 5**: Depends on Phase 4 (polish and edge cases)

---

## Phase 1: Proxy Server + WebSocket Buffer

**Goal**: Establish persistent WebSocket connection to AISStream and expose buffered ship data via HTTP endpoint.

### Tasks

- [x] Create `src/proxy/aisstream.ts` with AISStreamClient class:
  - [x] WebSocket connection to `wss://stream.aisstream.io/v0/stream`
  - [x] API key authentication from `process.env.AISSTREAM_API_KEY`
  - [x] In-memory ship buffer using `Map<string, ShipRecord>` keyed by MMSI
  - [x] Parse `PositionReport` messages and update buffer
  - [x] Buffer eviction: remove ships not seen in 5 minutes
  - [x] Reconnection with exponential backoff (1s, 2s, 4s, 8s, 30s)
- [x] Define `ShipRecord` interface matching PRD spec
- [x] Implement `shipTypeToCategory()` helper function
- [x] Implement `navStatusToString()` helper function
- [x] Add `/ships` endpoint to `src/proxy/index.ts`:
  - [x] Accept bbox query params: `minLat`, `maxLat`, `minLon`, `maxLon`
  - [x] Filter ships within bounding box
  - [x] Sort by distance from bbox center
  - [x] Limit to 100 ships, return `truncated: true` if more
- [ ] Write unit tests for message parsing and bbox filtering

### Files to Create

| File | Purpose |
|------|---------|
| `src/proxy/aisstream.ts` | AISStream WebSocket client + ship buffer |

### Files to Modify

| File | Changes |
|------|---------|
| `src/proxy/index.ts` | Add `/ships` endpoint, initialize AISStream client |
| `src/proxy/types.ts` | Add ShipRecord type export (if needed) |

### Verification (Autonomous Feedback Loop)

```bash
# Start proxy server
bun run src/proxy/index.ts &
PROXY_PID=$!

# Wait for WebSocket to connect
sleep 5

# Test health endpoint
curl -s http://localhost:3001/health | jq .

# Test ships endpoint (Austin area bbox)
curl -s "http://localhost:3001/ships?minLat=27&maxLat=31&minLon=-98&maxLon=-94" | jq .

# Check for ships (may be empty if no ships in area - use global bbox as fallback)
curl -s "http://localhost:3001/ships?minLat=-90&maxLat=90&minLon=-180&maxLon=180" | jq '.count'

# Cleanup
kill $PROXY_PID
```

**Success Criteria**:
- Proxy starts without error
- WebSocket connects to AISStream (check console logs)
- `/ships` endpoint returns JSON with `ships` array and `count`
- Ships have all required fields (mmsi, name, latitude, longitude, etc.)

### Checklist

- [x] AISStreamClient connects to WebSocket on startup
- [x] PositionReport messages are parsed correctly
- [x] Ship buffer updates with new positions
- [x] 5-minute eviction removes stale ships
- [x] Reconnection works after disconnect (test by stopping/starting network)
- [x] `/ships` accepts bbox query parameters
- [x] `/ships` returns max 100 ships with `truncated` flag
- [x] `shipTypeToCategory()` maps all type codes correctly
- [x] `navStatusToString()` maps all status codes correctly
- [ ] Unit tests pass: `bun test test/aisstream.test.ts`

### Exit Criteria

- Proxy server exposes `/ships` endpoint with live AIS data
- Ships appear in response within 30 seconds of starting server
- All unit tests pass

---

## Phase 2: Ship Layer + Visualization

**Goal**: Create ShipLayer class that renders ships on the 3D globe with type-specific icons and colors.

### Tasks

- [x] Create `src/layers/ships.ts` with ShipLayer class following flight layer pattern:
  - [x] `entityMap: Map<string, Cesium.Entity>` for ship entities
  - [x] `recordMap: Map<string, ShipRecord>` for ship data
  - [x] `show()` method: fetch ships, create entities, start polling
  - [x] `hide()` method: remove entities, stop polling
  - [x] `refreshShips()` method: update positions every 8 seconds
  - [x] Bounding box calculation from camera viewport
  - [x] Fallback bbox when viewport is invalid (camera center + 45°)
- [x] Create ship billboards with:
  - [x] Ship type icon (5 categories: cargo, tanker, passenger, fishing, other)
  - [x] Color tint by ship type
  - [x] Rotation to match heading (trueHeading or cog)
  - [x] Label with vessel name, speed, course
- [x] Implement dead-reckoning interpolation:
  - [x] Use `preRender` listener like flights
  - [x] Interpolate up to 60 ships between polls
  - [x] Cap extrapolation at 60 seconds
- [x] Implement `hasMMSI()`, `getRecord()`, `getEntity()` methods
- [x] Create placeholder ship icons (simple colored rectangles) in `src/assets/ships/`

### Files to Create

| File | Purpose |
|------|---------|
| `src/layers/ships.ts` | ShipLayer class |
| `src/assets/ships/cargo.png` | Cargo ship icon |
| `src/assets/ships/tanker.png` | Tanker icon |
| `src/assets/ships/passenger.png` | Passenger ship icon |
| `src/assets/ships/fishing.png` | Fishing vessel icon |
| `src/assets/ships/other.png` | Generic ship icon |

### Verification (Autonomous Feedback Loop)

```bash
# Start full application
bun run src/server.ts &
SERVER_PID=$!

# Wait for startup
sleep 3

# Use Playwright to verify ships appear on globe
bun run scripts/verify-phase2-ships.ts

# Cleanup
kill $SERVER_PID
```

**Verification Script** (`scripts/verify-phase2-ships.ts`):
```typescript
// 1. Navigate to globe
// 2. Manually call shipLayer.show()
// 3. Wait 10 seconds
// 4. Count ship entities on globe
// 5. Verify ships have correct visual properties
// 6. Call shipLayer.hide()
// 7. Verify all entities removed
```

### Checklist

- [x] ShipLayer follows established class pattern (matches FlightLayer)
- [x] Ships appear on globe when `show()` is called
- [x] Ships have correct icon based on type category
- [x] Ships have correct color tint
- [x] Ships rotate to match heading
- [x] Labels show vessel name, speed, and course
- [x] Ships update position every 8 seconds
- [x] Dead-reckoning smooths movement between polls
- [x] `hide()` removes all ships and stops polling
- [x] No memory leaks (entities properly cleaned up)

### Exit Criteria

- Ships render on globe with correct visualization
- Positions update via polling
- Dead-reckoning provides smooth movement

---

## Phase 3: UI Integration — Toggle + Click Handler

**Goal**: Add ship layer toggle to left panel and wire up click handling in main.ts.

### Tasks

- [x] Add ship layer state to `src/ui/left-panel.ts`:
  ```typescript
  const ship = {
    layer: null as ShipLayer | null,
    active: false,
  };
  ```
- [x] Add "SHIPS" toggle row to `createToggles()` HTML
- [x] Create `wireUpShipToggle()` using existing `handleLayerToggle()` pattern
- [x] Update `initLeftPanel()` to accept `shipLayer` option
- [x] Update `src/ui/shell.ts` to pass ship layer to left panel
- [x] Add `ShipLayer` to ClickContext in `src/main.ts`
- [x] Create `handleShipClick()` function in `src/main.ts`
- [x] Add ship click handler to click chain (after CCTV, before satellites)
- [x] Implement ship selection highlight (yellow silhouette, scale increase)
- [x] Add ship deselection to `handleEmptyClick()`

### Files to Modify

| File | Changes |
|------|---------|
| `src/ui/left-panel.ts` | Add ship state, toggle, wireUp function |
| `src/ui/shell.ts` | Pass shipLayer to left panel |
| `src/main.ts` | Add shipLayer to context, add click handler |
| `src/layers/ships.ts` | Add selectShip(), deselectShip() methods |

### Verification (Autonomous Feedback Loop)

```bash
# Start application
bun run src/server.ts &
SERVER_PID=$!
sleep 3

# Use Playwright to test toggle and click
bun run scripts/verify-phase3-ships.ts

kill $SERVER_PID
```

**Verification Script** (`scripts/verify-phase3-ships.ts`):
```typescript
// 1. Navigate to globe
// 2. Click SHIPS toggle button
// 3. Verify button shows "LOADING" then "ON"
// 4. Wait for ships to appear
// 5. Click on a ship entity
// 6. Verify ship is highlighted (visual check or entity property)
// 7. Click empty space
// 8. Verify ship is deselected
// 9. Click SHIPS toggle again
// 10. Verify button shows "OFF" and ships disappear
```

### Checklist

- [x] "SHIPS" toggle appears in left panel
- [x] Toggle follows OFF → LOADING → ON pattern
- [x] Toggle shows "ERR" on failure
- [x] Ships appear when toggle is ON
- [x] Ships disappear when toggle is OFF
- [x] Clicking ship highlights it (yellow silhouette, larger scale)
- [x] Clicking empty space deselects ship
- [x] Ship layer count badge updates in shell
- [x] Log entries appear: "[SHIPS] Layer active", "[SHIPS] Layer disabled"

### Exit Criteria

- Users can toggle ship layer via UI
- Users can select/deselect ships by clicking
- Layer integrates with existing toggle pattern

---

## Phase 4: Info Panel + Follow Mode

**Goal**: Show ship details panel on selection and implement camera follow mode.

### Tasks

- [x] Create `src/ui/ship-info-panel.ts` following flight-info-panel pattern:
  - [x] Panel HTML with ship-specific fields
  - [x] `showShipInfoPanel(record, layer)` function
  - [x] `hideShipInfoPanel()` function
  - [x] FOLLOW/UNFOLLOW button with toggle logic
  - [x] Close button
  - [x] MarineTraffic external link
- [x] Implement ship follow mode in ShipLayer:
  - [x] `startFollow()` using preRender listener pattern
  - [x] `stopFollow()` with camera unlock
  - [x] `isFollowing()` state check
  - [x] `getCurrentPosition()` for smooth tracking
- [x] Wire up info panel to click handler:
  - [x] Show panel on ship select
  - [x] Hide panel on ship deselect
- [x] Add escape handler for ship follow mode in main.ts
- [x] Add `resetShipFollowButton()` export

### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/ship-info-panel.ts` | Ship selection details panel |

### Files to Modify

| File | Changes |
|------|---------|
| `src/layers/ships.ts` | Add follow mode methods |
| `src/main.ts` | Wire up info panel, escape handler |
| `public/styles.css` | Add ship-info-panel styles (reuse sat-info-* classes) |

### Verification (Autonomous Feedback Loop)

```bash
# Start application
bun run src/server.ts &
SERVER_PID=$!
sleep 3

# Use Playwright to test info panel and follow
bun run scripts/verify-phase4-ships.ts

kill $SERVER_PID
```

**Verification Script** (`scripts/verify-phase4-ships.ts`):
```typescript
// 1. Enable ships layer
// 2. Click on a ship
// 3. Verify info panel appears with ship data
// 4. Verify all fields populated (MMSI, Type, Speed, etc.)
// 5. Click FOLLOW button
// 6. Verify button text changes to UNFOLLOW
// 7. Verify camera tracks ship position
// 8. Press Escape
// 9. Verify follow mode stops, button resets
// 10. Verify MarineTraffic link is correct
// 11. Click close button
// 12. Verify panel hides
```

### Checklist

- [x] Info panel shows on ship selection
- [x] Panel displays: vessel name, MMSI, type, position, speed, course, heading, status
- [x] Navigation status displays human-readable text
- [x] FOLLOW button starts camera tracking
- [x] UNFOLLOW button stops tracking
- [x] Escape key exits follow mode
- [x] MarineTraffic link opens correct vessel page
- [x] Close button hides panel and deselects ship
- [x] Panel styling matches flight-info-panel

### Exit Criteria

- Complete ship info panel with all fields
- Working follow mode with smooth camera tracking
- All panel interactions functional

---

## Phase 5: Polish + Error Handling

**Goal**: Handle edge cases, improve error resilience, final testing.

### Tasks

- [ ] Implement WebSocket reconnection error handling:
  - [ ] Log reconnection attempts
  - [ ] Continue serving cached data during reconnection
  - [ ] Show log entry on reconnection failure
- [ ] Handle API key invalid case:
  - [ ] Return 503 from `/ships` endpoint
  - [ ] Show "ERR" on toggle button
  - [ ] Log: "[SHIPS] AISStream authentication failed"
- [ ] Implement rate limiting graceful degradation:
  - [ ] Reduce polling to 15 seconds when rate limited
  - [ ] Display warning in log
  - [ ] Resume normal polling after 60 seconds
- [ ] Handle empty viewport fallback:
  - [ ] Detect when camera viewport fails
  - [ ] Fall back to camera center + 20° bbox
- [ ] Add ship sprites (replace placeholder rectangles):
  - [ ] Create 5 ship silhouette icons (32x32 PNG)
  - [ ] White/light color for programmatic tinting
  - [ ] Facing "up" (north) in default orientation
- [ ] Write integration tests for error scenarios
- [ ] Performance testing with 100 ships

### Files to Modify

| File | Changes |
|------|---------|
| `src/proxy/aisstream.ts` | Enhanced error handling |
| `src/layers/ships.ts` | Viewport fallback, polling rate adjustment |
| `src/assets/ships/*.png` | Replace with proper ship icons |
| `test/ships-integration.test.ts` | Create integration tests |

### Verification (Autonomous Feedback Loop)

```bash
# Run full test suite
bun test

# Performance test
bun run scripts/perf-test-ships.ts

# Error handling tests
bun run scripts/error-test-ships.ts
```

**Performance Test Script** (`scripts/perf-test-ships.ts`):
```typescript
// 1. Enable ships layer
// 2. Navigate to high-traffic area (e.g., English Channel)
// 3. Wait for 100 ships to load
// 4. Measure frame rate for 30 seconds
// 5. Verify FPS > 30
// 6. Monitor memory usage
// 7. Verify no memory leaks over time
```

**Error Test Script** (`scripts/error-test-ships.ts`):
```typescript
// 1. Test with invalid API key
// 2. Test with network disconnect
// 3. Test with rate limiting response
// 4. Verify graceful degradation in all cases
```

### Checklist

- [ ] WebSocket reconnects automatically on disconnect
- [ ] Invalid API key shows appropriate error
- [ ] Rate limiting triggers polling slowdown
- [ ] Viewport fallback works when camera is at edge of globe
- [ ] Ship icons are proper silhouettes (not rectangles)
- [ ] 100 ships render at > 30 FPS
- [ ] Memory stable over 10 minutes of polling
- [ ] Buffer eviction prevents memory growth
- [ ] All integration tests pass

### Exit Criteria

- All PRD requirements implemented
- All error cases handled gracefully
- Performance meets targets
- Full test suite passes

---

## Test Summary

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `test/aisstream.test.ts` | AISStream message parsing, bbox filtering |
| `test/ships-layer.test.ts` | ShipLayer class methods |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `test/ships-integration.test.ts` | End-to-end ship tracking |
| `test/ships-errors.test.ts` | Error handling scenarios |

### Verification Scripts

| Script | Purpose |
|--------|---------|
| `scripts/verify-phase2-ships.ts` | Ship visualization verification |
| `scripts/verify-phase3-ships.ts` | Toggle and click verification |
| `scripts/verify-phase4-ships.ts` | Info panel and follow verification |
| `scripts/perf-test-ships.ts` | Performance benchmarking |
| `scripts/error-test-ships.ts` | Error handling verification |

### Run All Tests

```bash
# Run full test suite
bun test

# Run ship-specific tests
bun test test/aisstream.test.ts
bun test test/ships-layer.test.ts
bun test test/ships-integration.test.ts
```

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Proxy + Buffer | 2-3 hours |
| Phase 2: Ship Layer + Viz | 3-4 hours |
| Phase 3: UI Integration | 2 hours |
| Phase 4: Info Panel + Follow | 2-3 hours |
| Phase 5: Polish + Errors | 2 hours |
| **Total** | **11-14 hours** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| AISStream API changes | WebSocket protocol is stable; proxy layer isolates changes |
| High ship density areas | Limit to 100 ships; sort by distance to camera center |
| WebSocket connection instability | Exponential backoff reconnection; serve cached data |
| Missing ship names | Fall back to MMSI as identifier; common in AIS |
| Ship sprite rendering issues | Test with simple colored rectangles first; iterate |

---

## Files Changed Summary

### New Files

- `src/proxy/aisstream.ts` — AISStream WebSocket client + buffer
- `src/layers/ships.ts` — ShipLayer class
- `src/ui/ship-info-panel.ts` — Ship info panel
- `src/assets/ships/cargo.png` — Cargo ship icon
- `src/assets/ships/tanker.png` — Tanker icon
- `src/assets/ships/passenger.png` — Passenger ship icon
- `src/assets/ships/fishing.png` — Fishing vessel icon
- `src/assets/ships/other.png` — Generic ship icon
- `test/aisstream.test.ts` — AISStream unit tests
- `test/ships-layer.test.ts` — ShipLayer unit tests
- `test/ships-integration.test.ts` — Integration tests
- `scripts/verify-phase2-ships.ts` — Phase 2 verification
- `scripts/verify-phase3-ships.ts` — Phase 3 verification
- `scripts/verify-phase4-ships.ts` — Phase 4 verification
- `scripts/perf-test-ships.ts` — Performance test
- `scripts/error-test-ships.ts` — Error handling test

### Modified Files

- `src/proxy/index.ts` — Add `/ships` endpoint, initialize AISStream
- `src/ui/left-panel.ts` — Add ship toggle state and handler
- `src/ui/shell.ts` — Pass shipLayer to left panel
- `src/main.ts` — Add ship layer, click handler, escape handler
- `public/styles.css` — Ship info panel styles (if not reusing existing)

---

## Data Structures Reference

### ShipRecord Interface

```typescript
interface ShipRecord {
  mmsi: string;           // Maritime Mobile Service Identity
  name: string;           // Vessel name from AIS
  shipType: number;       // AIS ship type code (0-99)
  shipTypeCategory: ShipTypeCategory;
  latitude: number;
  longitude: number;
  cog: number;            // Course over ground (degrees)
  sog: number;            // Speed over ground (knots)
  trueHeading: number;    // True heading (degrees), 511 = not available
  navStatus: number;      // Navigation status code (0-15)
  timestamp: number;      // Last update epoch (ms)
}

type ShipTypeCategory = 'cargo' | 'tanker' | 'passenger' | 'fishing' | 'other';
```

### Ship Type Mapping

| AIS Type Code | Category | Color |
|---------------|----------|-------|
| 70-79 | cargo | #3B82F6 (Blue) |
| 80-89 | tanker | #EF4444 (Red) |
| 60-69 | passenger | #22C55E (Green) |
| 30 | fishing | #F97316 (Orange) |
| All other | other | #9CA3AF (Gray) |

### Navigation Status Codes

| Code | Status |
|------|--------|
| 0 | Under way using engine |
| 1 | At anchor |
| 2 | Not under command |
| 3 | Restricted maneuverability |
| 4 | Constrained by draught |
| 5 | Moored |
| 6 | Aground |
| 7 | Engaged in fishing |
| 8 | Under way sailing |
| 11-13 | Reserved |
| 14 | AIS-SART active |
| 15 | Not defined |

---

## AISStream Message Format

```json
{
  "MessageType": "PositionReport",
  "MetaData": {
    "MMSI": 123456789,
    "ShipName": "EVER GIVEN",
    "latitude": 29.9187,
    "longitude": 32.5794,
    "time_utc": "2024-03-08T12:00:00Z"
  },
  "Message": {
    "PositionReport": {
      "Cog": 145.2,
      "Sog": 12.5,
      "TrueHeading": 143,
      "NavigationalStatus": 0,
      "ShipType": 70
    }
  }
}
```

---

*Plan Status: Ready for Execution*
