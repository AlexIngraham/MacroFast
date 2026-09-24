import { describe, expect, it } from "vitest";
import { parseFoodFilters } from "@/lib/filters";
import { foodFiltersHref } from "@/lib/food-urls";

describe("food discovery filters", () => {
  it("defaults the global finder to meals", () => {
    expect(parseFoodFilters({}).scope).toBe("meals");
  });

  it("supports a build-first restaurant default without overriding an explicit scope", () => {
    expect(parseFoodFilters({}, "builds").scope).toBe("builds");
    expect(parseFoodFilters({ scope: "all" }, "builds").scope).toBe("all");
  });

  it("preserves every active filter when constructing pagination URLs", () => {
    const filters = parseFoodFilters({
      q: "chicken",
      restaurant: "chick-fil-a",
      category: "Entrées",
      scope: "meals",
      maxCalories: "600",
      minProtein: "40",
      maxFat: "20",
      maxCarbs: "50",
      maxSodium: "1200",
      sort: "protein_desc",
      limit: "25",
      page: "2",
    });

    const url = new URL(foodFiltersHref("/foods", filters, { page: 3 }), "https://macrofast.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "chicken",
      restaurant: "chick-fil-a",
      category: "Entrées",
      scope: "meals",
      maxCalories: "600",
      minProtein: "40",
      maxFat: "20",
      maxCarbs: "50",
      maxSodium: "1200",
      sort: "protein_desc",
      limit: "25",
      page: "3",
    });
  });
});
