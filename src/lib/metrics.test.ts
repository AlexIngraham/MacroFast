import { describe, expect, it } from "vitest";
import { caloriesPerGramProtein, classifyFood, proteinPer100Calories } from "@/lib/metrics";

const base = {
  calories: 400,
  proteinG: 40,
  carbsG: 35,
  fatG: 12,
  saturatedFatG: 3,
  transFatG: 0,
  fiberG: 5,
  sugarG: 4,
  sodiumMg: 900,
  cholesterolMg: 70,
};

describe("nutrition metrics", () => {
  it("calculates both efficiency representations", () => {
    expect(proteinPer100Calories(base)).toBe(10);
    expect(caloriesPerGramProtein(base)).toBe(10);
  });

  it("handles missing and zero denominators", () => {
    expect(proteinPer100Calories({ calories: 0, proteinG: 20 })).toBeNull();
    expect(caloriesPerGramProtein({ calories: 200, proteinG: 0 })).toBeNull();
    expect(proteinPer100Calories({ calories: null, proteinG: 20 })).toBeNull();
  });

  it("only returns objective, rules-based classifications", () => {
    expect(classifyFood(base)).toEqual([
      "Protein Monster",
      "Cutting Pick",
      "Macro MVP",
      "Balanced Meal",
    ]);
  });
});
