# Execution Plan: Unified `:follow` Command

> Generated from PRD: Unified `:follow` Command  
> Plan Created: 2026-03-08

---

## Overview

This execution plan implements the `:follow <identifier>` command for WorldView, enabling keyboard-driven following of satellites (by NORAD ID) and flights (by callsign). The plan is organized into 5 phases, each leaving a complete, tested component.

---

## Phase Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Satellite Follow) ←─── Phase 3 (Flight Follow)
    ↓                               ↓
    └───────────┬───────────────────┘
                ↓
         Phase 4 (Integration)
                ↓
         Phase 5 (Polish)
```

- **Phase 1**: No dependencies (foundation)
- **Phase 2**: Depends on Phase 1
- **Phase 3**: Depends on Phase 1 (can run parallel with Phase 2)
- **Phase 4**: Depends on Phases 2 and 3
- **Phase 5**: Depends on Phase 4

---

## Phase 1: Foundation — Command Parsing & Detection

**Goal**: Add `:follow` command parsing with identifier type detection (satellite vs flight).

### Tasks

- [x] Add `follow` to `COMMANDS` table in `src/ui/command-parser.ts`
- [x] Implement `detectIdentifierType()` function with regex pattern `/^\d{1,5}$/`
- [x] Create `IATA_TO_ICAO` lookup table (50 carriers) as a new utility
- [x] Implement `convertIataToIcao()` function for callsign normalization
- [x] Add `handleFollow()` stub in `src/ui/command-bar.ts` (returns early with TODO)
- [x] Write unit tests for all new functions

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/ui/command-parser.ts` | Modify: add `follow` command |
| `src/utils/airline-codes.ts` | Create: IATA→ICAO mapping + conversion |
| `src/ui/command-bar.ts` | Modify: add `handleFollow()` stub |
| `test/command-parser.test.ts` | Modify: add follow command tests |
| `test/airline-codes.test.ts` | Create: IATA conversion tests |

### Verification (Autonomous Feedback Loop)

```bash
# Run test suite - all tests must pass
bun test test/command-parser.test.ts test/airline-codes.test.ts

# Expected: All tests pass
# - parseCommand("follow 25544") → { type: "follow", args: "25544" }
# - detectIdentifierType("25544") → "satellite"
# - detectIdentifierType("UAL123") → "flight"
# - convertIataToIcao("UA100") → "UAL100"
# - convertIataToIcao("AAL100") → "AAL100" (no change)
```

### Checklist

- [ ] `parseCommand("follow 25544")` returns `{ type: "follow", args: "25544" }`
- [ ] `parseCommand("follow UA100")` returns `{ type: "follow", args: "UA100" }`
- [ ] `detectIdentifierType("25544")` returns `"satellite"`
- [ ] `detectIdentifierType("123456")` returns `"flight"` (>5 digits)
- [ ] `detectIdentifierType("UAL123")` returns `"flight"`
- [ ] All 50 IATA codes convert correctly to ICAO
- [ ] Already-ICAO codes pass through unchanged
- [ ] `bun test` passes with 0 failures

### Exit Criteria

- All unit tests pass
- Command parser recognizes `:follow` command
- Type detection correctly categorizes all identifier formats

---

## Phase 2: Satellite Search & Follow

**Depends on**: Phase 1

**Goal**: Implement satellite search from loaded data and follow/unfollow toggle.

### Tasks

- [x] Add `findByNoradId(noradId: number): SatelliteRecord | null` to `SatelliteLayer`
- [x] Implement satellite branch in `handleFollow()`:
  - Search loaded satellites across all categories
  - Call existing `startFollow()` / `stopFollow()` based on current state
  - Show success/error feedback
- [x] Handle edge cases: NORAD ID = 0, not found
- [x] Write integration tests

### Files to Modify

| File | Action |
|------|--------|
| `src/layers/satellites.ts` | Add `findByNoradId()` method |
| `src/ui/command-bar.ts` | Implement satellite follow logic |
| `test/satellite-follow.test.ts` | Create: satellite search/follow tests |

### Verification (Autonomous Feedback Loop)

```bash
# Unit tests for satellite search
bun test test/satellite-follow.test.ts

# Manual verification script (runs in headless mode)
bun run scripts/verify-phase2.ts
```

**Verification Script** (`scripts/verify-phase2.ts`):
```typescript
// Tests to run:
// 1. findByNoradId(25544) returns ISS record (if loaded)
// 2. findByNoradId(99999999) returns null
// 3. Toggle behavior: follow → unfollow → follow
```

### Checklist

