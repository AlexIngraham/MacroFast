import { describe, expect, it } from "vitest";
import {
  defaultScopeForRestaurant,
  deriveItemRole,
  roleIsInScope,
  type ItemRoleInput,
} from "@/lib/item-role";

function item(overrides: Partial<ItemRoleInput>): ItemRoleInput {
  return {
    itemType: null,
    category: "Menu",
    name: "Example item",
    restaurantSlug: "example",
    ...overrides,
  };
}

describe("derived item roles", () => {
  it.each([
    [item({ itemType: "entree", category: "Entrées" }), "meal"],
    [item({ itemType: "component", category: "Proteins" }), "component"],
    [item({ itemType: "side", category: "Sides" }), "side"],
    [item({ itemType: "drink", category: "Drinks" }), "drink"],
    [item({ itemType: "sauce", category: "Dipping Sauces" }), "sauce"],
    [item({ itemType: "component", category: "What Goes Inside", restaurantSlug: "chipotle" }), "build"],
    [item({ itemType: "entree", category: "Catering Entrées" }), "component"],
    [item({ itemType: "entree", category: "Kid's Menu" }), "component"],
    [item({ itemType: "entree", category: "PROTEIN-PACKED", name: "Chopped Breast Side", restaurantSlug: "el-pollo-loco" }), "component"],
    [item({ itemType: "entree", category: "Breakfast", name: "Small Fruit Cup", restaurantSlug: "chick-fil-a" }), "side"],
    [item({ itemType: "entree", category: "Breakfast", name: "Hash Browns", restaurantSlug: "chick-fil-a" }), "side"],
  ] as const)("classifies representative source records", (food, role) => {
    expect(deriveItemRole(food)).toBe(role);
  });

  it("keeps normal discovery limited to complete meals", () => {
    expect(roleIsInScope("meal", "meals")).toBe(true);
    expect(roleIsInScope("build", "meals")).toBe(false);
    expect(roleIsInScope("component", "meals")).toBe(false);
    expect(roleIsInScope("sauce", "meals")).toBe(false);
  });

  it("falls back to builds only for a restaurant with no meal candidates", () => {
    expect(defaultScopeForRestaurant({ meals: 0, builds: 120 })).toBe("builds");
    expect(defaultScopeForRestaurant({ meals: 12, builds: 30 })).toBe("meals");
    expect(defaultScopeForRestaurant({ meals: 0, builds: 0 })).toBe("meals");
  });
});
