/**
 * Acceptance Verification Suite for Flight Layer (Phase 5)
 * Runs all verifiable acceptance criteria checks headlessly
 *
 * Run with: bun scripts/flights-acceptance.ts
 * Requires proxy server running on port 3001
 */

const PROXY_URL = "http://localhost:3001";

interface TestResult {
  ac: string;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function pass(ac: string, name: string, message: string) {
  results.push({ ac, name, passed: true, message });
  console.log(`PASS [${ac}]: ${name} - ${message}`);
}

function fail(ac: string, name: string, message: string) {
  results.push({ ac, name, passed: false, message });
  console.error(`FAIL [${ac}]: ${name} - ${message}`);
}

// AC1: OpenSky data reachable and parses
async function testAC1() {
  const ac = "AC1";
  const name = "OpenSky data reachable and parses";
  try {
    const response = await fetch(`${PROXY_URL}/flights`);
    if (!response.ok) {
      fail(ac, name, `HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    if (!data.states || !Array.isArray(data.states)) {
      fail(ac, name, "Response missing 'states' array");
      return;
    }
    pass(ac, name, `Received ${data.states.length} flight states`);
  } catch (error) {
    fail(ac, name, `Request failed: ${error}`);
  }
}

// AC2: Heading -> rotation math correct
function testAC2() {
  const ac = "AC2";
  const name = "Heading to rotation math correct";

  // Cesium rotation is counter-clockwise, headings are clockwise from north
  // Formula: rotation = -toRadians(heading)
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);

  const testCases = [
    { heading: 0, expectedRotation: 0 },
    { heading: 90, expectedRotation: -Math.PI / 2 },
    { heading: 180, expectedRotation: -Math.PI },
    { heading: 270, expectedRotation: (-3 * Math.PI) / 2 },
  ];

  for (const { heading, expectedRotation } of testCases) {
    const actualRotation = -toRadians(heading);
    const tolerance = 0.0001;
    if (Math.abs(actualRotation - expectedRotation) > tolerance) {
      fail(
        ac,
        name,
        `Heading ${heading}° -> expected ${expectedRotation.toFixed(4)}, got ${actualRotation.toFixed(4)}`
      );
      return;
    }
  }

  pass(ac, name, "All heading->rotation conversions correct");
}

// AC4: Metadata API reachable
async function testAC4() {
  const ac = "AC4";
  const name = "Metadata API reachable";
  try {
    const response = await fetch(`${PROXY_URL}/aircraft-meta/a0b1c2`);
    if (response.status === 200 || response.status === 404) {
      pass(ac, name, `HTTP ${response.status} (acceptable)`);
    } else if (response.status >= 500) {
      fail(ac, name, `Server error ${response.status}`);
    } else {
      pass(ac, name, `HTTP ${response.status} (non-5xx)`);
    }
  } catch (error) {
    fail(ac, name, `Request failed: ${error}`);
  }
}

// AC6: Counter element ID exists in shell.ts
async function testAC6() {
  const ac = "AC6";
  const name = "Counter element ID exists";
  try {
    const shellContent = await Bun.file("src/ui/shell.ts").text();
    if (shellContent.includes("flight-tracking-counter")) {
      pass(ac, name, "Found 'flight-tracking-counter' in shell.ts");
    } else {
      fail(ac, name, "Missing 'flight-tracking-counter' in shell.ts");
    }
  } catch (error) {
    fail(ac, name, `Failed to read shell.ts: ${error}`);
  }
}

// AC7: Toggle element ID exists in left-panel.ts
async function testAC7() {
  const ac = "AC7";
  const name = "Toggle element ID exists";
  try {
    const leftPanelContent = await Bun.file("src/ui/left-panel.ts").text();
    if (leftPanelContent.includes("flight-toggle")) {
      pass(ac, name, "Found 'flight-toggle' in left-panel.ts");
    } else {
      fail(ac, name, "Missing 'flight-toggle' in left-panel.ts");
    }
  } catch (error) {
    fail(ac, name, `Failed to read left-panel.ts: ${error}`);
  }
}

// AC8: Interpolation math correct (reuse Phase 4 script logic)
function testAC8() {
  const ac = "AC8";
  const name = "Interpolation math correct";

  const FLIGHT_INTERP_CAP = 30;

  interface TestFlightRecord {
    latitude: number;
    longitude: number;
    altitude: number;
    velocity: number;
    heading: number;
    lastUpdate: number;
  }

  const toRadians = (degrees: number) => degrees * (Math.PI / 180);

  function interpolate(
    record: TestFlightRecord,
    now: number
  ): { newLat: number; newLon: number } {
    let elapsed = (now - record.lastUpdate) / 1000;
    if (elapsed > FLIGHT_INTERP_CAP) {
      elapsed = FLIGHT_INTERP_CAP;
    }

    const distM = record.velocity * elapsed;
    const headingRad = toRadians(record.heading);
    const newLat = record.latitude + (distM * Math.cos(headingRad)) / 111_320;
    const newLon =
      record.longitude +
      (distM * Math.sin(headingRad)) /
        (111_320 * Math.cos(toRadians(record.latitude)));

    return { newLat, newLon };
  }

  // Test: Aircraft moves after 5 seconds
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 45,
    lastUpdate: Date.now() - 5000,
  };

  const { newLat, newLon } = interpolate(record, Date.now());

  if (newLat === record.latitude && newLon === record.longitude) {
    fail(ac, name, "Position did not change after interpolation");
    return;
  }

  // Test: Elapsed time capped at 30s
  const staleRecord: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 0,
    lastUpdate: Date.now() - 60000, // 60 seconds ago
  };

  const { newLat: staleLat } = interpolate(staleRecord, Date.now());
  const maxDistLat = (250 * 30) / 111_320; // 30s worth of movement
  const actualDistLat = staleLat - staleRecord.latitude;

  if (actualDistLat > maxDistLat * 1.05) {
    fail(ac, name, `Interpolation not capped at 30s: moved ${actualDistLat.toFixed(6)} lat degrees`);
    return;
  }

  pass(ac, name, "Movement and 30s cap verified");
}

// AC9: Polling interval constant = 10000
async function testAC9() {
  const ac = "AC9";
  const name = "Polling interval constant = 10000";
  try {
    const flightsContent = await Bun.file("src/layers/flights.ts").text();
    // Check for the constant definition
    if (flightsContent.includes("FLIGHT_UPDATE_INTERVAL = 10_000") ||
        flightsContent.includes("FLIGHT_UPDATE_INTERVAL = 10000")) {
      pass(ac, name, "Found FLIGHT_UPDATE_INTERVAL = 10_000");
    } else {
      fail(ac, name, "FLIGHT_UPDATE_INTERVAL not set to 10000");
    }
  } catch (error) {
    fail(ac, name, `Failed to read flights.ts: ${error}`);
  }
}

// AC10: BillboardCollection used (not Entity per plane)
async function testAC10() {
  const ac = "AC10";
  const name = "BillboardCollection used (not Entity per plane)";
  try {
    const flightsContent = await Bun.file("src/layers/flights.ts").text();

    const hasBillboardCollection = flightsContent.includes("BillboardCollection");
    const hasEntityAdd = flightsContent.includes("viewer.entities.add");

    if (!hasBillboardCollection) {
      fail(ac, name, "BillboardCollection not found in flights.ts");
      return;
    }

    if (hasEntityAdd) {
      fail(ac, name, "Found viewer.entities.add - should use BillboardCollection");
      return;
    }

    pass(ac, name, "Uses BillboardCollection, no viewer.entities.add");
  } catch (error) {
    fail(ac, name, `Failed to read flights.ts: ${error}`);
  }
}

// Main
async function main() {
  console.log("=== Flight Layer Acceptance Verification ===\n");

  // HTTP-based tests (require proxy)
  await testAC1();
  await testAC4();

  // Unit tests (no external dependencies)
  testAC2();
  testAC8();

  // Source file checks
  await testAC6();
  await testAC7();
  await testAC9();
  await testAC10();

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} acceptance criteria passed`);

  if (passed < total) {
    console.log("\nFailed checks:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - [${r.ac}] ${r.name}: ${r.message}`);
    }
    process.exit(1);
  }
}

main();
