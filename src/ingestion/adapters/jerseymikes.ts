import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { NormalizedFood } from "@/lib/domain";
import { fetchOfficialSource, JSON_ACCEPT, sleep, SourceRequestError } from "@/ingestion/fetch";
import { createIngestionLogger } from "@/ingestion/logger";
import { normalizeWhitespace, roundTo } from "@/ingestion/parse";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { foodSlug, slugify } from "@/lib/slug";

const API_BASE = "https://subs.jerseymikes.com";
const CATALOG_URL = `${API_BASE}/nutrition/data`;
/** The page a visitor can open to reproduce any number this adapter imports. */
const PUBLIC_NUTRITION_URL = "https://www.jerseymikes.com/menu/nutrition";
const RESTAURANT_SLUG = "jersey-mikes";
const ADAPTER_KEY = "jerseymikes";

/** One product/size lookup at a time, spaced out, on a single connection. */
const REQUEST_SPACING_MS = 250;
const PROGRESS_EVERY = 50;
/**
 * A handful of catalog rows can point at a product/size the nutrition service no
 * longer serves. More than this means the catalog or the service changed shape.
 */
const MAX_MISSING_ITEMS = 15;

const nutritionValue = z.union([z.string(), z.number()]).nullable();

const ingredientSchema = z.object({
  ingredient_id: z.string(),
  name: z.string(),
  /** "D" is included by default, "A" is an add-on and "R" is a swap. */
  inclusion_type: z.string(),
  ingredient_type_id: z.string().nullable().optional(),
  nutrition__total_calories__cal: nutritionValue,
  nutrition__total_fat__g: nutritionValue,
  nutrition__saturated_fat__g: nutritionValue,
  nutrition__trans_fat__g: nutritionValue,
  nutrition__cholesterol__mg: nutritionValue,
  nutrition__sodium__mg: nutritionValue,
  nutrition__total_carbohydrate__g: nutritionValue,
  nutrition__dietary_fiber__g: nutritionValue,
  nutrition__sugars__g: nutritionValue,
  nutrition__protein__g: nutritionValue,
});

const detailSchema = z.object({ product_ingredients: z.array(ingredientSchema).default([]) });

const catalogSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    products: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          sizes: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
        }),
      )
      .default([]),
  }),
);

const documentSchema = z.object({
  catalogUrl: z.string(),
  catalog: catalogSchema,
  items: z.array(
    z.object({
      categoryId: z.string(),
      productId: z.string(),
      sizeId: z.string(),
      detail: detailSchema,
    }),
  ),
});

type Ingredient = z.infer<typeof ingredientSchema>;

const NUTRITION_FIELDS = {
  calories: "nutrition__total_calories__cal",
  fatG: "nutrition__total_fat__g",
  saturatedFatG: "nutrition__saturated_fat__g",
  transFatG: "nutrition__trans_fat__g",
  cholesterolMg: "nutrition__cholesterol__mg",
  sodiumMg: "nutrition__sodium__mg",
  carbsG: "nutrition__total_carbohydrate__g",
  fiberG: "nutrition__dietary_fiber__g",
  sugarG: "nutrition__sugars__g",
  proteinG: "nutrition__protein__g",
} as const satisfies Record<string, keyof Ingredient>;

type NutritionField = keyof typeof NUTRITION_FIELDS;

const DESSERT = /cookie|brownie|tastykake|snickerdoodle|cake|dessert|pie/i;
const DRINK = /drink|water|wtr|soda|tea|lemonade|juice|celsius|gatorade|sobe|amp|bubly|coffee|cola|bubbl/i;

/**
 * Mirrors the rounding the official nutrition page applies to its calorie
 * total: anything under five calories prints as zero, and larger totals round
 * to the nearest five or ten as FDA labelling requires.
 */
export function roundCalories(total: number): number {
  if (total < 5) return 0;
  const step = total > 50 ? 10 : 5;
  return Math.round(total / step) * step;
}

