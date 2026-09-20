import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseChickfila } from "@/ingestion/adapters/chickfila";

const fixturePath = fileURLToPath(new URL("../fixtures/chickfila.sample.html", import.meta.url));

describe("Chick-fil-A adapter", () => {
  it("normalizes parent items and variants from the official table shape", async () => {
    const body = await readFile(fixturePath, "utf8");
    const foods = parseChickfila({
      body,
      fetchedAt: new Date("2026-09-19T12:00:00Z"),
      sourceLastUpdated: null,
      etag: null,
      lastModified: null,
      contentType: "text/html",
    });

    expect(foods).toHaveLength(3);
    expect(foods[0]).toMatchObject({
      restaurantSlug: "chick-fil-a",
      name: "8 ct Grilled Nuggets",
      category: "Entrées",
      categories: ["Entrées", "Catering Entrées"],
      servingSize: "95g",
      calories: 130,
      proteinG: 25,
      sodiumMg: 440,
      itemType: "entree",
    });
    expect(foods[1]).toMatchObject({
      name: "12 ct Grilled Nuggets",
      calories: 200,
      proteinG: 38,
    });
    expect(foods[2]).toMatchObject({ name: "Side Salad", category: "Sides", fiberG: 3 });
    expect(new Set(foods.map((food) => food.sourceItemId)).size).toBe(3);
  });
});
