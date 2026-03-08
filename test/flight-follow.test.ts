import { test, expect, describe, beforeEach } from "bun:test";
import { convertIataToIcao } from "../src/utils/airline-codes";
import type { FlightRecord } from "../src/layers/flights";

/**
 * Mock FlightLayer for testing findByCallsign and follow behavior
 * We can't import the real FlightLayer without Cesium, so we test the logic separately
 */

// Mock flight records for testing
function createMockFlights(): FlightRecord[] {
  return [
    {
      icao24: "a1b2c3",
      callsign: "UAL123",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    },
    {
      icao24: "d4e5f6",
      callsign: "AAL789",
      longitude: -73.9,
      latitude: 40.7,
      altitude: 12000,
      velocity: 280,
      heading: 45,
      verticalRate: 500,
      onGround: false,
      lastUpdate: Date.now(),
    },
    {
      icao24: "g7h8i9",
      callsign: "DAL456",
      longitude: -87.6,
      latitude: 41.9,
      altitude: 8000,
      velocity: 200,
      heading: 180,
      verticalRate: -200,
      onGround: false,
      lastUpdate: Date.now(),
    },
    {
      icao24: "j0k1l2",
      callsign: "JBU100",
      longitude: -118.2,
      latitude: 34.0,
      altitude: 15000,
      velocity: 300,
      heading: 270,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    },
    {
      icao24: "m3n4o5",
      callsign: "SWA555",
      longitude: -95.4,
      latitude: 29.8,
      altitude: 6000,
      velocity: 180,
      heading: 135,
      verticalRate: 1000,
      onGround: false,
      lastUpdate: Date.now(),
    },
  ];
}

/**
 * findByCallsign implementation for testing
 * This mirrors the logic implemented in FlightLayer
 */
function findByCallsign(
  records: FlightRecord[],
  callsign: string
): FlightRecord | null {
  const searchCallsign = callsign.toUpperCase().trim();
  for (const record of records) {
    if (record.callsign.toUpperCase().trim() === searchCallsign) {
      return record;
    }
  }
  return null;
}

// Tests for findByCallsign
describe("findByCallsign", () => {
  let flights: FlightRecord[];

  beforeEach(() => {
    flights = createMockFlights();
  });

  test("finds flight by exact callsign match", () => {
    const result = findByCallsign(flights, "UAL123");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("UAL123");
    expect(result!.icao24).toBe("a1b2c3");
  });

  test("finds flight case-insensitively", () => {
    const result = findByCallsign(flights, "ual123");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("UAL123");
  });

  test("finds American Airlines flight", () => {
    const result = findByCallsign(flights, "AAL789");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("AAL789");
  });

  test("finds Delta flight", () => {
    const result = findByCallsign(flights, "DAL456");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("DAL456");
  });

  test("finds JetBlue flight", () => {
    const result = findByCallsign(flights, "JBU100");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("JBU100");
  });

  test("finds Southwest flight", () => {
    const result = findByCallsign(flights, "SWA555");
    expect(result).not.toBeNull();
    expect(result!.callsign).toBe("SWA555");
  });

  test("returns null for unknown callsign", () => {
    const result = findByCallsign(flights, "XYZ999");
    expect(result).toBeNull();
  });

  test("returns null for empty callsign", () => {
    const result = findByCallsign(flights, "");
    expect(result).toBeNull();
  });

  test("returns null for whitespace-only callsign", () => {
    const result = findByCallsign(flights, "   ");
    expect(result).toBeNull();
  });
});

// Tests for IATA conversion integration
describe("IATA to ICAO conversion integration", () => {
  let flights: FlightRecord[];

  beforeEach(() => {
    flights = createMockFlights();
  });

  test(":follow UA123 converts to search for UAL123", () => {
    const userInput = "UA123";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("UAL123");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("UAL123");
  });

  test(":follow AA789 converts to search for AAL789", () => {
    const userInput = "AA789";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("AAL789");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("AAL789");
  });

  test(":follow DL456 converts to search for DAL456", () => {
    const userInput = "DL456";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("DAL456");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("DAL456");
  });

  test(":follow B6100 converts to search for JBU100", () => {
    const userInput = "B6100";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("JBU100");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("JBU100");
  });

  test(":follow WN555 converts to search for SWA555", () => {
    const userInput = "WN555";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("SWA555");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("SWA555");
  });

  test(":follow AAL789 (already ICAO) searches unchanged", () => {
    const userInput = "AAL789";
    const icaoCallsign = convertIataToIcao(userInput);
    // Already has 3-letter prefix, should remain unchanged
    expect(icaoCallsign).toBe("AAL789");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("AAL789");
  });

  test(":follow UAL123 (already ICAO) searches unchanged", () => {
    const userInput = "UAL123";
    const icaoCallsign = convertIataToIcao(userInput);
    expect(icaoCallsign).toBe("UAL123");

    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).not.toBeNull();
    expect(flight!.callsign).toBe("UAL123");
  });

  test("unknown IATA code passes through unchanged", () => {
    const userInput = "ZZ999";
    const icaoCallsign = convertIataToIcao(userInput);
    // ZZ is not in our IATA table, passes through
    expect(icaoCallsign).toBe("ZZ999");

    // Flight not found
    const flight = findByCallsign(flights, icaoCallsign);
    expect(flight).toBeNull();
  });
});

