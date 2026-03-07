/**
 * Verification script for Phase 4: Position Interpolation
 * Tests the dead-reckoning interpolation math used in FlightLayer
 */

const FLIGHT_INTERP_CAP = 30; // seconds max dead-reckoning

interface TestFlightRecord {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number; // m/s
  heading: number; // degrees
  lastUpdate: number;
}

/**
 * Haversine distance between two points in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Interpolation math exactly as implemented in FlightLayer
 */
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
  const newLat =
    record.latitude + (distM * Math.cos(headingRad)) / 111_320;
  const newLon =
    record.longitude +
    (distM * Math.sin(headingRad)) /
      (111_320 * Math.cos(toRadians(record.latitude)));

  return { newLat, newLon };
}

let allPassed = true;

function test(name: string, fn: () => boolean): void {
  const result = fn();
  console.log(`${result ? "PASS" : "FAIL"}: ${name}`);
  if (!result) allPassed = false;
}

// Test 1: Aircraft moves after 5 seconds
test("Aircraft position changes after 5 seconds", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250, // ~250 m/s ≈ 485 knots
    heading: 45, // Northeast
    lastUpdate: Date.now() - 5000, // 5 seconds ago
  };

  const now = Date.now();
  const { newLat, newLon } = interpolate(record, now);

  // Position should differ from original
  return newLat !== record.latitude || newLon !== record.longitude;
});

// Test 2: Movement distance approximately equals velocity * time
test("Movement distance ≈ velocity × 5 seconds (within 5% tolerance)", () => {
  const velocity = 250; // m/s
  const elapsed = 5; // seconds
  const expectedDistance = velocity * elapsed; // 1250 meters

  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity,
    heading: 0, // Due North for simplicity
    lastUpdate: Date.now() - elapsed * 1000,
  };

  const now = Date.now();
  const { newLat, newLon } = interpolate(record, now);

  const actualDistance = haversineDistance(
    record.latitude,
    record.longitude,
    newLat,
    newLon
  );

  const tolerance = 0.05; // 5%
  const lowerBound = expectedDistance * (1 - tolerance);
  const upperBound = expectedDistance * (1 + tolerance);

  console.log(
    `  Expected: ${expectedDistance.toFixed(2)}m, Actual: ${actualDistance.toFixed(2)}m`
  );

  return actualDistance >= lowerBound && actualDistance <= upperBound;
});

// Test 3: Different headings produce different directions
test("Heading 0° (North) increases latitude", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 0, // Due North
    lastUpdate: Date.now() - 5000,
  };

  const now = Date.now();
  const { newLat } = interpolate(record, now);

  return newLat > record.latitude;
});

test("Heading 90° (East) increases longitude", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 90, // Due East
    lastUpdate: Date.now() - 5000,
  };

  const now = Date.now();
  const { newLon } = interpolate(record, now);

  return newLon > record.longitude;
});

test("Heading 180° (South) decreases latitude", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 180, // Due South
    lastUpdate: Date.now() - 5000,
  };

  const now = Date.now();
  const { newLat } = interpolate(record, now);

  return newLat < record.latitude;
});

test("Heading 270° (West) decreases longitude", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 250,
    heading: 270, // Due West
    lastUpdate: Date.now() - 5000,
  };

  const now = Date.now();
  const { newLon } = interpolate(record, now);

  return newLon < record.longitude;
});

// Test 4: Elapsed time capped at 30 seconds
test("Elapsed time capped at 30s for stale data (60s ago)", () => {
  const velocity = 250; // m/s
  const maxDistance = velocity * FLIGHT_INTERP_CAP; // 7500 meters

  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity,
    heading: 0,
    lastUpdate: Date.now() - 60000, // 60 seconds ago (stale)
  };

  const now = Date.now();
  const { newLat, newLon } = interpolate(record, now);

  const actualDistance = haversineDistance(
    record.latitude,
    record.longitude,
    newLat,
    newLon
  );

  console.log(
    `  Max allowed: ${maxDistance.toFixed(2)}m, Actual: ${actualDistance.toFixed(2)}m`
  );

  // Should be capped at 30s worth of distance (with small tolerance for float precision)
  return actualDistance <= maxDistance * 1.05;
});

// Test 5: Zero velocity means no movement
test("Zero velocity results in no position change", () => {
  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity: 0,
    heading: 45,
    lastUpdate: Date.now() - 5000,
  };

  const now = Date.now();
  const { newLat, newLon } = interpolate(record, now);

  return newLat === record.latitude && newLon === record.longitude;
});

// Test 6: Very recent update means minimal movement
test("Recent update (100ms ago) produces minimal movement", () => {
  const velocity = 250;
  const elapsed = 0.1; // 100ms
  const expectedDistance = velocity * elapsed; // 25 meters

  const record: TestFlightRecord = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 10000,
    velocity,
    heading: 0,
    lastUpdate: Date.now() - 100,
  };

  const now = Date.now();
  const { newLat, newLon } = interpolate(record, now);

  const actualDistance = haversineDistance(
    record.latitude,
    record.longitude,
    newLat,
    newLon
  );

  // Should be approximately 25m (with tolerance)
  return actualDistance < expectedDistance * 1.5 && actualDistance > expectedDistance * 0.5;
});

// Summary
console.log("---");
if (allPassed) {
  console.log("All interpolation tests PASSED");
  process.exit(0);
} else {
  console.log("Some interpolation tests FAILED");
  process.exit(1);
}
