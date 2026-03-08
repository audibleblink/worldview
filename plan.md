# Execution Plan: Command Bar for Location Navigation

## Overview

Implement a terminal-style command bar for WorldView that allows users to navigate to any location by typing commands. The command bar appears when pressing `:` (colon) and supports goto, home, and help commands.

---

## Phase 1: Airport Database & Coordinate Parser

**Goal:** Build the foundational data layer and parsing logic (no UI yet).

**Dependencies:** None

### Tasks

- [x] Create `src/data/airports.json` with ~500 major airport codes (IATA/ICAO), lat/lng, and names
- [x] Create `src/geocoder.ts` with:
  - [x] `parseCoordinates(input: string): { lat: number; lng: number } | null` - Parse all 3 coordinate formats from PRD
  - [x] `lookupAirport(code: string): { lat: number; lng: number; name: string } | null` - Lookup airport by 3-letter code
  - [x] Export `GeoResult` interface

### Verification

```bash
bun test test/geocoder.test.ts
```

**Test Cases:**
- `parseCoordinates("30.2672, -97.7431")` → `{ lat: 30.2672, lng: -97.7431 }`
- `parseCoordinates("30.2672N, 97.7431W")` → `{ lat: 30.2672, lng: -97.7431 }`
- `parseCoordinates("30.2672 -97.7431")` → `{ lat: 30.2672, lng: -97.7431 }`
- `parseCoordinates("invalid")` → `null`
- `lookupAirport("AUS")` → `{ lat: 30.1975, lng: -97.6664, name: "Austin-Bergstrom International" }`
- `lookupAirport("XXX")` → `null`

---

## Phase 2: Geocoding Proxy Endpoint

**Goal:** Add `/geocode` endpoint to proxy server for Google Geocoding API.

**Dependencies:** Phase 1 (for GeoResult interface)

### Tasks

- [x] Add Google Geocoding API key to `.env` (may reuse existing `GOOGLE_MAPS_TILE_API_KEY`)
- [x] Add `/geocode?address=<query>` endpoint to `src/proxy.ts`:
  - [x] URL-decode the query parameter
  - [x] Proxy to `https://maps.googleapis.com/maps/api/geocode/json?address=<query>&key=<API_KEY>`
  - [x] Transform response to match PRD format: `{ ok: true, results: [...] }` or `{ ok: false, error: "..." }`
  - [x] Handle timeout (5 second limit)
  - [x] Return CORS headers

### Verification

```bash
# Start proxy server
bun run src/proxy.ts &

# Test geocoding endpoint
curl "http://localhost:3001/geocode?address=Austin%20TX"

# Verify response shape
curl "http://localhost:3001/geocode?address=InvalidLocation12345XYZ"

# Kill proxy
pkill -f "bun run src/proxy.ts"
```

**Expected Responses:**
- Valid query → `{ "ok": true, "results": [{ "formatted_address": "...", "geometry": {...}, "types": [...] }] }`
- Invalid query → `{ "ok": false, "error": "ZERO_RESULTS" }`

---

## Phase 3: Geocoder Client Module

**Goal:** Complete the geocoder module with Google API integration.

**Dependencies:** Phase 1, Phase 2

### Tasks

- [x] Add to `src/geocoder.ts`:
  - [x] `geocode(query: string): Promise<GeoResult | null>` - Full geocoding flow:
    1. Try `parseCoordinates()` first (instant, no API call)
    2. Try `lookupAirport()` for 3-letter codes (instant, no API call)
    3. Fall back to Google Geocoding API via proxy
  - [x] `getAltitudeForType(type: GeoResult['type']): number` - Return camera altitude based on location type
  - [x] Parse Google's `types` field to determine location type (country, city, address, etc.)

### Verification

```bash
bun test test/geocoder.test.ts
```

**Additional Test Cases:**
- `geocode("30.2672, -97.7431")` → Coordinates, no API call
- `geocode("LAX")` → Airport lookup, no API call  
- `geocode("Austin TX")` → API call, returns city result
- `geocode("123 Main St, Austin TX")` → API call, returns address result
- `getAltitudeForType("country")` → `500000` (500 km)
- `getAltitudeForType("city")` → `50000` (50 km)
- `getAltitudeForType("airport")` → `5000` (5 km)

---

## Phase 4: Command Bar UI Component

**Goal:** Build the visual command bar component (no command execution yet).

**Dependencies:** None (can run in parallel with Phases 1-3)

### Tasks

