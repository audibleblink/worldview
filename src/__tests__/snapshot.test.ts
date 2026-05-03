import { test, expect, describe } from "bun:test";
import { snapshotPlanes, snapshotShips, snapshotSeismic } from "../recording/snapshot";
import type { PlaneRecord } from "../layers/planes/types";
import type { ShipRecord } from "../layers/ships/store";
import type { EarthquakeData } from "../ground/seismic/USGSFetcher";

describe("snapshotPlanes", () => {
  test("picks the correct fields", () => {
    const records: PlaneRecord[] = [
      {
        icao24: "abc123",
        callsign: "UAL100",
        longitude: -122.4,
        latitude: 37.8,
        altitude: 10000,
        velocity: 250,
        heading: 90,
        verticalRate: 0,
        onGround: false,
        lastContact: 1000,
        timestamp: 2000,
      },
    ];
    const result = snapshotPlanes(records);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      icao24: "abc123",
      callsign: "UAL100",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
    });
    // verticalRate, onGround etc. must NOT be present
    expect((result[0] as any).verticalRate).toBeUndefined();
    expect((result[0] as any).onGround).toBeUndefined();
  });

  test("maps an empty array", () => {
    expect(snapshotPlanes([])).toEqual([]);
  });
});

describe("snapshotShips", () => {
  test("maps name → shipName", () => {
    const records: ShipRecord[] = [
      {
        mmsi: "123456789",
        name: "EVER GIVEN",
        latitude: 30.5,
        longitude: 32.3,
        cog: 180,
        sog: 12.5,
        trueHeading: 181,
        shipType: 70,
        shipTypeCategory: "cargo",
        timestamp: 1000,
      },
    ];
    const result = snapshotShips(records);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      mmsi: "123456789",
      shipName: "EVER GIVEN", // name → shipName
      latitude: 30.5,
      longitude: 32.3,
      trueHeading: 181,
      sog: 12.5,
      shipType: 70,
    });
    // original `name` field should not leak through
    expect((result[0] as any).name).toBeUndefined();
  });

  test("maps an empty array", () => {
    expect(snapshotShips([])).toEqual([]);
  });
});

describe("snapshotSeismic", () => {
  test("converts Date to number via getTime()", () => {
    const ts = 1_700_000_000_000;
    const quakes: EarthquakeData[] = [
      {
        id: "us6000abc",
        magnitude: 5.2,
        place: "10km N of Somewhere",
        time: new Date(ts),
        longitude: -118.4,
        latitude: 34.1,
        depth: 12.5,
        isSimulated: false,
      },
    ];
    const result = snapshotSeismic(quakes);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "us6000abc",
      latitude: 34.1,
      longitude: -118.4,
      magnitude: 5.2,
      depth: 12.5,
      time: ts,
    });
    // time must be a number, not a Date object
    expect(typeof result[0].time).toBe("number");
  });

  test("maps an empty array", () => {
    expect(snapshotSeismic([])).toEqual([]);
  });
});
