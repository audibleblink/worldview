import * as satellite from "satellite.js";

// ISS TLE (well-known, stable for testing shape of output)
const line1 = "1 25544U 98067A   24001.00000000  .00001234  00000-0  23456-4 0  9990";
const line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50000000000000";

const satrec = satellite.twoline2satrec(line1, line2);
const now = new Date();
const result = satellite.propagate(satrec, now);

if (!result.position || typeof result.position === "boolean") {
  console.error("FAIL: propagate returned no position");
  process.exit(1);
}

const gmst = satellite.gstime(now);
const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);

// geo.height is already in km (satellite.js returns km directly)
const altKm = geo.height;

if (altKm < 350 || altKm > 430) {
  console.error(`FAIL: altitude ${altKm.toFixed(1)} km is outside expected range 350–430 km`);
  process.exit(1);
}

console.log("PASS: ISS propagated successfully");
console.log(`  Lat: ${satellite.degreesLat(geo.latitude).toFixed(4)}°`);
console.log(`  Lon: ${satellite.degreesLong(geo.longitude).toFixed(4)}°`);
console.log(`  Alt: ${altKm.toFixed(1)} km`);
