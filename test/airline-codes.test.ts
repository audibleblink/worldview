import { test, expect } from "bun:test";
import { convertIataToIcao, IATA_TO_ICAO } from "../src/utils/airline-codes";

// Test IATA to ICAO conversion
test("convertIataToIcao - UA to UAL", () => {
  expect(convertIataToIcao("UA100")).toBe("UAL100");
});

test("convertIataToIcao - AA to AAL", () => {
  expect(convertIataToIcao("AA789")).toBe("AAL789");
});

test("convertIataToIcao - DL to DAL", () => {
  expect(convertIataToIcao("DL456")).toBe("DAL456");
});

test("convertIataToIcao - BA to BAW", () => {
  expect(convertIataToIcao("BA123")).toBe("BAW123");
});

test("convertIataToIcao - EK to UAE", () => {
  expect(convertIataToIcao("EK500")).toBe("UAE500");
});

// Test already ICAO codes pass through unchanged
test("convertIataToIcao - AAL already ICAO", () => {
  expect(convertIataToIcao("AAL100")).toBe("AAL100");
});

test("convertIataToIcao - UAL already ICAO", () => {
  expect(convertIataToIcao("UAL789")).toBe("UAL789");
});

test("convertIataToIcao - DAL already ICAO", () => {
  expect(convertIataToIcao("DAL456")).toBe("DAL456");
});

test("convertIataToIcao - BAW already ICAO", () => {
  expect(convertIataToIcao("BAW123")).toBe("BAW123");
});

// Test unknown IATA codes pass through unchanged
test("convertIataToIcao - unknown IATA code", () => {
  expect(convertIataToIcao("XX123")).toBe("XX123");
});

test("convertIataToIcao - lowercase input", () => {
  expect(convertIataToIcao("ua100")).toBe("UAL100");
});

// Test edge cases
test("convertIataToIcao - numbers only", () => {
  expect(convertIataToIcao("12345")).toBe("12345");
});

test("convertIataToIcao - letters only", () => {
  expect(convertIataToIcao("ABCD")).toBe("ABCD");
});

// Test all 50 carriers in the lookup table
test("IATA_TO_ICAO - has 50 carriers", () => {
  expect(Object.keys(IATA_TO_ICAO).length).toBe(50);
});

// Test specific carrier mappings
const expectedMappings: [string, string][] = [
  // North America
  ["AA", "AAL"],
  ["UA", "UAL"],
  ["DL", "DAL"],
  ["WN", "SWA"],
  ["AS", "ASA"],
  ["B6", "JBU"],
  ["NK", "NKS"],
  ["F9", "FFT"],
  ["G4", "AAY"],
  ["HA", "HAL"],
  ["SY", "SCX"],
  ["AC", "ACA"],
  ["WS", "WJA"],
  ["AM", "AMX"],
  // Europe
  ["BA", "BAW"],
  ["LH", "DLH"],
  ["AF", "AFR"],
  ["KL", "KLM"],
  ["IB", "IBE"],
  ["AY", "FIN"],
  ["SK", "SAS"],
  ["LX", "SWR"],
  ["OS", "AUA"],
  ["TP", "TAP"],
  ["AZ", "ITY"],
  ["TK", "THY"],
  ["EI", "EIN"],
  ["VS", "VIR"],
  // Middle East
  ["EK", "UAE"],
  ["QR", "QTR"],
  ["EY", "ETD"],
  ["SV", "SVA"],
  // Asia Pacific
  ["QF", "QFA"],
  ["NZ", "ANZ"],
  ["SQ", "SIA"],
  ["CX", "CPA"],
  ["JL", "JAL"],
  ["NH", "ANA"],
  ["KE", "KAL"],
  ["OZ", "AAR"],
  ["CI", "CAL"],
  ["BR", "EVA"],
  ["CA", "CCA"],
  ["MU", "CES"],
  ["CZ", "CSN"],
  ["AI", "AIC"],
  // Latin America / Africa
  ["LA", "LAN"],
  ["AV", "AVA"],
  ["CM", "CMP"],
  ["SA", "SAA"],
];

for (const [iata, icao] of expectedMappings) {
  test(`IATA_TO_ICAO - ${iata} → ${icao}`, () => {
    expect(IATA_TO_ICAO[iata]).toBe(icao);
  });
}

// Test conversion for all carriers
for (const [iata, icao] of expectedMappings) {
  test(`convertIataToIcao - ${iata}123 → ${icao}123`, () => {
    expect(convertIataToIcao(`${iata}123`)).toBe(`${icao}123`);
  });
}