/** Matches the two decimal places the official totals row prints. */
function published(total: number | null): number | null {
  return total === null ? null : roundTo(total, 2);
}

/**
 * Adds one nutrient across the default ingredients. The service leaves a cell
 * null for a few ingredients it has not published, and a total built from an
 * unpublished part is unknown rather than zero, so the whole field becomes null.
 * A cell that holds something unreadable is a real problem and stops the run.
 */
function sumNutrient(defaults: Ingredient[], field: keyof Ingredient, context: string): number | null {
  let total = 0;

  for (const ingredient of defaults) {
    const raw = ingredient[field];
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const value = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value)) {
      throw new Error(
        `Official nutrition service returned an unreadable value for ${context} ${ingredient.name} ${field}: ${JSON.stringify(raw)}`,
      );
    }
    total += value;
  }

  return total;
}

function itemTypeOf(categoryName: string, productName: string): string {
  if (DESSERT.test(productName)) return "dessert";
  if (DRINK.test(productName)) return "drink";
  if (/sides|drinks|desserts|catering/i.test(categoryName)) return "side";
  return "entree";
}

export function parseJerseyMikes(document: SourceDocument): NormalizedFood[] {
  const logger = createIngestionLogger(ADAPTER_KEY);
  const parsed = documentSchema.parse(JSON.parse(document.body));

  const productIndex = new Map<string, { categoryName: string; productName: string; sizeName: string }>();
  for (const category of parsed.catalog) {
    for (const product of category.products) {
      for (const size of product.sizes) {
        productIndex.set(`${category.id}/${product.id}/${size.id}`, {
          categoryName: normalizeWhitespace(category.name),
          productName: normalizeWhitespace(product.name),
          sizeName: normalizeWhitespace(size.name),
        });
      }
    }
  }

  const foods: NormalizedFood[] = [];
  const withoutDefaults: string[] = [];

  for (const item of parsed.items) {
    const key = `${item.categoryId}/${item.productId}/${item.sizeId}`;
    const listing = productIndex.get(key);
    if (!listing) throw new Error(`Nutrition payload ${key} is missing from the official catalog`);

    // The official page selects the default ingredients and totals them; an
    // item with nothing selected has no published nutrition to report.
    const defaults = item.detail.product_ingredients.filter((ingredient) => ingredient.inclusion_type === "D");
    if (!defaults.length) {
      withoutDefaults.push(`${listing.productName} (${listing.sizeName})`);
      continue;
    }

    const totals = {} as Record<NutritionField, number | null>;
    for (const [field, source] of Object.entries(NUTRITION_FIELDS) as Array<[NutritionField, keyof Ingredient]>) {
      totals[field] = sumNutrient(defaults, source, `${listing.productName} (${listing.sizeName})`);
    }

    const name = `${listing.productName} (${listing.sizeName})`;
    const customizable = item.detail.product_ingredients.some(
      (ingredient) => ingredient.inclusion_type !== "D",
    );

    foods.push({
      sourceItemId: `product-${item.productId}-size-${item.sizeId}`,
      restaurantSlug: RESTAURANT_SLUG,
      name,
      // The catalog offers some subs under both their menu category and Deals as
      // separate products, so the category keeps their public slugs distinct.
      slug: foodSlug(RESTAURANT_SLUG, name, listing.sizeName, slugify(listing.categoryName)),
      description: `Default build: ${defaults.map((ingredient) => ingredient.name).join(", ")}`,
      category: listing.categoryName,
      categories: [listing.categoryName],
      servingSize: listing.sizeName,
      mealPeriod: /breakfast/i.test(listing.categoryName) ? "breakfast" : null,
      itemType: itemTypeOf(listing.categoryName, listing.productName),
      status: "active",
      isCustomizable: customizable,
      calories: totals.calories === null ? null : roundCalories(totals.calories),
      proteinG: published(totals.proteinG),
      carbsG: published(totals.carbsG),
      fatG: published(totals.fatG),
      saturatedFatG: published(totals.saturatedFatG),
      transFatG: published(totals.transFatG),
      fiberG: published(totals.fiberG),
      sugarG: published(totals.sugarG),
      sodiumMg: published(totals.sodiumMg),
      cholesterolMg: published(totals.cholesterolMg),
      sourceUrl: PUBLIC_NUTRITION_URL,
      sourceType: "json",
      sourceLastUpdated: document.sourceLastUpdated,
      scrapedAt: document.fetchedAt,
    });
  }

  if (withoutDefaults.length) {
    logger.warn(
      `${withoutDefaults.length} product sizes publish no default ingredients and were skipped: ${withoutDefaults.slice(0, 5).join(", ")}`,
    );
  }

  return foods;
}

