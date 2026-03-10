/**
 * Flight Layer Tests
 * Tests interpolation math, heading conversion, and data parsing
 */

import { test, expect, describe } from "bun:test";

const FLIGHT_INTERP_CAP = 30; // seconds max dead-reckoning

interface TestFlightRecord {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number; // m/s
  heading: number; // degrees
  lastUpdate: number;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

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

describe("Flight Interpolation", () => {
  test("aircraft position changes after 5 seconds", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 250,
      heading: 45,
      lastUpdate: Date.now() - 5000,
    };

    const { newLat, newLon } = interpolate(record, Date.now());

    expect(newLat !== record.latitude || newLon !== record.longitude).toBe(true);
  });

  test("movement distance ≈ velocity × time (within 5%)", () => {
    const velocity = 250;
    const elapsed = 5;
    const expectedDistance = velocity * elapsed;

    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity,
      heading: 0,
      lastUpdate: Date.now() - elapsed * 1000,
    };

    const { newLat, newLon } = interpolate(record, Date.now());
    const actualDistance = haversineDistance(
      record.latitude,
      record.longitude,
      newLat,
      newLon
    );

    expect(actualDistance).toBeGreaterThan(expectedDistance * 0.95);
    expect(actualDistance).toBeLessThan(expectedDistance * 1.05);
  });

  test("heading 0° (North) increases latitude", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 250,
      heading: 0,
      lastUpdate: Date.now() - 5000,
    };

    const { newLat } = interpolate(record, Date.now());
    expect(newLat).toBeGreaterThan(record.latitude);
  });

  test("heading 90° (East) increases longitude", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      lastUpdate: Date.now() - 5000,
    };

    const { newLon } = interpolate(record, Date.now());
    expect(newLon).toBeGreaterThan(record.longitude);
  });

  test("heading 180° (South) decreases latitude", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 250,
      heading: 180,
      lastUpdate: Date.now() - 5000,
    };

    const { newLat } = interpolate(record, Date.now());
    expect(newLat).toBeLessThan(record.latitude);
  });

  test("heading 270° (West) decreases longitude", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 250,
      heading: 270,
      lastUpdate: Date.now() - 5000,
    };

    const { newLon } = interpolate(record, Date.now());
    expect(newLon).toBeLessThan(record.longitude);
  });

  test("elapsed time capped at 30s for stale data", () => {
    const velocity = 250;
    const maxDistance = velocity * FLIGHT_INTERP_CAP;

    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity,
      heading: 0,
      lastUpdate: Date.now() - 60000, // 60 seconds ago
    };

    const { newLat, newLon } = interpolate(record, Date.now());
    const actualDistance = haversineDistance(
      record.latitude,
      record.longitude,
      newLat,
      newLon
    );

    expect(actualDistance).toBeLessThan(maxDistance * 1.05);
  });

  test("zero velocity results in no position change", () => {
    const record: TestFlightRecord = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 10000,
      velocity: 0,
      heading: 45,
      lastUpdate: Date.now() - 5000,
    };

    const { newLat, newLon } = interpolate(record, Date.now());

    expect(newLat).toBe(record.latitude);
    expect(newLon).toBe(record.longitude);
  });
});

describe("Heading to Rotation", () => {
  test("heading conversions are correct", () => {
    const testCases = [
      { heading: 0, expectedRotation: 0 },
      { heading: 90, expectedRotation: -Math.PI / 2 },
      { heading: 180, expectedRotation: -Math.PI },
      { heading: 270, expectedRotation: (-3 * Math.PI) / 2 },
    ];

    for (const { heading, expectedRotation } of testCases) {
      const actualRotation = -toRadians(heading);
      expect(Math.abs(actualRotation - expectedRotation)).toBeLessThan(0.0001);
    }
  });
});

describe("OpenSky Data Parsing", () => {
  function parseOpenSkyState(state: unknown[]): Record<string, unknown> | null {
    const icao24 = state[0] as string | null;
    const callsign = state[1] as string | null;
    const longitude = state[5] as number | null;
    const latitude = state[6] as number | null;
    const baroAltitude = state[7] as number | null;
    const onGround = state[8] as boolean;
    const velocity = state[9] as number | null;
    const trueTrack = state[10] as number | null;
    const verticalRate = state[11] as number | null;

    if (!icao24 || longitude === null || latitude === null) {
      return null;
    }

    if (onGround === true) {
      return null;
    }

    return {
      icao24,
      callsign: callsign?.trim() ?? "",
      longitude,
      latitude,
      altitude: baroAltitude ?? 0,
      velocity: velocity ?? 0,
      heading: trueTrack ?? 0,
      verticalRate: verticalRate ?? 0,
      onGround,
    };
  }

  test("filters out records with missing critical data", () => {
    const invalidState = [null, "UAL123", "USA", 0, 0, null, null, 10000, false, 250, 90, 0];
    expect(parseOpenSkyState(invalidState)).toBeNull();
  });

  test("filters out aircraft on ground", () => {
    const groundedState = ["a0b1c2", "UAL123", "USA", 0, 0, -74.0, 40.0, 0, true, 0, 0, 0];
    expect(parseOpenSkyState(groundedState)).toBeNull();
  });

  test("parses valid airborne aircraft", () => {
    const validState = ["a0b1c2", "UAL123", "USA", 0, 0, -74.0, 40.0, 10000, false, 250, 90, 5];
    const result = parseOpenSkyState(validState);
    
    expect(result).not.toBeNull();
    expect(result?.icao24).toBe("a0b1c2");
    expect(result?.callsign).toBe("UAL123");
    expect(result?.latitude).toBe(40.0);
    expect(result?.longitude).toBe(-74.0);
    expect(result?.onGround).toBe(false);
  });
});
