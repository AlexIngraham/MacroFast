import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { Element } from "domhandler";
import type { NormalizedFood } from "@/lib/domain";
import { fetchOfficialSource } from "@/ingestion/fetch";
import { mergeDuplicateFoods, normalizeWhitespace, parseNutritionNumber } from "@/ingestion/parse";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { foodSlug, slugify } from "@/lib/slug";

const SOURCE_URL = "https://www.chick-fil-a.com/nutrition-allergens";
const FIELD_COUNT = 11;

const categoryType: Record<string, string> = {
  "Entrées": "entree",
  Salads: "entree",
  Sides: "side",
  Drinks: "drink",
  Coffee: "drink",
  Treats: "dessert",
  Breakfast: "entree",
  "Dipping Sauces": "sauce",
  Dressings: "sauce",
  Proteins: "component",
  Buns: "component",
  "Salad Toppings": "topping",
  "Sandwich Toppings": "topping",
  "Soup Toppings": "topping",
};

function textFromBoundElement($: cheerio.CheerioAPI, element: Cheerio<Element>, selector: string): string {
  const match = element
    .find(selector)
    .filter((_index, node) => $(node).text().trim().length > 0)
    .first();
  return normalizeWhitespace(match.text());
}

function itemName($: cheerio.CheerioAPI, firstCell: Cheerio<Element>): string {
  return (
    textFromBoundElement($, firstCell, 'a[data-wp-text="context.menu_item.title"]') ||
    textFromBoundElement($, firstCell, 'p[data-wp-text="context.menu_item.title"]') ||
    normalizeWhitespace(firstCell.clone().children().remove().end().text())
  );
}

function nutritionValues($: cheerio.CheerioAPI, cells: Element[]): Array<string> {
  return cells.slice(1).map((cell) => {
    const boundValue = $(cell).find('span[data-wp-bind--hidden="context.isAllergensActive"]').first();
    return normalizeWhitespace(boundValue.text());
  });
}

function normalizedItem(args: {
  category: string;
  name: string;
  values: string[];
  document: SourceDocument;
}): NormalizedFood | null {
  const { category, name, values, document } = args;
  if (!name || values.length !== FIELD_COUNT) return null;

  const [
    servingSize,
    calories,
    fatG,
    saturatedFatG,
    transFatG,
    cholesterolMg,
    sodiumMg,
    carbsG,
    fiberG,
    sugarG,
    proteinG,
  ] = values;
  const sourceItemId = slugify(`${name}-${servingSize}`);

  return {
    sourceItemId,
    restaurantSlug: "chick-fil-a",
    name,
    slug: foodSlug("chick-fil-a", name, servingSize),
    description: null,
    category,
    categories: [category],
    servingSize: servingSize || null,
    mealPeriod: category === "Breakfast" ? "breakfast" : null,
    itemType: categoryType[category] ?? null,
    status: "active",
    isCustomizable: false,
    calories: parseNutritionNumber(calories),
    proteinG: parseNutritionNumber(proteinG),
    carbsG: parseNutritionNumber(carbsG),
    fatG: parseNutritionNumber(fatG),
    saturatedFatG: parseNutritionNumber(saturatedFatG),
    transFatG: parseNutritionNumber(transFatG),
    fiberG: parseNutritionNumber(fiberG),
    sugarG: parseNutritionNumber(sugarG),
    sodiumMg: parseNutritionNumber(sodiumMg),
    cholesterolMg: parseNutritionNumber(cholesterolMg),
    sourceUrl: SOURCE_URL,
    sourceType: "html",
    sourceLastUpdated: document.sourceLastUpdated,
    scrapedAt: document.fetchedAt,
  };
}

export function parseChickfila(document: SourceDocument): NormalizedFood[] {
  const $ = cheerio.load(document.body);
  const foods: NormalizedFood[] = [];

  $(".tables-wrapper > .table-wrapper > table[id]").each((_tableIndex, table) => {
    const category = $(table).attr("id")?.trim() || $(table).find("caption").first().text().trim();
    if (!category) return;

    $(table)
      .children("tbody")
      .children("tr")
      .each((_rowIndex, outerRow) => {
        const itemTable = $(outerRow).children("td").first().children("table").first();
        if (!itemTable.length) return;

        const parentRow = itemTable.children("thead").children("tr").first();
        const parentCells = parentRow.children("td").toArray();
        const parentName = itemName($, $(parentCells[0]));
        const parent = normalizedItem({
          category,
          name: parentName,
          values: nutritionValues($, parentCells),
          document,
        });
        if (parent) foods.push(parent);

        itemTable
          .children("tbody")
          .children("tr")
          .each((_subIndex, subRow) => {
            const subCells = $(subRow).children("td").toArray();
            const subName = normalizeWhitespace($(subCells[0]).text());
            const subItem = normalizedItem({
              category,
              name: subName,
              values: nutritionValues($, subCells),
              document,
            });
            if (subItem) foods.push(subItem);
          });
      });
  });

  return mergeDuplicateFoods(foods);
}

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/chickfila.sample.html", import.meta.url));

export const chickfilaAdapter: RestaurantAdapter = {
  key: "chickfila",
  version: "1.0.0",
  restaurant: {
    slug: "chick-fil-a",
    name: "Chick-fil-A",
    websiteUrl: "https://www.chick-fil-a.com",
  },
  source: {
    name: "Official Nutrition & Allergens table",
    url: SOURCE_URL,
    type: "html",
  },
  minimumExpectedItems: 100,
  fetch: () => fetchOfficialSource(SOURCE_URL),
  parse: parseChickfila,
  fixture: async () => ({
    body: await readFile(FIXTURE_PATH, "utf8"),
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "text/html",
  }),
};
