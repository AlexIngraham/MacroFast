import { describe, expect, it } from "vitest";
import type { NormalizedFood } from "@/lib/domain";
import { detectNutritionChanges, validateFood } from "@/ingestion/validation";

const food: NormalizedFood = {
  sourceItemId: "entrees:test",
  restaurantSlug: "test",
  name: "Test Chicken",
  slug: "test-test-chicken",
  description: null,
  category: "Entrées",
  categories: ["Entrées"],
  servingSize: "200g",
  mealPeriod: null,
  itemType: "entree",
  status: "active",
  isCustomizable: false,
  calories: 420,
  proteinG: 40,
  carbsG: 30,
  fatG: 15,
  saturatedFatG: 3,
  transFatG: 0,
  fiberG: 2,
  sugarG: 3,
  sodiumMg: 800,
  cholesterolMg: 80,
  sourceUrl: "https://example.com/nutrition",
  sourceType: "html",
  sourceLastUpdated: null,
  scrapedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("ingestion validation", () => {
  it("accepts valid nutrition", () => {
    expect(validateFood(food)).toMatchObject({ accepted: true, issues: [] });
  });

  it("flags unusual but potentially legitimate values for review", () => {
    expect(validateFood({ ...food, proteinG: 250 })).toMatchObject({
      accepted: true,
      issues: [{ severity: "warning", code: "implausible_value" }],
    });
  });

  it("rejects impossible negative values", () => {
    expect(validateFood({ ...food, proteinG: -1 })).toMatchObject({ accepted: false });
  });

  it("quarantines major changes", () => {
    const issues = detectNutritionChanges(food, { ...food, calories: 42 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "major_nutrition_change", field: "calories" });
  });
});
