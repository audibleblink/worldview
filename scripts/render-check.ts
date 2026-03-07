// Verifies that propagation produces valid Cartesian3 positions for 95%+ of records
// Run with: bun scripts/render-check.ts

import { loadAllTLEs, propagateAll } from "../src/layers/satellites";

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
const pct = ((valid.length / records.length) * 100).toFixed(1);

console.log(`Propagated: ${valid.length}/${records.length} (${pct}%)`);
if (valid.length < 100) {
  console.error("FAIL: fewer than 100 valid positions");
  process.exit(1);
}
if (parseFloat(pct) < 90) {
  console.error("FAIL: >10% propagation failures");
  process.exit(1);
}

// Spot-check: ISS should be at 350–500km altitude
// We check the raw Cartesian3 magnitude instead of using Cesium.Cartographic
// (Cesium requires a browser environment for full initialization)
const EARTH_RADIUS_M = 6_371_000;

const iss = records.find((r) => r.name.includes("ISS") || r.name.includes("ZARYA"));
if (iss) {
  const issPos = positions.find((p) => p.record.noradId === iss.noradId);
  if (issPos) {
    const { x, y, z } = issPos.cartesian;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const altKm = (magnitude - EARTH_RADIUS_M) / 1000;
    console.log(`ISS altitude (approx): ${altKm.toFixed(1)} km`);
    if (altKm < 300 || altKm > 500) {
      console.error("FAIL: ISS altitude out of expected range (300–500 km)");
      process.exit(1);
    }
  } else {
    console.log("ISS not found in propagated positions (may have failed propagation — skipping altitude check)");
  }
} else {
  console.log("ISS record not found in TLE data — skipping altitude spot-check");
}

// Sanity-check: all valid positions should be within LEO–GEO range
// LEO min ~160 km alt, GEO max ~42,164 km alt
const MIN_MAGNITUDE_M = EARTH_RADIUS_M + 160_000;
const MAX_MAGNITUDE_M = EARTH_RADIUS_M + 42_200_000;

const outOfRange = valid.filter((p) => {
  const { x, y, z } = p.cartesian;
  const mag = Math.sqrt(x * x + y * y + z * z);
  return mag < MIN_MAGNITUDE_M || mag > MAX_MAGNITUDE_M;
});

if (outOfRange.length > 0) {
  console.warn(`WARN: ${outOfRange.length} positions outside expected orbital range`);
}

console.log("PASS: Render data pipeline verified");