// Tests for flight follow toggle behavior
describe("flight follow toggle", () => {
  let followedFlight: FlightRecord | null = null;
  let isFollowingState: boolean = false;

  function selectFlight(flight: FlightRecord) {
    followedFlight = flight;
  }

  function startFollow() {
    isFollowingState = true;
  }

  function stopFollow() {
    isFollowingState = false;
  }

  function isFollowing(): boolean {
    return isFollowingState;
  }

  function getFollowedCallsign(): string | null {
    return isFollowingState && followedFlight ? followedFlight.callsign : null;
  }

  beforeEach(() => {
    followedFlight = null;
    isFollowingState = false;
  });

  test("following flight sets it as followed", () => {
    const flight: FlightRecord = {
      icao24: "a1b2c3",
      callsign: "UAL123",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    };

    selectFlight(flight);
    startFollow();

    expect(isFollowing()).toBe(true);
    expect(getFollowedCallsign()).toBe("UAL123");
  });

  test("stopping follow clears followed flight", () => {
    const flight: FlightRecord = {
      icao24: "a1b2c3",
      callsign: "UAL123",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    };

    selectFlight(flight);
    startFollow();
    expect(isFollowing()).toBe(true);

    stopFollow();
    expect(isFollowing()).toBe(false);
    expect(getFollowedCallsign()).toBeNull();
  });

  test("toggle: follow -> unfollow -> follow", () => {
    const flight: FlightRecord = {
      icao24: "a1b2c3",
      callsign: "UAL123",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    };

    // Initial state: not following
    expect(isFollowing()).toBe(false);

    // First toggle: start following
    selectFlight(flight);
    startFollow();
    expect(isFollowing()).toBe(true);
    expect(getFollowedCallsign()).toBe("UAL123");

    // Second toggle: stop following
    stopFollow();
    expect(isFollowing()).toBe(false);

    // Third toggle: start following again
    startFollow();
    expect(isFollowing()).toBe(true);
    expect(getFollowedCallsign()).toBe("UAL123");
  });

  test("following different flight switches follow", () => {
    const united: FlightRecord = {
      icao24: "a1b2c3",
      callsign: "UAL123",
      longitude: -122.4,
      latitude: 37.8,
      altitude: 10000,
      velocity: 250,
      heading: 90,
      verticalRate: 0,
      onGround: false,
      lastUpdate: Date.now(),
    };

    const american: FlightRecord = {
      icao24: "d4e5f6",
      callsign: "AAL789",
      longitude: -73.9,
      latitude: 40.7,
      altitude: 12000,
      velocity: 280,
      heading: 45,
      verticalRate: 500,
      onGround: false,
      lastUpdate: Date.now(),
    };

    selectFlight(united);
    startFollow();
    expect(isFollowing()).toBe(true);
    expect(getFollowedCallsign()).toBe("UAL123");

    // Switch to following a different flight
    selectFlight(american);
    expect(getFollowedCallsign()).toBe("AAL789");
  });
});

// Tests for error cases
describe("flight follow error cases", () => {
  let flights: FlightRecord[];

  beforeEach(() => {
    flights = createMockFlights();
  });

  test("flight not found returns null", () => {
    const result = findByCallsign(flights, "XYZ999");
    expect(result).toBeNull();
    // In actual implementation, this should show "Flight XYZ999 not found"
  });

  test("partial callsign match does not find flight", () => {
    // "UAL" alone should not match "UAL123"
    const result = findByCallsign(flights, "UAL");
    expect(result).toBeNull();
  });

  test("callsign with extra characters does not find flight", () => {
    // "UAL123X" should not match "UAL123"
    const result = findByCallsign(flights, "UAL123X");
    expect(result).toBeNull();
  });

  test("empty flights list returns null", () => {
    const emptyFlights: FlightRecord[] = [];
    const result = findByCallsign(emptyFlights, "UAL123");
    expect(result).toBeNull();
  });
});
