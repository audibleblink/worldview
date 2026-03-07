// Run with: bun scripts/tle-fetch-smoke.ts
import { loadAllTLEs } from "../src/layers/satellites";

const records = await loadAllTLEs();

console.log(`Total records: ${records.length}`);
if (records.length < 100) { console.error("FAIL: fewer than 100 records"); process.exit(1); }

const categories = { active: 0, stations: 0, military: 0 };
for (const r of records) categories[r.category as keyof typeof categories]++;
console.log("Categories:", categories);

if (categories.active < 50) { console.error("FAIL: too few active sats"); process.exit(1); }
if (!records.every(r => r.satrec && r.noradId && r.name)) {
  console.error("FAIL: malformed records"); process.exit(1);
}

console.log("PASS: TLE fetch and parse successful");
console.log(`  Sample: ${records[0].name} (NORAD ${records[0].noradId})`);
