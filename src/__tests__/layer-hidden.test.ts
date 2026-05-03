/**
 * layer-hidden.test.ts
 *
 * Tests the hide-not-unmount guarantee: toggling `hidden` hides billboards
 * without destroying them. The billboard item set (ids) must not change.
 *
 * Uses `applyVisibleToCollection` directly since layer components can't run
 * in the Bun test environment (no DOM / Cesium).
 */

import { test, expect, describe } from "bun:test";
import { applyVisibleToCollection } from "../cesium/createBillboardCollection";

interface MockBillboard {
  id: string;
  show: boolean;
}

function makeMockCollection(ids: string[], initialShow = true) {
  const items: MockBillboard[] = ids.map((id) => ({ id, show: initialShow }));
  const collection = {
    length: items.length,
    get: (i: number) => items[i]!,
  };
  return { collection, items };
}

describe("hide-not-unmount guarantee", () => {
  test("setVisible(false) hides all billboards", () => {
    const { collection, items } = makeMockCollection(["a", "b", "c"]);
    applyVisibleToCollection(collection, false);
    expect(items.every((b) => b.show === false)).toBe(true);
  });

  test("setVisible(true) shows all billboards", () => {
    const { collection, items } = makeMockCollection(["a", "b", "c"], false);
    applyVisibleToCollection(collection, true);
    expect(items.every((b) => b.show === true)).toBe(true);
  });

  test("ids (item count) unchanged after setVisible(false)", () => {
    const { collection, items } = makeMockCollection(["x", "y", "z"]);
    const idsBefore = items.map((i) => i.id);
    applyVisibleToCollection(collection, false);
    const idsAfter = items.map((i) => i.id);
    expect(idsAfter).toEqual(idsBefore);
    expect(collection.length).toBe(3); // no items removed
  });

  test("ids unchanged after round-trip hide → show", () => {
    const { collection, items } = makeMockCollection(["p", "q"]);
    const idsBefore = items.map((i) => i.id);
    applyVisibleToCollection(collection, false);
    applyVisibleToCollection(collection, true);
    const idsAfter = items.map((i) => i.id);
    expect(idsAfter).toEqual(idsBefore);
  });

  test("items toggle back to visible after false → true", () => {
    const { collection, items } = makeMockCollection(["a", "b"]);
    applyVisibleToCollection(collection, false);
    expect(items.every((b) => !b.show)).toBe(true);
    applyVisibleToCollection(collection, true);
    expect(items.every((b) => b.show)).toBe(true);
  });

  test("null collection is safe (no-op)", () => {
    expect(() => applyVisibleToCollection(null, false)).not.toThrow();
  });

  test("empty collection: length stays 0", () => {
    const { collection } = makeMockCollection([]);
    applyVisibleToCollection(collection, false);
    expect(collection.length).toBe(0);
  });
});
