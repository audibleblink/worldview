// Verifies category filtering logic without Cesium (pure data-layer test)
const mockBillboards: { category: string; show: boolean }[] = [
  { category: "active", show: true },
  { category: "active", show: true },
  { category: "stations", show: true },
  { category: "military", show: true },
  { category: "military", show: true },
];

function setCategory(cat: string, visible: boolean): void {
  for (const b of mockBillboards) {
    if (b.category === cat) b.show = visible;
  }
}

function visibleCount(): number {
  return mockBillboards.filter(b => b.show).length;
}

// Test: hide military
setCategory("military", false);
if (visibleCount() !== 3) { console.error("FAIL: hiding military should leave 3 visible"); process.exit(1); }

// Test: show military again
setCategory("military", true);
if (visibleCount() !== 5) { console.error("FAIL: showing military should restore 5 visible"); process.exit(1); }

// Test: hide all
setCategory("active", false);
setCategory("stations", false);
setCategory("military", false);
if (visibleCount() !== 0) { console.error("FAIL: hiding all should leave 0 visible"); process.exit(1); }

console.log("PASS: Category filter logic verified");