- [x] `findByNoradId()` searches all satellite categories
- [x] Following satellite shows success message: "Following {name}"
- [x] Unfollowing shows: "Stopped following {name}"
- [x] Unknown NORAD ID shows: "Satellite {id} not found"
- [x] NORAD ID = 0 shows: "Invalid NORAD ID"
- [x] Toggle: calling follow on followed satellite unfollows it
- [x] Camera behavior matches existing click-to-follow
- [x] `bun test` passes

### Exit Criteria

- Can follow any loaded satellite by NORAD ID via command
- Toggle behavior works correctly
- All error cases handled with appropriate messages

---

## Phase 3: Flight Search & Follow

**Depends on**: Phase 1 (can run parallel with Phase 2)

**Goal**: Implement flight search with IATA conversion and follow/unfollow toggle.

### Tasks

- [x] Add `findByCallsign(callsign: string): FlightRecord | null` to `FlightLayer`
- [x] Implement flight branch in `handleFollow()`:
  - Apply IATA→ICAO conversion before search
  - Search loaded flights by exact callsign match
  - Call existing `startFollow()` / `stopFollow()`
  - Show success/error feedback
- [x] Write integration tests

### Files to Modify

| File | Action |
|------|--------|
| `src/layers/flights.ts` | Add `findByCallsign()` method |
| `src/ui/command-bar.ts` | Implement flight follow logic |
| `test/flight-follow.test.ts` | Create: flight search/follow tests |

### Verification (Autonomous Feedback Loop)

```bash
# Unit tests
bun test test/flight-follow.test.ts

# Test IATA conversion integration
bun test test/airline-codes.test.ts test/flight-follow.test.ts
```

### Checklist

- [x] `findByCallsign("UAL123")` finds flight with callsign "UAL123"
- [x] `:follow UA123` converts to search for "UAL123"
- [x] `:follow AAL789` (already ICAO) searches for "AAL789"
- [x] Unknown callsign shows: "Flight {callsign} not found"
- [x] Toggle behavior works for flights
- [x] `bun test` passes

### Exit Criteria

- Can follow any loaded flight by callsign via command
- IATA codes automatically converted to ICAO before search
- Toggle behavior works correctly

---

## Phase 4: On-Demand Satellite Fetch (CelesTrak)

**Depends on**: Phases 2 and 3

**Goal**: Fetch satellite TLE from CelesTrak when not found in loaded data.

### Tasks

- [x] Add single-satellite endpoint to `src/proxy/tle.ts`:
  - `GET /tle?catnr={noradId}` → CelesTrak single fetch
  - Parse TLE response and return satellite data
- [x] Add rate limiter state to `SatelliteLayer`:
  - `lastCelestrakFetch: number`
  - `CELESTRAK_COOLDOWN_MS = 5000`
- [x] Implement `fetchAndAddSatellite(noradId: number)` in `SatelliteLayer`:
  - Check rate limit
  - Fetch from proxy
  - Parse TLE
  - Add to loaded collection
  - Create billboard entity
- [x] Update `handleFollow()` to use on-demand fetch:
  - If satellite not in loaded data, call `fetchAndAddSatellite()`
  - Show loading spinner during fetch
  - Handle fetch errors (404, timeout, network)
- [x] Write tests with mocked fetch

### Files to Modify

| File | Action |
|------|--------|
| `src/proxy/tle.ts` | Add `?catnr=` endpoint |
| `src/proxy/index.ts` | Wire up new endpoint |
| `src/layers/satellites.ts` | Add fetch + rate limiting |
| `src/ui/command-bar.ts` | Handle async fetch flow |
| `test/satellite-fetch.test.ts` | Create: CelesTrak fetch tests |

### Verification (Autonomous Feedback Loop)

```bash
# Unit tests with mocked responses
bun test test/satellite-fetch.test.ts

# Integration test against real CelesTrak (rate-limited)
bun run scripts/verify-phase4.ts
```

**Verification Script** (`scripts/verify-phase4.ts`):
```typescript
// 1. Fetch ISS (25544) from CelesTrak
// 2. Verify TLE parsing works
// 3. Verify rate limit blocks rapid requests
// 4. Verify 404 handling for invalid NORAD ID
```

### Checklist

- [x] `/tle?catnr=25544` returns valid TLE data
- [x] Rate limiter blocks requests within 5 seconds
- [x] Rate limit error shows: "Please wait before fetching another satellite"
- [x] CelesTrak 404 shows: "Satellite {id} not found"
- [x] Timeout shows: "Failed to fetch satellite data"
- [x] Fetched satellite appears on globe
- [x] Fetched satellite position updates over time
- [x] `bun test` passes

### Exit Criteria

- Can follow any satellite by NORAD ID (loaded or fetched)
- Rate limiting prevents CelesTrak abuse
- All error cases handled gracefully

---

## Phase 5: Polish & Help Text

**Depends on**: Phase 4

**Goal**: Finalize UX, update help text, comprehensive testing.

