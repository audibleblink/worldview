/**
 * Integration Tests
 * These tests require the proxy server to be running on port 3001
 * Run with: mise run test:integration (after starting the server)
 */

import { test, expect, describe, beforeAll } from "bun:test";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

// Check if server is available
let serverAvailable = false;

beforeAll(async () => {
  try {
    const response = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(2000) });
    serverAvailable = response.ok;
  } catch {
    serverAvailable = false;
  }
  
  if (!serverAvailable) {
    console.log("⚠️  Proxy server not available - skipping integration tests");
    console.log("   Start the server with: mise run server");
  }
});

describe("Proxy Server Endpoints", () => {
  test.skipIf(!serverAvailable)("GET /health returns ok", async () => {
    const response = await fetch(`${PROXY_URL}/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  test.skipIf(!serverAvailable)("GET /flights returns states array", async () => {
    const response = await fetch(`${PROXY_URL}/flights`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.states).toBeDefined();
    expect(Array.isArray(data.states)).toBe(true);
  });

  test.skipIf(!serverAvailable)("GET /flights responds within 3 seconds", async () => {
    const start = performance.now();
    const response = await fetch(`${PROXY_URL}/flights`);
    const elapsed = performance.now() - start;
    
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(3000);
  });

  test.skipIf(!serverAvailable)("GET /tle?group=stations returns TLE data", async () => {
    const response = await fetch(`${PROXY_URL}/tle?group=stations`);
    expect(response.status).toBe(200);
    
    const body = await response.text();
    // TLE data should contain ISS or have TLE format markers
    expect(body.includes("ISS") || body.includes("1 ")).toBe(true);
  });

  test.skipIf(!serverAvailable)("GET /aircraft-meta/:icao24 returns 200 or 404", async () => {
    const response = await fetch(`${PROXY_URL}/aircraft-meta/a0b1c2`);
    // 200 = found, 404 = not found (both acceptable)
    expect([200, 404]).toContain(response.status);
  });

  test.skipIf(!serverAvailable)("GET /api/cctv/cameras returns array", async () => {
    const response = await fetch(`${PROXY_URL}/api/cctv/cameras`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test.skipIf(!serverAvailable)("GET /api/stats returns cache statistics", async () => {
    const response = await fetch(`${PROXY_URL}/api/stats`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.tle).toBeDefined();
    expect(data.flights).toBeDefined();
  });

  test.skipIf(!serverAvailable)("CORS headers are present", async () => {
    const response = await fetch(`${PROXY_URL}/health`);
    const corsHeader = response.headers.get("Access-Control-Allow-Origin");
    
    expect(corsHeader).toBe("*");
  });
});

describe("TLE Data Pipeline", () => {
  test.skipIf(!serverAvailable)("TLE fetch returns 100+ records", async () => {
    // Import dynamically to avoid issues when module has side effects
    const { loadAllTLEs } = await import("../../layers/satellites");
    
    const records = await loadAllTLEs();
    expect(records.length).toBeGreaterThan(100);
  });

  test.skipIf(!serverAvailable)("TLE records have required fields", async () => {
    const { loadAllTLEs } = await import("../../layers/satellites");
    
    const records = await loadAllTLEs();
    const valid = records.every(r => r.satrec && r.noradId && r.name);
    
    expect(valid).toBe(true);
  });

  test.skipIf(!serverAvailable)("propagateAll produces 90%+ valid positions", async () => {
    const { loadAllTLEs, propagateAll } = await import("../../layers/satellites");
    
    const records = await loadAllTLEs();
    const positions = propagateAll(records, new Date());
    
    const valid = positions.filter(
      (p) =>
        p.cartesian &&
        !isNaN(p.cartesian.x) &&
        !isNaN(p.cartesian.y) &&
        !isNaN(p.cartesian.z) &&
        p.cartesian.x !== 0 &&
        p.cartesian.y !== 0
    );
    
    const pct = (valid.length / records.length) * 100;
    expect(pct).toBeGreaterThan(90);
  });
});

describe("Flight Data Parsing", () => {
  interface FlightRecord {
    icao24: string;
    callsign: string;
    longitude: number;
    latitude: number;
    altitude: number;
    onGround: boolean;
  }

  function parseOpenSkyState(state: unknown[]): FlightRecord | null {
    const icao24 = state[0] as string | null;
    const callsign = state[1] as string | null;
    const longitude = state[5] as number | null;
    const latitude = state[6] as number | null;
    const baroAltitude = state[7] as number | null;
    const onGround = state[8] as boolean;

    if (!icao24 || longitude === null || latitude === null) return null;
    if (onGround === true) return null;

    return {
      icao24,
      callsign: callsign?.trim() ?? "",
      longitude,
      latitude,
      altitude: baroAltitude ?? 0,
      onGround,
    };
  }

  test.skipIf(!serverAvailable)("parses flight states correctly", async () => {
    const response = await fetch(`${PROXY_URL}/flights`);
    const data = await response.json();
    
    expect(data.states).toBeDefined();
    
    const records: FlightRecord[] = [];
    for (const state of data.states) {
      const record = parseOpenSkyState(state);
      if (record) records.push(record);
    }
    
    expect(records.length).toBeGreaterThan(0);
  });

  test.skipIf(!serverAvailable)("parsed records have valid coordinates", async () => {
    const response = await fetch(`${PROXY_URL}/flights`);
    const data = await response.json();
    
    const records: FlightRecord[] = [];
    for (const state of data.states) {
      const record = parseOpenSkyState(state);
      if (record) records.push(record);
    }
    
    const validRecord = records.find(
      (r) => r.latitude !== null && r.longitude !== null
    );
    
    expect(validRecord).toBeDefined();
  });

  test.skipIf(!serverAvailable)("no parsed records are on ground", async () => {
    const response = await fetch(`${PROXY_URL}/flights`);
    const data = await response.json();
    
    const records: FlightRecord[] = [];
    for (const state of data.states) {
      const record = parseOpenSkyState(state);
      if (record) records.push(record);
    }
    
    const groundedRecord = records.find((r) => r.onGround === true);
    expect(groundedRecord).toBeUndefined();
  });
});