- [x] Create `src/ui/command-bar.ts`:
  - [x] `CommandBar` class with DOM structure
  - [x] `show()` / `hide()` methods
  - [x] Input field with `:` prefix
  - [x] Loading state indicator
  - [x] Error message display area
  - [x] Success flash animation
- [x] Add CSS styles to `public/styles.css`:
  - [x] `.command-bar` - Base container (400px wide, centered, 16px above bottom bar)
  - [x] `.command-bar.loading` - Pulsing border
  - [x] `.command-bar.error` - Red border and error text
  - [x] `.command-bar.success` - Green flash
- [x] Wire up basic keyboard handlers:
  - [x] Escape → close
  - [x] Click outside → close
  - [x] Enter → (placeholder for execution)

### Verification

```bash
# Start dev server
bun --hot src/server.ts &

# Open browser and use Playwright to verify
```

**Manual Browser Test (via Playwright):**
1. Navigate to `http://localhost:3000`
2. Press `:` → Command bar should appear at bottom center
3. Press `Escape` → Command bar should close
4. Press `:` again → Type "test" → Press `Enter` → Should show inline error "Unknown command"
5. Verify visual styling matches terminal aesthetic

---

## Phase 5: Command Parsing & Execution

**Goal:** Implement command parsing and wire up to geocoder.

**Dependencies:** Phase 3, Phase 4

### Tasks

- [x] Add to `src/ui/command-bar.ts`:
  - [x] `parseCommand(input: string): { type: 'goto' | 'home' | 'help'; args?: string } | null`
  - [x] `executeCommand(cmd)` - Dispatch to appropriate handler
  - [x] `handleGoto(location: string)` - Use geocoder, fly camera
  - [x] `handleHome()` - Call `flyTo()` from globe.ts (reset to 0°, 0°)
  - [x] `handleHelp()` - Display help text inline
- [x] Import and use `flyTo` from `src/globe.ts`
- [x] Import and use `geocode`, `getAltitudeForType` from `src/geocoder.ts`
- [x] Add navigation log entry to system log: `[NAV] Flying to <location>`

### Verification

```bash
bun test test/command-bar.test.ts
```

**Test Cases (unit tests for parseCommand):**
- `parseCommand("goto Tokyo")` → `{ type: "goto", args: "Tokyo" }`
- `parseCommand("home")` → `{ type: "home" }`
- `parseCommand("help")` → `{ type: "help" }`
- `parseCommand("invalid")` → `null`
- `parseCommand("")` → `null`

**Browser Integration Test (via Playwright):**
1. Press `:` and type `goto Tokyo` → Press `Enter`
2. Verify command bar shows "SEARCHING..." state
3. Verify camera flies to Tokyo
4. Verify system log shows `[NAV] Flying to Tokyo, Japan`
5. Press `:` and type `home` → Press `Enter`
6. Verify camera flies to 0°, 0°, 15,000km altitude

---

## Phase 6: Shell Integration & Keyboard Binding

**Goal:** Wire command bar into the main UI shell.

**Dependencies:** Phase 5

### Tasks

- [x] Modify `src/ui/shell.ts`:
  - [x] Import `CommandBar` from `./command-bar.ts`
  - [x] Instantiate `CommandBar` in `initShell()`
  - [x] Add `:` keydown handler in `initKeyboardShortcuts()`:
    - Check `isTypingInInput()` first
    - Prevent default
    - Call `commandBar.show()`
  - [x] Register escape handler with `addEscapeHandler()`
- [x] Ensure command bar doesn't conflict with other keyboard shortcuts

### Verification

```bash
# Run full application
bun --hot src/server.ts
```

**Browser Integration Test (via Playwright):**
1. Load application → Press `1` → Mode changes to NORMAL
2. Press `:` → Command bar opens, mode doesn't change
3. Press `:` while command bar is open → No effect (input receives the `:`)
4. Type in an input field elsewhere → Press `:` → Should type `:`, not open command bar
5. Open command bar → Press `Escape` → Bar closes
6. Verify all view mode shortcuts (1-6) still work when command bar is closed

---

## Phase 7: Error Handling & Edge Cases

**Goal:** Robust error handling for all failure modes.

**Dependencies:** Phase 6

### Tasks

- [x] Add error handling to `handleGoto()`:
  - [x] Network error → Show "Network error", log to system log
  - [x] Location not found → Show "Location not found", log to system log
  - [x] Invalid coordinates → Show "Invalid coordinates format"
  - [x] API timeout (5s) → Show "Request timed out"
