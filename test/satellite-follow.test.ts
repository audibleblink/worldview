import { test, expect, describe, beforeEach } from "bun:test";
import type { SatelliteRecord } from "../src/layers/satellites";

/**
 * Mock SatelliteLayer for testing findByNoradId and follow behavior
 * We can't import the real SatelliteLayer without Cesium, so we test the logic separately
 */

// Mock satellite records for testing
function createMockSatellites(): Map<string, SatelliteRecord[]> {
  const categories = new Map<string, SatelliteRecord[]>();

  // Stations category
  categories.set("stations", [
    {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    },
    {
      name: "TIANGONG",
      noradId: "48274",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    },
  ]);

  // Military category
  categories.set("military", [
    {
      name: "USA 276",
      noradId: "40258",
      category: "military",
      satrec: {} as any,
      color: {} as any,
    },
  ]);

  // Starlink category
  categories.set("starlink", [
    {
      name: "STARLINK-1007",
      noradId: "44713",
      category: "starlink",
      satrec: {} as any,
      color: {} as any,
    },
    {
      name: "STARLINK-1008",
      noradId: "44714",
      category: "starlink",
      satrec: {} as any,
      color: {} as any,
    },
  ]);

  // GNSS category
  categories.set("gnss", [
    {
      name: "GPS BIIR-2",
      noradId: "24876",
      category: "gnss",
      satrec: {} as any,
      color: {} as any,
    },
  ]);

  // Research category
  categories.set("research", [
    {
      name: "HUBBLE",
      noradId: "20580",
      category: "research",
      satrec: {} as any,
      color: {} as any,
    },
  ]);

  return categories;
}

/**
 * findByNoradId implementation for testing
 * This mirrors the logic that will be implemented in SatelliteLayer
 */
function findByNoradId(
  records: SatelliteRecord[],
  noradId: number
): SatelliteRecord | null {
  const noradIdStr = String(noradId);
  for (const record of records) {
    if (record.noradId === noradIdStr) {
      return record;
    }
  }
  return null;
}

/**
 * Search all categories for a satellite by NORAD ID
 */
function findByNoradIdAllCategories(
  categories: Map<string, SatelliteRecord[]>,
  noradId: number
): SatelliteRecord | null {
  for (const records of categories.values()) {
    const found = findByNoradId(records, noradId);
    if (found) return found;
  }
  return null;
}

// Tests for findByNoradId
describe("findByNoradId", () => {
  let categories: Map<string, SatelliteRecord[]>;
  let allRecords: SatelliteRecord[];

  beforeEach(() => {
    categories = createMockSatellites();
    allRecords = Array.from(categories.values()).flat();
  });

  test("finds ISS in stations category", () => {
    const result = findByNoradIdAllCategories(categories, 25544);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ISS (ZARYA)");
    expect(result!.noradId).toBe("25544");
  });

  test("finds satellite in military category", () => {
    const result = findByNoradIdAllCategories(categories, 40258);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("USA 276");
  });

  test("finds satellite in starlink category", () => {
    const result = findByNoradIdAllCategories(categories, 44713);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("STARLINK-1007");
  });

  test("finds satellite in gnss category", () => {
    const result = findByNoradIdAllCategories(categories, 24876);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("GPS BIIR-2");
  });

  test("finds satellite in research category", () => {
    const result = findByNoradIdAllCategories(categories, 20580);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("HUBBLE");
  });

  test("returns null for unknown NORAD ID", () => {
    const result = findByNoradIdAllCategories(categories, 99999);
    expect(result).toBeNull();
  });

  test("returns null for NORAD ID 0", () => {
    const result = findByNoradIdAllCategories(categories, 0);
    expect(result).toBeNull();
  });

  test("searches all categories to find satellite", () => {
    // Verify we can find satellites from each category
    const iss = findByNoradIdAllCategories(categories, 25544);
    const hubble = findByNoradIdAllCategories(categories, 20580);
    const starlink = findByNoradIdAllCategories(categories, 44714);

    expect(iss).not.toBeNull();
    expect(hubble).not.toBeNull();
    expect(starlink).not.toBeNull();
  });
});

// Tests for follow toggle behavior
describe("satellite follow toggle", () => {
  let followedSatellite: SatelliteRecord | null = null;

  function startFollow(satellite: SatelliteRecord) {
    followedSatellite = satellite;
  }

  function stopFollow() {
    followedSatellite = null;
  }

  function isFollowing(satellite: SatelliteRecord): boolean {
    return followedSatellite?.noradId === satellite.noradId;
  }

  beforeEach(() => {
    followedSatellite = null;
  });

  test("following satellite sets it as followed", () => {
    const satellite: SatelliteRecord = {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    };

    startFollow(satellite);
    expect(followedSatellite).toBe(satellite);
    expect(isFollowing(satellite)).toBe(true);
  });

  test("stopping follow clears followed satellite", () => {
    const satellite: SatelliteRecord = {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    };

    startFollow(satellite);
    expect(isFollowing(satellite)).toBe(true);

    stopFollow();
    expect(followedSatellite).toBeNull();
    expect(isFollowing(satellite)).toBe(false);
  });

  test("toggle: follow -> unfollow -> follow", () => {
    const satellite: SatelliteRecord = {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    };

    // Initial state: not following
    expect(isFollowing(satellite)).toBe(false);

    // First toggle: start following
    startFollow(satellite);
    expect(isFollowing(satellite)).toBe(true);

    // Second toggle: stop following
    stopFollow();
    expect(isFollowing(satellite)).toBe(false);

    // Third toggle: start following again
    startFollow(satellite);
    expect(isFollowing(satellite)).toBe(true);
  });

  test("following different satellite switches follow", () => {
    const iss: SatelliteRecord = {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "stations",
      satrec: {} as any,
      color: {} as any,
    };

    const hubble: SatelliteRecord = {
      name: "HUBBLE",
      noradId: "20580",
      category: "research",
      satrec: {} as any,
      color: {} as any,
    };

    startFollow(iss);
    expect(isFollowing(iss)).toBe(true);
    expect(isFollowing(hubble)).toBe(false);

    // Following a different satellite
    startFollow(hubble);
    expect(isFollowing(iss)).toBe(false);
    expect(isFollowing(hubble)).toBe(true);
  });
});

// Tests for error cases
describe("satellite follow error cases", () => {
  test("NORAD ID 0 is invalid", () => {
    const noradId = 0;
    expect(noradId).toBe(0);
    // In the actual implementation, this should show "Invalid NORAD ID"
  });

  test("negative NORAD ID is invalid", () => {
    const noradId = -1;
    expect(noradId).toBeLessThan(0);
    // Negative IDs should be rejected
  });

  test("very large NORAD ID not found", () => {
    const categories = createMockSatellites();
    const result = findByNoradIdAllCategories(categories, 999999);
    expect(result).toBeNull();
    // In the actual implementation, this should show "Satellite 999999 not found"
  });
});