async function fetchJerseyMikes(): Promise<SourceDocument> {
  const logger = createIngestionLogger(ADAPTER_KEY);
  logger.info("Fetching the official nutrition catalog...");
  const catalogDocument = await fetchOfficialSource(CATALOG_URL, { accept: JSON_ACCEPT });
  const catalog = catalogSchema.parse(JSON.parse(catalogDocument.body));

  const requests = catalog.flatMap((category) =>
    category.products.flatMap((product) =>
      product.sizes.map((size) => ({ categoryId: category.id, productId: product.id, sizeId: size.id })),
    ),
  );
  logger.info(`Catalog lists ${catalog.length} categories and ${requests.length} product sizes`);

  const items: Array<{ categoryId: string; productId: string; sizeId: string; detail: unknown }> = [];
  const missing: string[] = [];

  for (const [index, request] of requests.entries()) {
    if (index > 0) await sleep(REQUEST_SPACING_MS);
    const url = `${API_BASE}/nutrition/${request.productId}/${request.sizeId}`;

    try {
      const detail = await fetchOfficialSource(url, { accept: JSON_ACCEPT });
      items.push({ ...request, detail: JSON.parse(detail.body) });
    } catch (error) {
      // A retired product/size is expected attrition; anything else is a real
      // failure and must stop the run before it looks like a shrinking menu.
      if (error instanceof SourceRequestError && error.status === 404) {
        missing.push(`${request.productId}/${request.sizeId}`);
        if (missing.length > MAX_MISSING_ITEMS) {
          throw new Error(
            `${missing.length} product sizes are missing from the official nutrition service, above the allowance of ${MAX_MISSING_ITEMS}`,
          );
        }
        continue;
      }
      throw error;
    }

    if ((index + 1) % PROGRESS_EVERY === 0) {
      logger.info(`Fetched ${index + 1}/${requests.length} product sizes`);
    }
  }

  if (missing.length) logger.warn(`Skipped ${missing.length} retired product sizes: ${missing.join(", ")}`);
  logger.info(`Collected nutrition for ${items.length} product sizes`);

  return {
    body: JSON.stringify({ catalogUrl: CATALOG_URL, catalog, items }),
    fetchedAt: catalogDocument.fetchedAt,
    sourceLastUpdated: catalogDocument.sourceLastUpdated,
    etag: catalogDocument.etag,
    lastModified: catalogDocument.lastModified,
    contentType: catalogDocument.contentType,
  };
}

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/jerseymikes.sample.json", import.meta.url));

export const jerseyMikesAdapter: RestaurantAdapter = {
  key: ADAPTER_KEY,
  version: "1.0.0",
  restaurant: {
    slug: RESTAURANT_SLUG,
    name: "Jersey Mike's",
    websiteUrl: "https://www.jerseymikes.com",
  },
  source: {
    name: "Official Nutrition & Allergens data service",
    url: CATALOG_URL,
    type: "json",
  },
  minimumExpectedItems: 200,
  fetch: fetchJerseyMikes,
  parse: parseJerseyMikes,
  fixture: async () => ({
    body: await readFile(FIXTURE_PATH, "utf8"),
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "application/json",
  }),
};
