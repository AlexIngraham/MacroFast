import { describe, expect, it } from "vitest";
import { findChartUrl, parseSubway, subwayAdapter } from "@/ingestion/adapters/subway";
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
  const fixture = await subwayAdapter.fixture!();
  return parseSubway(documentOf(fixture.body));
}

describe("Subway adapter", () => {
  it("maps the chart columns onto the schema, skipping added sugars", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    // 6" Steak Philly 192 510 25 9 1 85 1320 43 2 5 3 28 10 6 90 100
    expect(byId.get("6-sandwiches-cheesesteaks-6-steak-philly-192-g")).toMatchObject({
      restaurantSlug: "subway",
      name: '6" Steak Philly',
      category: '6" Sandwiches',
      categories: ['6" Sandwiches', "Cheesesteaks"],
      servingSize: "192 g",
      itemType: "entree",
      sourceType: "pdf",
      calories: 510,
      fatG: 25,
      saturatedFatG: 9,
      transFatG: 1,
      cholesterolMg: 85,
      sodiumMg: 1320,
      carbsG: 43,
      fiberG: 2,
      sugarG: 5,
      proteinG: 28,
      scrapedAt: FETCHED_AT,
    });
  });

  it("keeps a section heading that introduces rows on the following page", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    // The chart prints "Salads" at the foot of one page and its rows on the next.
    expect(byId.get("salads-cheesesteaks-steak-philly-409-g")).toMatchObject({
      category: "Salads",
      calories: 450,
      proteinG: 24,
    });
  });

  it("separates identically named items that belong to different menu formats", async () => {
    const philly = (await parseFixture()).filter((food) => food.name === "Steak Philly");

    expect(philly.map((food) => [food.category, food.calories])).toEqual([
      ["Wraps", 710],
      ["Salads", 450],
      ["PROTEIN BOWLS", 630],
    ]);
    expect(new Set(philly.map((food) => food.sourceItemId)).size).toBe(3);
  });

  it("never treats a repeated column heading or page legend as a menu section", async () => {
    const categories = new Set((await parseFixture()).map((food) => food.category));

    expect(categories).toEqual(
      new Set([
        '6" Sandwiches',
        "Wraps",
        "Salads",
        "PROTEIN BOWLS",
        "Sliders",
        "Breads",
        "Cookies & Sides",
      ]),
    );
  });

  it("classifies breads, toppings and desserts away from full sandwiches", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("breads-6-artisan-italian-bread-71-g")?.itemType).toBe("component");
    expect(byId.get("cookies-sides-chocolate-chip-cookie-45-g")?.itemType).toBe("dessert");
    expect(byId.get("wraps-cheesesteaks-steak-philly-295-g")?.itemType).toBe("entree");
  });

  it("reads a double asterisk as limited availability and drops it from the name", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("6-sandwiches-local-favorites-6-big-hot-pastrami-232-g")).toMatchObject({
      name: '6" Big Hot Pastrami',
      status: "regional",
    });
    expect(byId.get("6-sandwiches-cheesesteaks-6-steak-philly-192-g")?.status).toBe("active");
  });

  it("records a 'less than one' cell as unknown", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("sliders-ham-jack-includes-pepper-jack-cheese-71-g")).toMatchObject({
      calories: 160,
      proteinG: 10,
      fiberG: null,
    });
  });

  it("produces unique stable ids and passes schema validation", async () => {
    const foods = await parseFixture();

    expect(foods).toHaveLength(9);
    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(foods.length);
    expect(new Set(foods.map((food) => food.slug)).size).toBe(foods.length);
    for (const food of foods) {
      expect(validateFood(food).accepted, `${food.name} failed validation`).toBe(true);
    }
  });

  it("refuses to publish rows under a leaked legend label", () => {
    const body = [
      "Serving Size (g)",
      "Iron % DV",
      "BREADS & INGREDIENTS",
      "Mystery Sub 100 200 10 1 0 0 300 20 1 2 1 15 0 0 0 0",
    ].join("\n");

    expect(() => parseSubway(documentOf(body))).toThrow(/legend label/i);
  });

  it("refuses to merge two chart rows that disagree on nutrition", () => {
    const row = (calories: number) => `Mystery Sub 100 ${calories} 10 1 0 0 300 20 1 2 1 15 0 0 0 0`;
    const body = [
      "Serving Size (g)",
      "Sandwiches",
      row(200),
      PDF_PAGE_BREAK,
      "Serving Size (g)",
      "Sandwiches",
      row(999),
    ].join("\n");

    expect(() => parseSubway(documentOf(body))).toThrow(/conflicting nutrition/i);
  });

  it("resolves the nutrition chart link and ignores the allergen and ingredient charts", () => {
    const html = `
      <a href="https://media.subway.com/dam/x/original/as/us-allergens-en.pdf">Allergens</a>
      <a href="https://media.subway.com/dam/x/original/as/us-ingredients-en.pdf">Ingredients</a>
      <a href="https://media.subway.com/dam/x/original/as/us-nutrition-en.pdf">Nutrition</a>
    `;

    expect(findChartUrl(html)).toBe("https://media.subway.com/dam/x/original/as/us-nutrition-en.pdf");
  });

  it("fails when the nutrition page stops linking a chart", () => {
    expect(() => findChartUrl(`<a href="/menu">Menu</a>`)).toThrow(/No U.S. nutrition chart PDF/i);
  });
});
