/**
 * Verification script for FlightLayer Phase 2
 * Tests flight data parsing and filtering
 * Run with: bun scripts/flights-render-check.ts
 * Requires proxy server running on port 3001
 */

const PROXY_URL = "http://localhost:3001";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

interface FlightRecord {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  lastUpdate: number;
}

const results: TestResult[] = [];

function pass(name: string, message: string) {
  results.push({ name, passed: true, message });
  console.log(`PASS: ${name} - ${message}`);
}

function fail(name: string, message: string) {
  results.push({ name, passed: false, message });
  console.error(`FAIL: ${name} - ${message}`);
}

/**
 * Parse OpenSky state array into FlightRecord (same logic as flights.ts)
 */
function parseOpenSkyState(state: unknown[]): FlightRecord | null {
  const icao24 = state[0] as string | null;
  const callsign = state[1] as string | null;
  const longitude = state[5] as number | null;
  const latitude = state[6] as number | null;
  const baroAltitude = state[7] as number | null;
  const onGround = state[8] as boolean;
  const velocity = state[9] as number | null;
  const trueTrack = state[10] as number | null;
  const verticalRate = state[11] as number | null;

  // Filter out records with missing critical data
  if (!icao24 || longitude === null || latitude === null) {
    return null;
  }

  // Filter out aircraft on ground
  if (onGround === true) {
    return null;
  }

  return {
    icao24: icao24,
    callsign: callsign?.trim() ?? "",
    longitude: longitude,
    latitude: latitude,
    altitude: baroAltitude ?? 0,
    velocity: velocity ?? 0,
    heading: trueTrack ?? 0,
    verticalRate: verticalRate ?? 0,
    onGround: onGround,
    lastUpdate: Date.now(),
  };
}

// Test 1: Response parses to array of FlightRecords
async function testParseResponse(): Promise<FlightRecord[]> {
  const name = "Response parses to array";
  try {
    const response = await fetch(`${PROXY_URL}/flights`);
    if (!response.ok) {
      fail(name, `HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.states || !Array.isArray(data.states)) {
      fail(name, "Response missing 'states' array");
      return [];
    }

    const records: FlightRecord[] = [];
    for (const state of data.states) {
      const record = parseOpenSkyState(state);
      if (record) {
        records.push(record);
      }
    }

    pass(name, `Parsed ${records.length} flight records from ${data.states.length} states`);
    return records;
  } catch (error) {
    fail(name, `Request failed: ${error}`);
    return [];
  }
}

// Test 2: At least one record has non-null lat/lon/altitude/heading
function testHasValidRecord(records: FlightRecord[]) {
  const name = "Has record with valid lat/lon/altitude/heading";

  const validRecord = records.find(
    (r) =>
      r.latitude !== null &&
      r.longitude !== null &&
      r.altitude !== null &&
      r.heading !== null
  );

  if (validRecord) {
    pass(
      name,
      `Found valid record: ${validRecord.icao24} at (${validRecord.latitude.toFixed(2)}, ${validRecord.longitude.toFixed(2)}) alt=${validRecord.altitude}m heading=${validRecord.heading}°`
    );
  } else {
    fail(name, "No records with valid lat/lon/altitude/heading");
  }
}

// Test 3: No record has onGround === true
function testNoGroundedAircraft(records: FlightRecord[]) {
  const name = "No records with onGround === true";

  const groundedRecord = records.find((r) => r.onGround === true);

  if (groundedRecord) {
    fail(name, `Found grounded aircraft: ${groundedRecord.icao24}`);
  } else {
    pass(name, "All records are airborne");
  }
}

// Test 4: All icao24 values are non-empty strings
function testIcao24Values(records: FlightRecord[]) {
  const name = "All icao24 values are non-empty strings";

  const invalidRecord = records.find(
    (r) => typeof r.icao24 !== "string" || r.icao24.length === 0
  );

  if (invalidRecord) {
    fail(name, `Found invalid icao24: ${JSON.stringify(invalidRecord.icao24)}`);
  } else {
    pass(name, `All ${records.length} records have valid icao24`);
  }
}

// Run all tests
async function main() {
  console.log("=== Flight Render Check Tests ===\n");

  const records = await testParseResponse();

  if (records.length === 0) {
    console.log("\nNo records to test - skipping remaining checks");
    process.exit(1);
  }

  testHasValidRecord(records);
  testNoGroundedAircraft(records);
  testIcao24Values(records);

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);

  if (passed < total) {
    process.exit(1);
  }
}

main();
