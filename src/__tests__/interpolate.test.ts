import { test, expect, describe } from "bun:test";
import { lerp, lerpAngle, findBracket } from "../recording/interpolate";
import type { Frame } from "../recording/types";

function makeFrame(t: number): Frame {
  return { t, planes: [], ships: [], seismic: [] };
}

describe("lerp", () => {
  test("basic interpolation", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  test("alpha=0 returns a", () => {
    expect(lerp(10, 90, 0)).toBe(10);
  });

  test("alpha=1 returns b", () => {
    expect(lerp(10, 90, 1)).toBe(90);
  });

  test("fractional values", () => {
    expect(lerp(0, 1, 0.25)).toBe(0.25);
  });
});

describe("lerpAngle", () => {
  test("basic interpolation 90->180 at 0.5 = 135", () => {
    expect(lerpAngle(90, 180, 0.5)).toBe(135);
  });

  test("wraparound 350->10 at 0.5 = 0", () => {
    expect(lerpAngle(350, 10, 0.5)).toBe(0);
  });

  test("wraparound 10->350 at 0.5 = 0", () => {
    expect(lerpAngle(10, 350, 0.5)).toBe(0);
  });

  test("no wraparound needed, same direction", () => {
    expect(lerpAngle(0, 90, 0.5)).toBe(45);
  });

  test("alpha=0 returns a", () => {
    expect(lerpAngle(270, 90, 0)).toBe(270);
  });

  test("alpha=1 returns b (normalized to [0,360))", () => {
    // Shortest arc from 270→90 is 180° counterclockwise; result 450 normalizes to 90.
    expect(lerpAngle(270, 90, 1)).toBe(90);
  });
});

describe("findBracket", () => {
  test("empty frames returns null", () => {
    expect(findBracket([], 1000)).toBeNull();
  });

  test("before first frame returns [first, first, 0]", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 500);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(1000);
    expect(next.t).toBe(1000);
    expect(alpha).toBe(0);
  });

  test("at first frame boundary returns [first, first, 0]", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 1000);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(1000);
    expect(next.t).toBe(1000);
    expect(alpha).toBe(0);
  });

  test("after last frame returns [last, last, 0]", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 3000);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(2000);
    expect(next.t).toBe(2000);
    expect(alpha).toBe(0);
  });

  test("at last frame boundary returns [last, last, 0]", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 2000);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(2000);
    expect(next.t).toBe(2000);
    expect(alpha).toBe(0);
  });

  test("midpoint between two frames: alpha=0.5", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 1500);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(1000);
    expect(next.t).toBe(2000);
    expect(alpha).toBeCloseTo(0.5);
  });

  test("quarter point: alpha=0.25", () => {
    const frames = [makeFrame(1000), makeFrame(2000)];
    const result = findBracket(frames, 1250);
    expect(result).not.toBeNull();
    const [, , alpha] = result!;
    expect(alpha).toBeCloseTo(0.25);
  });

  test("binary search with many frames", () => {
    const frames = Array.from({ length: 100 }, (_, i) => makeFrame(i * 1000));
    const result = findBracket(frames, 50_500);
    expect(result).not.toBeNull();
    const [prev, next, alpha] = result!;
    expect(prev.t).toBe(50_000);
    expect(next.t).toBe(51_000);
    expect(alpha).toBeCloseTo(0.5);
  });
});
