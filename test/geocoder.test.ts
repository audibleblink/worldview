import { test, expect } from "bun:test";
import { parseCoordinates, lookupAirport, geocode, getAltitudeForType } from "../src/utils/geocoder";

// Test parseCoordinates
test("parseCoordinates - decimal with comma", () => {
  expect(parseCoordinates("30.2672, -97.7431")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - decimal with comma no space", () => {
  expect(parseCoordinates("30.2672,-97.7431")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - decimal with direction", () => {
  expect(parseCoordinates("30.2672N, 97.7431W")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - decimal with direction lowercase", () => {
  expect(parseCoordinates("30.2672n, 97.7431w")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - decimal with direction south east", () => {
  expect(parseCoordinates("33.9399S, 151.1753E")).toEqual({
    lat: -33.9399,
    lng: 151.1753,
  });
});

test("parseCoordinates - signed decimal no comma", () => {
  expect(parseCoordinates("30.2672 -97.7431")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - signed decimal no comma with spaces", () => {
  expect(parseCoordinates("  30.2672   -97.7431  ")).toEqual({
    lat: 30.2672,
    lng: -97.7431,
  });
});

test("parseCoordinates - integer coordinates", () => {
  expect(parseCoordinates("30, -98")).toEqual({
    lat: 30,
    lng: -98,
  });
});

test("parseCoordinates - negative latitude", () => {
  expect(parseCoordinates("-33.9399, 151.1753")).toEqual({
    lat: -33.9399,
    lng: 151.1753,
  });
});

test("parseCoordinates - invalid input", () => {
  expect(parseCoordinates("invalid")).toBeNull();
});

test("parseCoordinates - empty string", () => {
  expect(parseCoordinates("")).toBeNull();
});

test("parseCoordinates - single number", () => {
  expect(parseCoordinates("30.2672")).toBeNull();
});

test("parseCoordinates - text with numbers", () => {
  expect(parseCoordinates("Austin TX 78701")).toBeNull();
});

test("parseCoordinates - out of range latitude", () => {
  expect(parseCoordinates("91, 0")).toBeNull();
});

test("parseCoordinates - out of range longitude", () => {
  expect(parseCoordinates("0, 181")).toBeNull();
});

// Test lookupAirport
test("lookupAirport - valid code AUS", () => {
  const result = lookupAirport("AUS");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Austin");
  expect(result?.lat).toBeCloseTo(30.1975, 4);
  expect(result?.lng).toBeCloseTo(-97.6664, 4);
});

test("lookupAirport - valid code LAX", () => {
  const result = lookupAirport("LAX");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Los Angeles");
});

test("lookupAirport - valid code JFK", () => {
  const result = lookupAirport("JFK");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Kennedy");
});

test("lookupAirport - case insensitive lowercase", () => {
  const result = lookupAirport("aus");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Austin");
});

test("lookupAirport - case insensitive mixed case", () => {
  const result = lookupAirport("Aus");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Austin");
});

test("lookupAirport - with whitespace", () => {
  const result = lookupAirport("  LAX  ");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Los Angeles");
});

test("lookupAirport - invalid code", () => {
  expect(lookupAirport("XXX")).toBeNull();
});

test("lookupAirport - empty string", () => {
  expect(lookupAirport("")).toBeNull();
});

test("lookupAirport - too short", () => {
  expect(lookupAirport("LA")).toBeNull();
});

test("lookupAirport - too long", () => {
  expect(lookupAirport("LAXXX")).toBeNull();
});

// Test international airports
test("lookupAirport - international NRT (Tokyo Narita)", () => {
  const result = lookupAirport("NRT");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Narita");
});

test("lookupAirport - international LHR (London Heathrow)", () => {
  const result = lookupAirport("LHR");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Heathrow");
});

test("lookupAirport - international DXB (Dubai)", () => {
  const result = lookupAirport("DXB");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Dubai");
});

test("lookupAirport - international SYD (Sydney)", () => {
  const result = lookupAirport("SYD");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Sydney");
});

test("lookupAirport - international GRU (Sao Paulo)", () => {
  const result = lookupAirport("GRU");
  expect(result).not.toBeNull();
  expect(result?.name).toContain("Sao Paulo");
});

// Test getAltitudeForType
test("getAltitudeForType - country", () => {
  expect(getAltitudeForType("country")).toBe(500000);
});

test("getAltitudeForType - region", () => {
  expect(getAltitudeForType("region")).toBe(500000);
});

test("getAltitudeForType - city", () => {
  expect(getAltitudeForType("city")).toBe(50000);
});

test("getAltitudeForType - address", () => {
  expect(getAltitudeForType("address")).toBe(1000);
});

test("getAltitudeForType - poi", () => {
  expect(getAltitudeForType("poi")).toBe(1000);
});

test("getAltitudeForType - coords", () => {
  expect(getAltitudeForType("coords")).toBe(10000);
});

test("getAltitudeForType - airport", () => {
  expect(getAltitudeForType("airport")).toBe(5000);
});

// Test geocode with coordinates (no API call)
test("geocode - coordinates bypass API", async () => {
  const result = await geocode("30.2672, -97.7431");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("coords");
  expect(result?.lat).toBeCloseTo(30.2672);
  expect(result?.lng).toBeCloseTo(-97.7431);
});

test("geocode - coordinates with direction bypass API", async () => {
  const result = await geocode("30.2672N, 97.7431W");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("coords");
  expect(result?.lat).toBeCloseTo(30.2672);
  expect(result?.lng).toBeCloseTo(-97.7431);
});

// Test geocode with airport code (no API call)
test("geocode - airport code bypass API", async () => {
  const result = await geocode("LAX");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("airport");
  expect(result?.name).toContain("Los Angeles");
});

test("geocode - airport code lowercase bypass API", async () => {
  const result = await geocode("jfk");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("airport");
  expect(result?.name).toContain("Kennedy");
});

test("geocode - empty string returns null", async () => {
  const result = await geocode("");
  expect(result).toBeNull();
});

test("geocode - whitespace only returns null", async () => {
  const result = await geocode("   ");
  expect(result).toBeNull();
});

test("geocode - invalid 3-letter code falls back to API", async () => {
  // XXX is not a valid airport code, so it should try the API
  // Since we can't guarantee the API is running, we just check it doesn't throw
  const result = await geocode("XXX");
  // May be null (if API not running) or a result (if API returns something)
  expect(result === null || typeof result === "object").toBe(true);
});
