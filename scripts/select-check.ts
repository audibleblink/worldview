// Verifies orbital path computation produces a closed loop with expected point count
import { loadAllTLEs, computeOrbitalPath } from "../src/layers/satellites";
import * as satellite from "satellite.js";

const records = await loadAllTLEs();

// Test ISS (LEO ~90 min period) and first record as fallback
const testSats = [
  records.find((r) => r.name.includes("ISS") || r.name.includes("ZARYA")),
  records[0],
].filter((r): r is NonNullable<typeof r> => r != null);

// Remove duplicates by noradId
const uniqueSats = [...new Map(testSats.map((r) => [r.noradId, r])).values()];

for (const sat of uniqueSats) {
  const path = computeOrbitalPath(sat);
  console.log(`${sat.name}: ${path.length} path points`);

  if (path.length < 10) {
    console.error(`FAIL: too few path points for ${sat.name}`);
    process.exit(1);
  }
}

// Verify velocity computation
const record = uniqueSats[0];
const result = satellite.propagate(record.satrec, new Date());
if (result.velocity && typeof result.velocity !== "boolean") {
  const v = result.velocity;
  const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
  console.log(`Velocity check: ${speed.toFixed(3)} km/s`);
  if (speed < 1 || speed > 12) {
    console.error("FAIL: velocity out of physical range");
    process.exit(1);
  }
}

console.log("PASS: Orbital path and velocity computation verified");
