/**
 * Smoke test for OpenSky flight proxy endpoints
 * Run with: bun scripts/flights-proxy-smoke.ts
 * Requires proxy server running on port 3001
 */

const PROXY_URL = "http://localhost:3001";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
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

// Test 1: GET /flights returns 200 with states array
async function testFlightsEndpoint() {
  const name = "GET /flights";
  try {
    const response = await fetch(`${PROXY_URL}/flights`);
    if (response.status !== 200) {
      fail(name, `Expected HTTP 200, got ${response.status}`);
      return;
    }
    const data = await response.json();
    if (!data.states || !Array.isArray(data.states)) {
      fail(name, `Response missing 'states' array`);
      return;
    }
    pass(name, `HTTP 200, received ${data.states.length} flight states`);
  } catch (error) {
    fail(name, `Request failed: ${error}`);
  }
}

// Test 2: GET /aircraft-meta/:icao24 returns 200 or 404 (not 5xx)
async function testAircraftMetaEndpoint() {
  const name = "GET /aircraft-meta/:icao24";
  const testIcao = "a0b1c2";
  try {
    const response = await fetch(`${PROXY_URL}/aircraft-meta/${testIcao}`);
    if (response.status === 200 || response.status === 404) {
      pass(name, `HTTP ${response.status} (acceptable)`);
    } else if (response.status >= 500) {
      fail(name, `Expected 200 or 404, got server error ${response.status}`);
    } else {
      pass(name, `HTTP ${response.status} (non-5xx)`);
    }
  } catch (error) {
    fail(name, `Request failed: ${error}`);
  }
}

// Test 3: GET /flights again with response time check
async function testFlightsResponseTime() {
  const name = "GET /flights response time";
  try {
    const start = performance.now();
    const response = await fetch(`${PROXY_URL}/flights`);
    const elapsed = performance.now() - start;
    
    if (response.status !== 200) {
      fail(name, `Expected HTTP 200, got ${response.status}`);
      return;
    }
    
    if (elapsed > 3000) {
      fail(name, `Response took ${Math.round(elapsed)}ms (exceeds 3s limit)`);
      return;
    }
    
    pass(name, `Response in ${Math.round(elapsed)}ms`);
  } catch (error) {
    fail(name, `Request failed: ${error}`);
  }
}

// Run all tests
async function main() {
  console.log("=== OpenSky Flight Proxy Smoke Tests ===\n");
  
  await testFlightsEndpoint();
  await testAircraftMetaEndpoint();
  await testFlightsResponseTime();
  
  console.log("\n=== Summary ===");
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);
  
  if (passed < total) {
    process.exit(1);
  }
}

main();
