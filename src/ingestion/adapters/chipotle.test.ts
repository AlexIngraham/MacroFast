import { describe, expect, it } from "vitest";
import { chipotleAdapter, parseChipotle } from "@/ingestion/adapters/chipotle";
import { PDF_PAGE_BREAK } from "@/ingestion/pdf";
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
    contentType: "application/pdf",
  };
}

async function parseFixture() {
  const fixture = await chipotleAdapter.fixture!();
  return parseChipotle(documentOf(fixture.body));
}

describe("Chipotle adapter", () => {
  it("normalizes the official chart rows into components, sides, sauces and drinks", async () => {
    const foods = await parseFixture();

    expect(foods).toHaveLength(12);
    expect(foods[0]).toMatchObject({
      restaurantSlug: "chipotle",
      sourceItemId: "chicken-4-oz",
      slug: "chipotle-chicken-4-oz",
      name: "Chicken",
      category: "Proteins",
      itemType: "component",
      servingSize: "4 oz",
      status: "active",
      sourceType: "pdf",
      calories: 180,
      proteinG: 32,
      carbsG: 0,
      fatG: 7,
      saturatedFatG: 3,
      transFatG: 0,
      cholesterolMg: 125,
      sodiumMg: 310,
      scrapedAt: FETCHED_AT,
    });
  });

  it("classifies sides, dressings and drinks away from build components", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("black-beans-4-oz")).toMatchObject({ itemType: "component", category: "What Goes Inside" });
    expect(byId.get("chips-regular-4-oz")).toMatchObject({ itemType: "side", category: "Sides & Drinks" });
    expect(byId.get("queso-blanco-large-8-oz")).toMatchObject({ itemType: "side", category: "Sides & Drinks" });
    expect(byId.get("chipotle-honey-vinaigrette-2-fl-oz")).toMatchObject({
      itemType: "sauce",
      category: "What Goes Inside",
    });
    expect(byId.get("diet-coke-22-fl-oz")).toMatchObject({ itemType: "drink", category: "Sides & Drinks" });
  });

  it("records a 'less than one' cell as unknown instead of inventing a number", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("queso-blanco-large-8-oz")).toMatchObject({ calories: 480, sugarG: 5, fiberG: null });
  });

  it("carries the product name onto the extra size row that follows it", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("diet-coke-32-fl-oz")).toMatchObject({
      name: "Diet Coke",
      servingSize: "32 fl oz",
      calories: 0,
      sodiumMg: 115,
    });
  });

  it("keeps kid's portions separate from the main chart entry of the same name", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("black-beans-3-oz-kids-menu")).toMatchObject({
      name: "Black Beans",
      servingSize: "3 oz",
      slug: "chipotle-black-beans-3-oz-kids-menu",
      category: "Kid's Menu",
      calories: 100,
      proteinG: 6,
    });
    expect(byId.get("black-beans-4-oz")?.calories).toBe(130);
    expect(byId.get("organic-milk-8oz-kids-menu")).toMatchObject({ itemType: "drink", category: "Kid's Menu" });
  });

  it("marks a drink printed on only one bottler page as regional", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("diet-coke-22-fl-oz")?.status).toBe("regional");
    expect(byId.get("pepsi-22-fl-oz")?.status).toBe("regional");
    // Repeated on both bottler pages, so it is offered nationally.
    expect(byId.get("chipotle-iced-tea-22-fl-oz")?.status).toBe("active");
  });

  it("produces unique stable ids and passes schema validation", async () => {
    const foods = await parseFixture();

    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(foods.length);
    expect(new Set(foods.map((food) => food.slug)).size).toBe(foods.length);
    for (const food of foods) {
      expect(validateFood(food).accepted, `${food.name} failed validation`).toBe(true);
    }
  });

  it("ignores the marketing page that only publishes calorie ranges", () => {
    const marketing = [
      "BURRITO 740–1210 cal",
      "Flour tortilla with a choice of cilantro-lime rice.",
      "Pinto Beans 130 cal | 4 oz",
      "Soda & Iced Tea*",
      "Regular 22 fl oz 0-300 cal Large 32 fl oz 0–440 cal",
    ].join("\n");

    expect(parseChipotle(documentOf(marketing))).toHaveLength(0);
  });

  it("fails loudly when too many cells become unreadable", () => {
    const header = [
      "nutrition",
      "facts",
      "Portion",
      "Calories",
      "Calories From Fat",
      "Total Fat (g)",
      "Saturated Fats (g)",
      "Trans Fat (g)",
      "Cholesterol (mg)",
      "Sodium (mg)",
      "Carbohydrates (g)",
      "Dietary Fiber (g)",
      "Sugar (g)",
      "Protein (g)",
    ];
    const damaged = Array.from(
      { length: 6 },
      (_unused, index) => `Mystery Item ${index} 4 oz 18Q 60 7 3 0 125 310 0 0 0 32`,
    );

    expect(() => parseChipotle(documentOf([...header, ...damaged].join("\n")))).toThrow(
      /Could not read nutrition cells on 6 rows/i,
    );
  });

  it("refuses to merge two chart rows that disagree on nutrition", () => {
    const body = [
      "Protein (g)",
      "Chicken 4 oz 180 60 7 3 0 125 310 0 0 0 32",
      PDF_PAGE_BREAK,
      "Protein (g)",
      "Chicken 4 oz 999 60 7 3 0 125 310 0 0 0 32",
    ].join("\n");

    expect(() => parseChipotle(documentOf(body))).toThrow(/conflicting nutrition/i);
  });
});
