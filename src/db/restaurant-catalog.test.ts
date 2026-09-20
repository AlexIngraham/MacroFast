import { describe, expect, it } from "vitest";
import { restaurantCatalog } from "@/db/restaurant-catalog";

describe("restaurant catalog", () => {
  it("contains the complete ordered priority list with stable identities", () => {
    expect(restaurantCatalog).toHaveLength(40);
    expect(restaurantCatalog.map((restaurant) => restaurant.displayOrder)).toEqual(
      Array.from({ length: 40 }, (_value, index) => index + 1),
    );
    expect(new Set(restaurantCatalog.map((restaurant) => restaurant.slug)).size).toBe(40);
    expect(restaurantCatalog.every((restaurant) => restaurant.websiteUrl.startsWith("https://"))).toBe(true);
  });
});