### Tasks

- [x] Update `:help` output in `handleHelp()`:
  ```
  :follow <id>    Follow satellite (NORAD ID) or flight (callsign)
                  Examples: :follow 25544, :follow UAL123, :follow AA100
  ```
- [x] Verify all user feedback messages match PRD spec
- [x] Handle edge case: empty identifier → "Usage: :follow <id>"
- [x] Handle edge case: already following different target → switch seamlessly
- [x] Run full test suite
- [x] Manual end-to-end testing checklist

### Files to Modify

| File | Action |
|------|--------|
| `src/ui/command-bar.ts` | Update help text, polish messages |
| `test/follow-integration.test.ts` | Create: end-to-end tests |

### Verification (Autonomous Feedback Loop)

```bash
# Full test suite
bun test

# Smoke test script
bun run scripts/smoke-test-follow.ts
```

**Smoke Test Script** (`scripts/smoke-test-follow.ts`):
```typescript
// End-to-end scenarios:
// 1. :follow 25544 → follows ISS
// 2. :follow 25544 again → unfollows ISS
// 3. :follow UA100 → follows UAL100 flight
// 4. :follow 99999 → fetches from CelesTrak (or shows not found)
// 5. :help → shows follow command documentation
// 6. :follow → shows usage error
```

### Checklist

- [x] Help text updated with follow command
- [x] Empty identifier shows usage message
- [x] Switching targets works smoothly
- [x] All PRD feedback messages implemented
- [x] Full test suite passes
- [x] Performance: feedback appears within 100ms
- [x] Performance: CelesTrak fetch completes in <3 seconds

### Exit Criteria

- All PRD requirements implemented
- All tests pass
- Manual testing checklist complete

---

## Test Summary

### Unit Tests (Phases 1-3)

| Test File | Coverage |
|-----------|----------|
| `test/command-parser.test.ts` | Command parsing |
| `test/airline-codes.test.ts` | IATA→ICAO conversion |
| `test/satellite-follow.test.ts` | Satellite search + follow |
| `test/flight-follow.test.ts` | Flight search + follow |

### Integration Tests (Phases 4-5)

| Test File | Coverage |
|-----------|----------|
| `test/satellite-fetch.test.ts` | CelesTrak fetch + rate limiting |
| `test/follow-integration.test.ts` | End-to-end follow scenarios |

### Verification Scripts

| Script | Purpose |
|--------|---------|
| `scripts/verify-phase2.ts` | Satellite follow verification |
| `scripts/verify-phase4.ts` | CelesTrak fetch verification |
| `scripts/smoke-test-follow.ts` | Full feature smoke test |

### Run All Tests

```bash
# Run full test suite
bun test

# Run specific phase tests
bun test test/command-parser.test.ts      # Phase 1
bun test test/satellite-follow.test.ts    # Phase 2
bun test test/flight-follow.test.ts       # Phase 3
bun test test/satellite-fetch.test.ts     # Phase 4
bun test test/follow-integration.test.ts  # Phase 5
```

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Foundation | 1.5 hours |
| Phase 2: Satellite Follow | 1 hour |
| Phase 3: Flight Follow | 1 hour |
| Phase 4: CelesTrak Fetch | 2 hours |
| Phase 5: Polish | 1 hour |
| **Total** | **6.5 hours** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| CelesTrak API changes | Proxy layer isolates changes; mock tests for reliability |
| Rate limiting too aggressive | Configurable cooldown; can adjust based on usage |
| Flight data not loaded | Clear error message; flights require prior OpenSky load |
| Camera follow jank | Reuse existing proven follow mechanisms |

---

## Files Changed Summary

### New Files

- `src/utils/airline-codes.ts` — IATA→ICAO mapping
- `test/airline-codes.test.ts` — IATA conversion tests
- `test/satellite-follow.test.ts` — Satellite follow tests
- `test/flight-follow.test.ts` — Flight follow tests
- `test/satellite-fetch.test.ts` — CelesTrak fetch tests
- `test/follow-integration.test.ts` — E2E follow tests
- `scripts/verify-phase2.ts` — Phase 2 verification
- `scripts/verify-phase4.ts` — Phase 4 verification
- `scripts/smoke-test-follow.ts` — Full smoke test

### Modified Files

- `src/ui/command-parser.ts` — Add follow command
- `src/ui/command-bar.ts` — Add handleFollow(), update help
- `src/layers/satellites.ts` — Add findByNoradId(), fetchAndAddSatellite()
- `src/layers/flights.ts` — Add findByCallsign()
- `src/proxy/tle.ts` — Add single-satellite endpoint
- `src/proxy/index.ts` — Wire up new endpoint
- `test/command-parser.test.ts` — Add follow command tests

---

*Plan Status: Ready for Execution*
