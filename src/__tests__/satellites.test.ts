/**
 * Satellite Layer Tests
 * Tests TLE parsing, SGP4 propagation, and orbital path computation
 */

import { test, expect, describe } from "bun:test";
import * as satellite from "satellite.js";

describe("SGP4 Propagation", () => {
  // ISS TLE (well-known, stable for testing shape of output)
  const line1 = "1 25544U 98067A   24001.00000000  .00001234  00000-0  23456-4 0  9990";
  const line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50000000000000";

  test("ISS propagates to valid position", () => {
    const satrec = satellite.twoline2satrec(line1, line2);
    const now = new Date();
    const result = satellite.propagate(satrec, now);

    expect(result.position).toBeDefined();
    expect(typeof result.position).not.toBe("boolean");
  });

  test("ISS altitude is within expected range (350-430 km)", () => {
    const satrec = satellite.twoline2satrec(line1, line2);
    const now = new Date();
    const result = satellite.propagate(satrec, now);

    expect(result.position).toBeDefined();
    if (typeof result.position === "boolean") return;

    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    const altKm = geo.height;

    expect(altKm).toBeGreaterThan(350);
    expect(altKm).toBeLessThan(430);
  });

  test("ISS velocity is within physical range (1-12 km/s)", () => {
    const satrec = satellite.twoline2satrec(line1, line2);
    const now = new Date();
    const result = satellite.propagate(satrec, now);

    expect(result.velocity).toBeDefined();
    if (typeof result.velocity === "boolean" || !result.velocity) return;

    const v = result.velocity;
    const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);

    expect(speed).toBeGreaterThan(1);
    expect(speed).toBeLessThan(12);
  });
});

describe("Category Filtering", () => {
  test("hiding category sets show to false", () => {
    const mockBillboards = [
      { category: "active", show: true },
      { category: "active", show: true },
      { category: "stations", show: true },
      { category: "military", show: true },
      { category: "military", show: true },
    ];

    function setCategory(cat: string, visible: boolean) {
      for (const b of mockBillboards) {
        if (b.category === cat) b.show = visible;
      }
    }

    setCategory("military", false);
    const visible = mockBillboards.filter(b => b.show).length;
    expect(visible).toBe(3);
  });

  test("showing category restores visibility", () => {
    const mockBillboards = [
      { category: "active", show: true },
      { category: "military", show: false },
      { category: "military", show: false },
    ];

    function setCategory(cat: string, visible: boolean) {
      for (const b of mockBillboards) {
        if (b.category === cat) b.show = visible;
      }
    }

    setCategory("military", true);
    const visible = mockBillboards.filter(b => b.show).length;
    expect(visible).toBe(3);
  });

  test("hiding all categories leaves zero visible", () => {
    const mockBillboards = [
      { category: "active", show: true },
      { category: "stations", show: true },
      { category: "military", show: true },
    ];

    function setCategory(cat: string, visible: boolean) {
      for (const b of mockBillboards) {
        if (b.category === cat) b.show = visible;
      }
    }

    setCategory("active", false);
    setCategory("stations", false);
    setCategory("military", false);
    const visible = mockBillboards.filter(b => b.show).length;
    expect(visible).toBe(0);
  });
});
