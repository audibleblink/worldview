import { test, expect, describe } from "bun:test";
import { applyVisibleToCollection } from "../cesium/createBillboardCollection";

function makeMockCollection(count: number, initialShow = true) {
  const items = Array.from({ length: count }, () => ({ show: initialShow }));
  return {
    collection: { length: count, get: (i: number) => items[i] as { show: boolean } },
    items,
  };
}

describe("applyVisibleToCollection (setVisible logic)", () => {
  test("sets all billboards show=false", () => {
    const { collection, items } = makeMockCollection(3, true);
    applyVisibleToCollection(collection, false);
    expect(items.every((b) => b.show === false)).toBe(true);
  });

  test("sets all billboards show=true", () => {
    const { collection, items } = makeMockCollection(3, false);
    applyVisibleToCollection(collection, true);
    expect(items.every((b) => b.show === true)).toBe(true);
  });

  test("no-op when collection is null", () => {
    expect(() => applyVisibleToCollection(null, false)).not.toThrow();
  });

  test("toggles back to true after false", () => {
    const { collection, items } = makeMockCollection(3, true);
    applyVisibleToCollection(collection, false);
    expect(items.every((b) => b.show === false)).toBe(true);
    applyVisibleToCollection(collection, true);
    expect(items.every((b) => b.show === true)).toBe(true);
  });

  test("empty collection does not throw", () => {
    const { collection } = makeMockCollection(0);
    expect(() => applyVisibleToCollection(collection, false)).not.toThrow();
  });
});