- [x] Add to `parseCommand()`:
  - [x] `goto` with no args → Show "Usage: goto <location>"
  - [x] Unknown command → Show "Unknown command. Type :help"
- [x] Handle rapid command submission (debounce or disable input while loading)
- [x] Clean up any pending requests when command bar closes

### Verification

```bash
bun test test/command-bar.test.ts
```

**Browser Integration Tests (via Playwright):**
1. `:goto` (no args) → Shows "Usage: goto <location>"
2. `:goto asdfghjklzxcvbnm` → Shows "Location not found"
3. `:foo` → Shows "Unknown command. Type :help"
4. Disconnect network → `:goto Austin` → Shows "Network error"
5. Open bar → Type command → Close bar mid-request → No errors in console

---

## Phase 8: Final Integration & Polish

**Goal:** Final polish and comprehensive testing.

**Dependencies:** Phase 7

### Tasks

- [x] Add camera pitch (-45°) to flyTo calls
- [x] Verify 2-second animation duration
- [x] Test all coordinate format variations
- [x] Test airport code lookup (case insensitive)
- [x] Performance check: Command bar opens in <50ms
- [x] Test help display formatting
- [x] Add loading spinner or "SEARCHING..." text
- [x] Ensure proper focus management (focus returns to globe after command)

### Verification

```bash
# Run all tests
bun test

# Performance check script
bun run test/perf-command-bar.ts
```

**Full End-to-End Test Suite (via Playwright):**

| Test | Command | Expected Result |
|------|---------|-----------------|
| Place name | `:goto San Francisco` | Flies to SF, 50km altitude |
| Full address | `:goto 123 Main St, Austin TX` | Flies to address, 1km altitude |
| Zip code | `:goto 78701` | Flies to downtown Austin |
| Airport (IATA) | `:goto LAX` | Flies to LAX, 5km altitude |
| Decimal coords | `:goto 30.2672, -97.7431` | Flies to coords, 10km altitude |
| Directional coords | `:goto 30.2672N, 97.7431W` | Flies to coords |
| Signed coords | `:goto 30.2672 -97.7431` | Flies to coords |
| Home | `:home` | Flies to 0°, 0°, 15,000km |
| Help | `:help` | Shows command list inline |
| Invalid | `:goto xyzzy123` | Shows "Location not found" |
| Empty | (Enter with empty input) | Nothing happens, bar stays open |

---

## File Summary

### Files to Create

| File | Phase | Description |
|------|-------|-------------|
| `src/data/airports.json` | 1 | Airport code database |
| `src/geocoder.ts` | 1, 3 | Geocoding logic & API client |
| `src/ui/command-bar.ts` | 4, 5 | Command bar UI component |
| `test/geocoder.test.ts` | 1, 3 | Unit tests for geocoder |
| `test/command-bar.test.ts` | 5, 7 | Unit tests for command parsing |
| `test/perf-command-bar.ts` | 8 | Performance benchmark |

### Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/proxy.ts` | 2 | Add `/geocode` endpoint |
| `src/ui/shell.ts` | 6 | Add `:` key handler, init command bar |
| `public/styles.css` | 4 | Add command bar styles |

---

## Dependency Graph

```
Phase 1 ──────────────────┬──> Phase 3 ──────────┐
(Airports & Coords)       │    (Geocoder Client) │
                          │                      │
Phase 2 ──────────────────┘                      ├──> Phase 5 ──> Phase 6 ──> Phase 7 ──> Phase 8
(Proxy Endpoint)                                 │    (Commands)  (Shell)    (Errors)   (Polish)
                                                 │
Phase 4 ─────────────────────────────────────────┘
(UI Component)
```

**Parallel Work:**
- Phases 1, 2, and 4 can be developed in parallel
- All other phases are sequential

---

## Success Criteria

- [x] Command bar opens within 50ms of pressing `:` (verified: <1ms parsing, instant DOM show)
- [x] 95% of geocoding requests complete in <2s (API-dependent, local lookups instant)
- [x] All coordinate formats parse correctly (68 tests pass)
- [x] Airport codes resolve instantly (no API call) - verified with ~500 airports
- [x] Camera flies with 2-second animation at -45° pitch (added to flyTo)
- [x] All error states display appropriate messages (network, timeout, not found)
- [x] No console errors during normal operation
- [x] All tests pass: `bun test` (68 tests, 0 failures)
