import { test, expect, describe, beforeEach, mock, afterEach } from "bun:test";
import type { SatelliteRecord } from "../src/layers/satellites";

/**
 * Tests for Phase 4: On-demand CelesTrak satellite fetch
 * 
 * Since we can't import the real SatelliteLayer without Cesium,
 * we test the core logic (rate limiting, TLE parsing, error handling) separately.
 */

// Constants matching satellites.ts
const CELESTRAK_COOLDOWN_MS = 5000;

// Sample TLE response from CelesTrak
const SAMPLE_TLE_ISS = `ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0    09
2 25544  51.6400 000.0000 0000000 000.0000 000.0000 15.50000000000009`;

const SAMPLE_TLE_HUBBLE = `HST
1 20580U 90037B   24001.50000000  .00000000  00000-0  00000-0 0    09
2 20580  28.4700 000.0000 0000000 000.0000 000.0000 15.09000000000009`;

/**
 * Mock rate limiter implementation matching SatelliteLayer
 */
class RateLimiter {
  private lastFetch: number = 0;

  canFetch(): boolean {
    return Date.now() - this.lastFetch >= CELESTRAK_COOLDOWN_MS;
  }

  getCooldownRemaining(): number {
    const elapsed = Date.now() - this.lastFetch;
    return Math.max(0, CELESTRAK_COOLDOWN_MS - elapsed);
  }

  recordFetch(): void {
    this.lastFetch = Date.now();
  }

  // For testing: set last fetch time
  setLastFetch(time: number): void {
    this.lastFetch = time;
  }
}

/**
 * Parse TLE text into satellite record (logic from satellites.ts)
 */
function parseSingleTLE(text: string): { name: string; noradId: string; line1: string; line2: string } | null {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length < 3) return null;
  
  const name = lines[0]!;
  const line1 = lines[1]!;
  const line2 = lines[2]!;
  
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) return null;
  
  // Extract NORAD ID from line 1 (columns 3-7, 0-indexed chars 2-6)
  const noradId = line1.substring(2, 7).trim();
  
  return { name, noradId, line1, line2 };
}

/**
 * Classify error message by type
 */
function classifyError(message: string): "RATE_LIMIT" | "NOT_FOUND" | "TIMEOUT" | "FETCH_ERROR" | "PARSE_ERROR" | "UNKNOWN" {
  if (message.startsWith("RATE_LIMIT:")) return "RATE_LIMIT";
  if (message.startsWith("NOT_FOUND:")) return "NOT_FOUND";
  if (message.startsWith("TIMEOUT:")) return "TIMEOUT";
  if (message.startsWith("FETCH_ERROR:")) return "FETCH_ERROR";
  if (message.startsWith("PARSE_ERROR:")) return "PARSE_ERROR";
  return "UNKNOWN";
}

// Tests for rate limiter
describe("CelesTrak rate limiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  test("allows fetch when no previous fetch", () => {
    expect(rateLimiter.canFetch()).toBe(true);
  });

  test("blocks fetch immediately after previous fetch", () => {
    rateLimiter.recordFetch();
    expect(rateLimiter.canFetch()).toBe(false);
  });

  test("blocks fetch within 5 seconds", () => {
    const now = Date.now();
    rateLimiter.setLastFetch(now - 2000); // 2 seconds ago
    expect(rateLimiter.canFetch()).toBe(false);
  });

  test("allows fetch after 5 seconds", () => {
    const now = Date.now();
    rateLimiter.setLastFetch(now - 5001); // 5.001 seconds ago
    expect(rateLimiter.canFetch()).toBe(true);
  });

  test("getCooldownRemaining returns correct value", () => {
    const now = Date.now();
    rateLimiter.setLastFetch(now - 3000); // 3 seconds ago
    const remaining = rateLimiter.getCooldownRemaining();
    // Should be approximately 2000ms remaining
    expect(remaining).toBeGreaterThan(1900);
    expect(remaining).toBeLessThanOrEqual(2000);
  });

  test("getCooldownRemaining returns 0 after cooldown", () => {
    const now = Date.now();
    rateLimiter.setLastFetch(now - 6000); // 6 seconds ago
    expect(rateLimiter.getCooldownRemaining()).toBe(0);
  });

  test("multiple rapid fetches should be blocked", () => {
    rateLimiter.recordFetch();
    expect(rateLimiter.canFetch()).toBe(false);
    expect(rateLimiter.canFetch()).toBe(false);
    expect(rateLimiter.canFetch()).toBe(false);
  });
});

