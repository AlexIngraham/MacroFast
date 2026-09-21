import { describe, expect, it } from "vitest";
import { elPolloLocoAdapter, findGuideUrl, parseElPolloLoco } from "@/ingestion/adapters/elpolloloco";
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
  const fixture = await elPolloLocoAdapter.fixture!();
  return parseElPolloLoco(documentOf(fixture.body));
}

describe("El Pollo Loco adapter", () => {
  it("normalizes guide rows with their official section as the category", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    expect(byId.get("protein-packed-double-chicken-bowl-24-2-oz")).toMatchObject({
      restaurantSlug: "el-pollo-loco",
      name: "Double Chicken Bowl",
      category: "PROTEIN-PACKED",
      itemType: "entree",
      servingSize: "24.2 oz",
      sourceType: "pdf",
      calories: 930,
      proteinG: 74,
      fatG: 33,
      saturatedFatG: 13,
      transFatG: 0.5,
      cholesterolMg: 250,
      sodiumMg: 2670,
      carbsG: 87,
      fiberG: 11,
      sugarG: 5,
      scrapedAt: FETCHED_AT,
    });
  });

  it("drops the trailing allergen columns instead of reading them as nutrition", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    // "Mexican Caesar Salad* 13.4 420 ... 52 X" ends with one allergen mark.
    expect(byId.get("protein-packed-mexican-caesar-salad-13-4-oz")).toMatchObject({
      calories: 420,
      proteinG: 52,
    });
    // "Cinnamon Churros (2) ... 3 X X X X" ends with four.
    expect(byId.get("sides-small-sauces-cinnamon-churros-2-2-5-oz")).toMatchObject({
      calories: 330,
      proteinG: 3,
      itemType: "dessert",
    });
  });

  it("separates à-la-carte pieces, sides, sauces and drinks from full plates", async () => {
    const byType = new Map((await parseFixture()).map((food) => [food.sourceItemId, food.itemType]));

    expect(byType.get("fire-grilled-chicken-chicken-breast-4-3-oz")).toBe("component");
    expect(byType.get("sides-small-sauces-pinto-beans-6-0-oz")).toBe("side");
    expect(byType.get("sides-small-sauces-creamy-cilantro-dressing-3-0-oz")).toBe("sauce");
    expect(byType.get("salsas-salsa-fresca-1-3-oz")).toBe("sauce");
    expect(byType.get("drinks-without-ice-coca-cola-regular-21-3-oz")).toBe("drink");
    expect(byType.get("featured-coffeechata-18-4-oz")).toBe("drink");
    expect(byType.get("featured-bbq-black-beans-small-6-0-oz")).toBe("side");
    expect(byType.get("featured-chicken-tender-1-2-4-oz")).toBe("component");
    expect(byType.get("kids-meals-entree-only-chicken-legs-2-3-1-oz")).toBe("entree");
  });

  it("rebuilds a fountain drink name from the size row printed beneath it", async () => {
    const foods = await parseFixture();
    const byId = new Map(foods.map((food) => [food.sourceItemId, food]));

    expect(byId.get("drinks-without-ice-coca-cola-large-32-3-oz")).toMatchObject({
      name: "Coca-Cola® (Large)",
      servingSize: "32.3 oz",
      calories: 400,
      sugarG: 109,
    });
    // A long drink name wraps onto its own size row and must not become an item.
    expect(byId.get("drinks-without-ice-minute-maid-aguas-frescas-mango-lime-large-29-6-oz")).toMatchObject({
      name: "Minute Maid® Aguas Frescas Mango Lime (Large)",
      calories: 230,
    });
    expect(foods.some((food) => food.name === "Large")).toBe(false);
  });

  it("reads the guide's own footnote markers as limited availability", async () => {
    const byId = new Map((await parseFixture()).map((food) => [food.sourceItemId, food]));

    // "Charro Beans**" is Texas and Louisiana only; "Horchata***" is limited locations.
    expect(byId.get("sides-small-sauces-charro-beans-6-0-oz")).toMatchObject({
      name: "Charro Beans",
      status: "regional",
    });
    expect(byId.get("drinks-without-ice-horchata-regular-22-1-oz")?.status).toBe("regional");
    expect(byId.get("drinks-without-ice-horchata-large-34-4-oz")?.status).toBe("regional");
    // A single asterisk is only a dressing note, so it stays nationally available.
    expect(byId.get("protein-packed-mexican-caesar-salad-13-4-oz")).toMatchObject({
      name: "Mexican Caesar Salad",
      status: "active",
    });
  });

  it("ignores the guide title, legend and revision stamp", async () => {
    const categories = new Set((await parseFixture()).map((food) => food.category));

    expect(categories).toEqual(
      new Set([
        "FEATURED",
        "PROTEIN-PACKED",
        "FIRE-GRILLED CHICKEN",
        "SIDES (Small) & SAUCES",
        "KIDS MEALS (Entrée Only)",
        "SALSAS",
        "DRINKS (without ice)",
      ]),
    );
  });

  it("produces unique stable ids and passes schema validation", async () => {
    const foods = await parseFixture();

    expect(foods).toHaveLength(20);
    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(foods.length);
    expect(new Set(foods.map((food) => food.slug)).size).toBe(foods.length);
    for (const food of foods) {
      expect(validateFood(food).accepted, `${food.name} failed validation`).toBe(true);
    }
  });

  it("ignores rows that appear before the column header", () => {
    const body = ["Some Marketing Item 4.0 100 10 1 0 0 0 100 10 1 0 5", "Protein (g)"].join("\n");

    expect(parseElPolloLoco(documentOf(body))).toHaveLength(0);
  });

  it("resolves the current guide link from the official nutrition page", () => {
    const html = `<a href="/menu">Menu</a><a href="/content/pdfs/epl_web_nutrition_guide_mod_4_2026_hr.pdf">Guide</a>`;

    expect(findGuideUrl(html)).toBe(
      "https://www.elpolloloco.com/content/pdfs/epl_web_nutrition_guide_mod_4_2026_hr.pdf",
    );
  });

  it("fails when the nutrition page stops linking a guide", () => {
    expect(() => findGuideUrl(`<a href="/menu">Menu</a>`)).toThrow(/No nutrition guide PDF/i);
  });
});
