import { describe, expect, it } from "vitest";
import { parseSearchIntent } from "@/lib/search-intent";

describe("parseSearchIntent", () => {
  it("extracts protein and calorie constraints", () => {
    expect(parseSearchIntent("50g protein under 600 calories")).toEqual({
      text: "",
      minProtein: 50,
      maxCalories: 600,
    });
  });

  it("keeps restaurant and food terms", () => {
    expect(parseSearchIntent("McDonald's under 500 calories")).toEqual({
      text: "McDonald's",
      maxCalories: 500,
    });
  });
});