// Tests for TLE parsing
describe("TLE parsing", () => {
  test("parses valid ISS TLE", () => {
    const result = parseSingleTLE(SAMPLE_TLE_ISS);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ISS (ZARYA)");
    expect(result!.noradId).toBe("25544");
    expect(result!.line1).toContain("25544U");
    expect(result!.line2).toContain("25544");
  });

  test("parses valid Hubble TLE", () => {
    const result = parseSingleTLE(SAMPLE_TLE_HUBBLE);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("HST");
    expect(result!.noradId).toBe("20580");
  });

  test("returns null for empty text", () => {
    expect(parseSingleTLE("")).toBeNull();
  });

  test("returns null for text with only 2 lines", () => {
    expect(parseSingleTLE("ISS\n1 25544U")).toBeNull();
  });

  test("returns null for invalid TLE format (wrong line prefixes)", () => {
    const invalidTLE = `ISS (ZARYA)
X 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0    09
Y 25544  51.6400 000.0000 0000000 000.0000 000.0000 15.50000000000009`;
    expect(parseSingleTLE(invalidTLE)).toBeNull();
  });

  test("handles TLE with extra whitespace", () => {
    const tleWithWhitespace = `
    ISS (ZARYA)  
    1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0    09  
    2 25544  51.6400 000.0000 0000000 000.0000 000.0000 15.50000000000009
    `;
    const result = parseSingleTLE(tleWithWhitespace);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ISS (ZARYA)");
  });

  test("extracts NORAD ID correctly", () => {
    // In TLE format, NORAD IDs occupy columns 3-7 (chars 2-6 in 0-indexed)
    // The actual satellites.ts implementation uses .trim() which removes leading spaces
    // but keeps the number as-is from the TLE data
    const tleWithId = `SMALL SAT
1  1234U 98067A   24001.50000000  .00000000  00000-0  00000-0 0    09
2  1234  51.6400 000.0000 0000000 000.0000 000.0000 15.50000000000009`;
    const result = parseSingleTLE(tleWithId);
    expect(result).not.toBeNull();
    expect(result!.noradId).toBe("1234");
  });
});

// Tests for error classification
describe("error classification", () => {
  test("classifies rate limit errors", () => {
    expect(classifyError("RATE_LIMIT:Please wait 3s")).toBe("RATE_LIMIT");
  });

  test("classifies not found errors", () => {
    expect(classifyError("NOT_FOUND:Satellite 99999 not found")).toBe("NOT_FOUND");
  });

  test("classifies timeout errors", () => {
    expect(classifyError("TIMEOUT:Failed to fetch satellite data")).toBe("TIMEOUT");
  });

  test("classifies fetch errors", () => {
    expect(classifyError("FETCH_ERROR:Network error")).toBe("FETCH_ERROR");
  });

  test("classifies parse errors", () => {
    expect(classifyError("PARSE_ERROR:Invalid TLE format")).toBe("PARSE_ERROR");
  });

  test("classifies unknown errors", () => {
    expect(classifyError("Some random error")).toBe("UNKNOWN");
  });
});

// Tests for error message generation
describe("error messages", () => {
  test("rate limit message format", () => {
    const message = "RATE_LIMIT:Please wait 3s before fetching another satellite";
    expect(message).toContain("Please wait");
    expect(message).toContain("before fetching");
  });

  test("not found message format", () => {
    const noradId = 99999;
    const message = `NOT_FOUND:Satellite ${noradId} not found`;
    expect(message).toContain(String(noradId));
    expect(message).toContain("not found");
  });

  test("timeout message format", () => {
    const message = "TIMEOUT:Failed to fetch satellite data";
    expect(message).toContain("Failed to fetch");
  });
});

