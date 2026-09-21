import { describe, expect, it } from "vitest";
import { jerseyMikesAdapter, parseJerseyMikes, roundCalories } from "@/ingestion/adapters/jerseymikes";
import type { SourceDocument } from "@/ingestion/types";
import { validateFood } from "@/ingestion/validation";

const FETCHED_AT = new Date("2026-09-20T12:00:00Z");

function documentOf(body: string): SourceDocument {
  return {
    body,
    fetchedAt: FETCHED_AT,
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "application/json",
  };
}

async function parseFixture() {
  const fixture = await jerseyMikesAdapter.fixture!();
  return parseJerseyMikes(documentOf(fixture.body));
}

function subWithCalories(calories: string | null): string {
  return JSON.stringify({
    catalogUrl: "https://subs.jerseymikes.com/nutrition/data",
    catalog: [
      { id: "1", name: "Cold Subs", products: [{ id: "2", name: "Test Sub", sizes: [{ id: "2", name: "Regular" }] }] },
    ],
    items: [
      {
        categoryId: "1",
        productId: "2",
        sizeId: "2",
        detail: {
          product_ingredients: [
            {
              ingredient_id: "2",
              name: "Ham",
              inclusion_type: "D",
              ingredient_type_id: "M",
              nutrition__total_calories__cal: calories,
              nutrition__total_fat__g: "1",
              nutrition__saturated_fat__g: "1",
              nutrition__trans_fat__g: "0",
              nutrition__cholesterol__mg: "1",
              nutrition__sodium__mg: "1",
              nutrition__total_carbohydrate__g: "1",
              nutrition__dietary_fiber__g: "0",
              nutrition__sugars__g: "0",
              nutrition__protein__g: "5",
            },
          ],
        },
      },
    ],
  });
}

describe("Jersey Mike's adapter", () => {
  it("totals the default ingredients the official page selects for a product size", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("product-2-size-2")).toMatchObject({
      restaurantSlug: "jersey-mikes",
      name: "#3 Ham and Provolone (Regular)",
      slug: "jersey-mikes-3-ham-and-provolone-regular-cold-subs",
      category: "Cold Subs",
      itemType: "entree",
      servingSize: "Regular",
      sourceType: "json",
      isCustomizable: true,
      calories: 820,
      proteinG: 38.23,
      carbsG: 67.86,
      fatG: 44.36,
      saturatedFatG: 10.7,
      cholesterolMg: 63.44,
      sodiumMg: 1962.5,
      fiberG: 4.39,
      sugarG: 7.35,
      scrapedAt: FETCHED_AT,
    });
  });

  it("keeps every nutritionally distinct size as its own food", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("product-2-size-1")).toMatchObject({
      name: "#3 Ham and Provolone (Mini)",
      servingSize: "Mini",
      calories: 480,
      proteinG: 22.75,
    });
    expect(byId.get("product-2-size-3")).toMatchObject({
      name: "#3 Ham and Provolone (Giant)",
      servingSize: "Giant",
      calories: 1550,
      proteinG: 67.75,
    });
    expect(new Set(["product-2-size-1", "product-2-size-2", "product-2-size-3"]).size).toBe(3);
  });

  it("records the default build so a published total can be traced back", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("product-87-size-2")?.description).toBe("Default build: Pepsi");
    expect(byId.get("product-137-size-2")?.description).toContain("Pork Roll");
  });

  it("classifies drinks, desserts and breakfast away from subs", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("product-87-size-2")).toMatchObject({ itemType: "drink", calories: 280 });
    expect(byId.get("product-113-size-2")).toMatchObject({ itemType: "dessert", calories: 280 });
    expect(byId.get("product-137-size-2")).toMatchObject({
      itemType: "entree",
      category: "Breakfast",
      mealPeriod: "breakfast",
    });
  });

  it("skips a product size the service publishes with no default ingredients", async () => {
    const foods = await parseFixture();

    expect(foods).toHaveLength(6);
    expect(foods.some((food) => food.sourceItemId === "product-715-size-22")).toBe(false);
  });

  it("produces unique stable ids and passes schema validation", async () => {
    const foods = await parseFixture();

    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(foods.length);
    expect(new Set(foods.map((food) => food.slug)).size).toBe(foods.length);
    for (const food of foods) {
      expect(validateFood(food).accepted, `${food.name} failed validation`).toBe(true);
    }
  });

  it("rounds calories the way the official totals row does", () => {
    expect(roundCalories(0)).toBe(0);
    expect(roundCalories(4.9)).toBe(0);
    expect(roundCalories(7)).toBe(5);
    expect(roundCalories(48)).toBe(50);
    expect(roundCalories(52)).toBe(50);
    expect(roundCalories(278.74)).toBe(280);
    expect(roundCalories(1549.82)).toBe(1550);
  });

  it("fails loudly when a nutrition value cannot be read", () => {
    expect(() => parseJerseyMikes(documentOf(subWithCalories("not-a-number")))).toThrow(/unreadable value/i);
  });

  it("reports an unpublished nutrient as unknown instead of zero", () => {
    const [food] = parseJerseyMikes(documentOf(subWithCalories(null)));

    // The official service leaves a few ingredient cells empty, and a total
    // built from an unpublished part cannot be reported as a number.
    expect(food).toMatchObject({ name: "Test Sub (Regular)", calories: null, proteinG: 5 });
    const validation = validateFood(food);
    expect(validation.accepted).toBe(true);
    expect(validation.issues.map((issue) => issue.code)).toContain("missing_primary_macro");
  });

  it("keeps public slugs distinct when a sub is also listed under Deals", () => {
    const ingredient = {
      ingredient_id: "2",
      name: "Chicken Salad",
      inclusion_type: "D",
      ingredient_type_id: "M",
      nutrition__total_calories__cal: "700",
      nutrition__total_fat__g: "44",
      nutrition__saturated_fat__g: "6",
      nutrition__trans_fat__g: "0",
      nutrition__cholesterol__mg: "68",
      nutrition__sodium__mg: "1189",
      nutrition__total_carbohydrate__g: "45",
      nutrition__dietary_fiber__g: "3",
      nutrition__sugars__g: "4",
      nutrition__protein__g: "27",
    };
    const product = { name: "Chicken Salad", sizes: [{ id: "1", name: "Mini" }] };
    const body = JSON.stringify({
      catalogUrl: "https://subs.jerseymikes.com/nutrition/data",
      catalog: [
        { id: "1", name: "Cold Subs", products: [{ id: "729", ...product }] },
        { id: "22", name: "Deals", products: [{ id: "736", ...product }] },
      ],
      items: [
        { categoryId: "1", productId: "729", sizeId: "1", detail: { product_ingredients: [ingredient] } },
        { categoryId: "22", productId: "736", sizeId: "1", detail: { product_ingredients: [ingredient] } },
      ],
    });

    const foods = parseJerseyMikes(documentOf(body));

    expect(foods.map((food) => food.slug)).toEqual([
      "jersey-mikes-chicken-salad-mini-cold-subs",
      "jersey-mikes-chicken-salad-mini-deals",
    ]);
    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(2);
  });

  it("rejects a nutrition payload that is not in the official catalog", () => {
    const body = JSON.stringify({
      catalogUrl: "https://subs.jerseymikes.com/nutrition/data",
      catalog: [{ id: "1", name: "Cold Subs", products: [] }],
      items: [{ categoryId: "1", productId: "999", sizeId: "2", detail: { product_ingredients: [] } }],
    });

    expect(() => parseJerseyMikes(documentOf(body))).toThrow(/missing from the official catalog/i);
  });
});
