import { describe, expect, it } from "vitest";
import { restaurantCatalog } from "@/db/restaurant-catalog";
import { allAdapters, getAdapter, listAdapters } from "@/ingestion/registry";

describe("adapter registry", () => {
  it("resolves every adapter by its key and by its restaurant slug", () => {
    for (const adapter of allAdapters()) {
      expect(getAdapter(adapter.key)).toBe(adapter);
      expect(getAdapter(adapter.restaurant.slug)).toBe(adapter);
      expect(getAdapter(adapter.key.toUpperCase())).toBe(adapter);
    }
    expect(listAdapters()).toEqual(["chickfila", "chipotle", "elpolloloco", "jerseymikes", "subway"]);
  });

  it("names a restaurant that already exists in the catalog", () => {
    // A slug that misses the catalog would create a second restaurant row on
    // import, leaving the site with a duplicate card and no display order.
    const catalog = new Map(restaurantCatalog.map((restaurant) => [restaurant.slug, restaurant]));

    for (const adapter of allAdapters()) {
      const entry = catalog.get(adapter.restaurant.slug);
      expect(entry, `${adapter.key} is not in the restaurant catalog`).toBeDefined();
      expect(adapter.restaurant.name).toBe(entry?.name);
      expect(adapter.restaurant.websiteUrl).toBe(entry?.websiteUrl);
    }
  });

  it("declares a source, a minimum item count and a fixture for every adapter", () => {
    for (const adapter of allAdapters()) {
      expect(adapter.version, adapter.key).toMatch(/^\d+\.\d+\.\d+$/);
      expect(() => new URL(adapter.source.url), adapter.key).not.toThrow();
      // A parser that breaks must fail before it can look like a shrunken menu.
      expect(adapter.minimumExpectedItems, adapter.key).toBeGreaterThan(0);
      expect(adapter.fixture, `${adapter.key} has no committed fixture`).toBeTypeOf("function");
    }
  });

  it("explains itself when asked for an adapter that does not exist", () => {
    expect(() => getAdapter("mcdonalds")).toThrow(/Unknown restaurant adapter "mcdonalds"/);
    expect(() => getAdapter("mcdonalds")).toThrow(/chickfila/);
  });
});
