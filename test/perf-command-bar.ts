/**
 * Performance test for Command Bar utilities
 * Run with: bun run test/perf-command-bar.ts
 * 
 * This is a simple benchmark - not a unit test.
 * Tests that geocoding operations complete within acceptable time.
 */

// Performance thresholds (in ms)
const THRESHOLDS = {
  lookupAirport: 1,  // Airport lookup should be <1ms
  parseCoords: 1,    // Coordinate parsing should be <1ms
};

// Import test functions
import { lookupAirport, parseCoordinates } from "../src/utils/geocoder";

function measure(name: string, fn: () => void, iterations = 1000): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;
  return perOp;
}

console.log("Geocoder Performance Test\n" + "=".repeat(40) + "\n");

// Test lookupAirport performance
const airportTime = measure("lookupAirport", () => {
  lookupAirport("LAX");
  lookupAirport("JFK");
  lookupAirport("SFO");
  lookupAirport("XXX");
});

console.log(`lookupAirport: ${airportTime.toFixed(3)}ms per operation`);
if (airportTime > THRESHOLDS.lookupAirport) {
  console.log(`  WARNING: Exceeds threshold of ${THRESHOLDS.lookupAirport}ms`);
} else {
  console.log(`  PASS: Within threshold of ${THRESHOLDS.lookupAirport}ms`);
}

// Test parseCoordinates performance
const coordsTime = measure("parseCoordinates", () => {
  parseCoordinates("30.2672, -97.7431");
  parseCoordinates("30.2672N, 97.7431W");
  parseCoordinates("30.2672 -97.7431");
  parseCoordinates("invalid");
});

console.log(`\nparseCoordinates: ${coordsTime.toFixed(3)}ms per operation`);
if (coordsTime > THRESHOLDS.parseCoords) {
  console.log(`  WARNING: Exceeds threshold of ${THRESHOLDS.parseCoords}ms`);
} else {
  console.log(`  PASS: Within threshold of ${THRESHOLDS.parseCoords}ms`);
}

// Summary
console.log("\n" + "=".repeat(40));
const allPass = 
  airportTime <= THRESHOLDS.lookupAirport &&
  coordsTime <= THRESHOLDS.parseCoords;

if (allPass) {
  console.log("All performance tests PASSED");
} else {
  console.log("Some performance tests FAILED");
  process.exit(1);
}