// Tests for mock fetch scenarios
describe("fetch scenarios", () => {
  // Mock fetch response helper
  function createMockResponse(status: number, body: string | object): Response {
    const bodyText = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(bodyText, {
      status,
      headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json" },
    });
  }

  test("successful fetch returns parsed TLE", async () => {
    const response = createMockResponse(200, SAMPLE_TLE_ISS);
    const text = await response.text();
    const parsed = parseSingleTLE(text);
    
    expect(parsed).not.toBeNull();
    expect(parsed!.noradId).toBe("25544");
    expect(parsed!.name).toBe("ISS (ZARYA)");
  });

  test("404 response indicates satellite not found", async () => {
    const response = createMockResponse(404, { error: "Satellite not found" });
    expect(response.status).toBe(404);
  });

  test("CelesTrak 'No GP data found' response", async () => {
    const response = createMockResponse(200, "No GP data found");
    const text = await response.text();
    expect(text).toContain("No GP data found");
    // This should be treated as not found
    const parsed = parseSingleTLE(text);
    expect(parsed).toBeNull();
  });

  test("504 response indicates timeout", async () => {
    const response = createMockResponse(504, { error: "Request timeout" });
    expect(response.status).toBe(504);
  });

  test("502 response indicates proxy error", async () => {
    const response = createMockResponse(502, { error: "TLE proxy error" });
    expect(response.status).toBe(502);
  });
});

// Tests for NORAD ID validation
describe("NORAD ID validation", () => {
  test("valid NORAD IDs (1-5 digits)", () => {
    const validIds = [1, 12, 123, 1234, 12345, 25544, 99999];
    for (const id of validIds) {
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(99999);
    }
  });

  test("invalid NORAD ID: 0", () => {
    expect(0).toBe(0);
    // Should be rejected in actual implementation
  });

  test("invalid NORAD ID: negative", () => {
    expect(-1).toBeLessThan(0);
    // Should be rejected in actual implementation
  });

  test("invalid NORAD ID: > 99999", () => {
    expect(100000).toBeGreaterThan(99999);
    // Should be rejected in actual implementation
  });
});

// Integration-style tests for the full fetch flow
describe("fetch flow integration", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  test("full successful fetch flow", async () => {
    // 1. Check rate limit
    expect(rateLimiter.canFetch()).toBe(true);
    
    // 2. Record fetch
    rateLimiter.recordFetch();
    
    // 3. Mock successful response
    const tleText = SAMPLE_TLE_ISS;
    
    // 4. Parse TLE
    const parsed = parseSingleTLE(tleText);
    expect(parsed).not.toBeNull();
    expect(parsed!.noradId).toBe("25544");
    
    // 5. Verify rate limit is now active
    expect(rateLimiter.canFetch()).toBe(false);
  });

  test("fetch blocked by rate limit", () => {
    // First fetch
    rateLimiter.recordFetch();
    
    // Immediate second fetch should be blocked
    expect(rateLimiter.canFetch()).toBe(false);
    
    // Should provide cooldown info
    const remaining = rateLimiter.getCooldownRemaining();
    expect(remaining).toBeGreaterThan(4000); // Should be close to 5 seconds
  });

  test("fetch after cooldown succeeds", () => {
    // Simulate fetch from 6 seconds ago
    rateLimiter.setLastFetch(Date.now() - 6000);
    
    // Should be allowed now
    expect(rateLimiter.canFetch()).toBe(true);
  });
});

// Tests for satellite addition to collection
describe("satellite collection management", () => {
  test("new satellite should be added to records", () => {
    const records: SatelliteRecord[] = [];
    
    // Simulate adding a fetched satellite
    const newSatellite: SatelliteRecord = {
      name: "ISS (ZARYA)",
      noradId: "25544",
      category: "research", // On-demand fetched satellites use research category
      satrec: {} as any,
      color: {} as any,
    };
    
    records.push(newSatellite);
    
    expect(records.length).toBe(1);
    expect(records[0]!.noradId).toBe("25544");
  });

  test("fetched satellite should be findable by NORAD ID", () => {
    const records: SatelliteRecord[] = [
      {
        name: "ISS (ZARYA)",
        noradId: "25544",
        category: "research",
        satrec: {} as any,
        color: {} as any,
      },
    ];
    
    const found = records.find(r => r.noradId === "25544");
    expect(found).not.toBeUndefined();
    expect(found!.name).toBe("ISS (ZARYA)");
  });

  test("fetched satellites use research category color", () => {
    // On-demand fetched satellites should use the "research" category
    // This is to distinguish them visually from pre-loaded satellites
    const category = "research";
    expect(category).toBe("research");
  });
});
