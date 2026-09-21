import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ItemStatus, NormalizedFood } from "@/lib/domain";
import { fetchOfficialBinary, PDF_ACCEPT } from "@/ingestion/fetch";
import { createIngestionLogger } from "@/ingestion/logger";
import { mergeDuplicateFoods, normalizeWhitespace, readNutritionCell } from "@/ingestion/parse";
import { extractPdfPages, numericTableRowReader, splitPdfPages } from "@/ingestion/pdf";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { foodSlug, slugify } from "@/lib/slug";

const SOURCE_URL =
  "https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf";
const RESTAURANT_SLUG = "chipotle";

/** Portion, then Calories, Calories From Fat, Total Fat, Saturated Fats, Trans Fat, Cholesterol, Sodium, Carbohydrates, Dietary Fiber, Sugar, Protein. */
const VALUE_COUNT = 11;
/**
 * The chart carries occasional typographical damage (the current revision
 * prints one drink's calories as "10w"). A small allowance keeps a single bad
 * cell from failing an otherwise healthy import, while anything beyond that
 * means the layout changed and must be reviewed.
 */
const MAX_UNREADABLE_ROWS = 5;

const readRow = numericTableRowReader({
  columnCount: VALUE_COUNT,
  servingSize: /\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|ea)/,
});
/** The last column heading; rows only begin once a table header has been seen. */
const HEADER_END = /^protein\s*\(g\)$/i;
const KIDS_HEADING = /^kid'?s\s+menu$/i;
/** Revision stamp printed in the footer, for example "OCT-2024-US-CK". */
const REVISION = /^([A-Z]{3}-\d{4}-US(?:-[A-Z]+)?)$/;

type Section = "main" | "kids";

const MAIN_CATEGORY = "What Goes Inside";
const PROTEIN_CATEGORY = "Proteins";
const SIDES_AND_DRINKS_CATEGORY = "Sides & Drinks";
const KIDS_CATEGORY = "Kid's Menu";

const PROTEINS = new Set(["chicken", "steak", "barbacoa", "carnitas", "sofritas"]);
/** Kid's drinks are sold by weight rather than fluid ounces, so name them explicitly. */
const NAMED_DRINKS = new Set(["organic-milk", "organic-chocolate-milk", "organic-apple-juice"]);
const NAMED_SIDES = new Set([
  "guacamole-large",
  "queso-blanco-side",
  "queso-blanco-large",
  "mandarins",
  "blueberries",
]);
const DRESSINGS = new Set(["chipotle-honey-vinaigrette"]);
/** Fountain and bottled drinks are the only items served at this volume or more. */
const DRINK_MINIMUM_FL_OZ = 8;

interface RawRow {
  pageIndex: number;
  section: Section;
  name: string;
  portion: string;
  values: string[];
}

function identityOf(row: Pick<RawRow, "section" | "name" | "portion">): string {
  return slugify(`${row.name}-${row.portion}${row.section === "kids" ? "-kids-menu" : ""}`);
}

function fluidOunces(portion: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*fl\s*oz$/i.exec(portion);
  return match ? Number(match[1]) : null;
}

function itemTypeOf(name: string, portion: string): string {
  const key = slugify(name);
  if (NAMED_DRINKS.has(key)) return "drink";
  const volume = fluidOunces(portion);
  if (volume !== null && volume >= DRINK_MINIMUM_FL_OZ) return "drink";
  if (NAMED_SIDES.has(key) || key.startsWith("chips")) return "side";
  if (DRESSINGS.has(key)) return "sauce";
  return "component";
}

function categoryOf(name: string, portion: string, section: Section): string {
  if (section === "kids") return KIDS_CATEGORY;
  const itemType = itemTypeOf(name, portion);
  if (itemType === "drink" || itemType === "side") return SIDES_AND_DRINKS_CATEGORY;
  if (PROTEINS.has(slugify(name))) return PROTEIN_CATEGORY;
  return MAIN_CATEGORY;
}

function readRows(body: string): { rows: RawRow[]; revisions: string[]; tablePages: number } {
  const rows: RawRow[] = [];
  const revisions: string[] = [];
  let tablePages = 0;

  splitPdfPages(body).forEach((page, pageIndex) => {
    let headerSeen = false;
    let section: Section = "main";
    let lastName: string | null = null;

    for (const rawLine of page.split("\n")) {
      const line = normalizeWhitespace(rawLine);
      if (!line) continue;

      const revision = REVISION.exec(line);
      if (revision && !revisions.includes(revision[1])) revisions.push(revision[1]);

      if (HEADER_END.test(line)) {
        if (!headerSeen) tablePages += 1;
        headerSeen = true;
        lastName = null;
        continue;
      }
      if (KIDS_HEADING.test(line)) {
        section = "kids";
        lastName = null;
        continue;
      }
      if (!headerSeen) continue;

      const row = readRow(line);
      if (!row) continue;

      const name: string | null = row.name || lastName;
      // A continuation row carries only an extra size for the product above it.
      if (!name) continue;
      lastName = name;

      rows.push({ pageIndex, section, name, portion: row.servingSize, values: row.cells });
    }
  });

  return { rows, revisions, tablePages };
}

export function parseChipotle(document: SourceDocument): NormalizedFood[] {
  const logger = createIngestionLogger(RESTAURANT_SLUG);
  const { rows, revisions, tablePages } = readRows(document.body);

  // Recorded before values are validated so a damaged cell cannot change an
  // item's regional classification.
  const pagesByIdentity = new Map<string, Set<number>>();
  for (const row of rows) {
    const identity = identityOf(row);
    const pages = pagesByIdentity.get(identity) ?? new Set<number>();
    pages.add(row.pageIndex);
    pagesByIdentity.set(identity, pages);
  }

  const foods: NormalizedFood[] = [];
  const unreadable: string[] = [];

  for (const row of rows) {
    const cells = row.values.map(readNutritionCell);
    const damaged = cells.find((cell) => cell.kind === "unreadable");
    if (damaged?.kind === "unreadable") {
      unreadable.push(`${row.name} (${row.portion}) cell "${damaged.raw}"`);
      continue;
    }
    // "<1" means an unknown sub-unit amount, so it is recorded as unknown
    // rather than rounded to a number the chart never published.
    const [
      calories,
      ,
      fatG,
      saturatedFatG,
      transFatG,
      cholesterolMg,
      sodiumMg,
      carbsG,
      fiberG,
      sugarG,
      proteinG,
    ] = cells.map((cell) => (cell.kind === "value" ? cell.value : null));

    const identity = identityOf(row);
    const pages = pagesByIdentity.get(identity);
    // Pages 2 and 3 repeat every food but carry different bottler drink
    // lineups, so an item on a single page is only offered in some markets.
    const status: ItemStatus = tablePages > 1 && pages?.size === 1 ? "regional" : "active";
    const variant = row.section === "kids" ? "kids-menu" : null;

    foods.push({
      sourceItemId: identity,
      restaurantSlug: RESTAURANT_SLUG,
      name: row.name,
      slug: foodSlug(RESTAURANT_SLUG, row.name, row.portion, variant),
      description: null,
      category: categoryOf(row.name, row.portion, row.section),
      categories: [categoryOf(row.name, row.portion, row.section)],
      servingSize: row.portion,
      mealPeriod: null,
      itemType: itemTypeOf(row.name, row.portion),
      status,
      isCustomizable: false,
      calories,
      proteinG,
      carbsG,
      fatG,
      saturatedFatG,
      transFatG,
      fiberG,
      sugarG,
      sodiumMg,
      cholesterolMg,
      sourceUrl: SOURCE_URL,
      sourceType: "pdf",
      sourceLastUpdated: document.sourceLastUpdated,
      scrapedAt: document.fetchedAt,
    });
  }

  if (unreadable.length > MAX_UNREADABLE_ROWS) {
    throw new Error(
      `Could not read nutrition cells on ${unreadable.length} rows, above the allowance of ${MAX_UNREADABLE_ROWS}. The chart layout may have changed. First: ${unreadable[0]}`,
    );
  }
  for (const row of unreadable) logger.warn(`Skipped a row with an unreadable cell: ${row}`);
  if (revisions.length) logger.info(`Chart revision ${revisions.join(", ")}`);

  return mergeDuplicateFoods(foods);
}

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/chipotle.sample.txt", import.meta.url));

export const chipotleAdapter: RestaurantAdapter = {
  key: "chipotle",
  version: "1.0.0",
  restaurant: {
    slug: RESTAURANT_SLUG,
    name: "Chipotle",
    websiteUrl: "https://www.chipotle.com",
  },
  source: {
    name: "Official U.S. Nutrition Facts chart (PDF)",
    url: SOURCE_URL,
    type: "pdf",
  },
  minimumExpectedItems: 100,
  fetch: async () => {
    const logger = createIngestionLogger(RESTAURANT_SLUG);
    logger.info("Downloading the official nutrition chart...");
    const { bytes, ...metadata } = await fetchOfficialBinary(SOURCE_URL, { accept: PDF_ACCEPT });
    logger.info(`Downloaded ${bytes.byteLength} bytes; extracting text`);
    return { body: await extractPdfPages(bytes), ...metadata };
  },
  parse: parseChipotle,
  fixture: async () => ({
    body: await readFile(FIXTURE_PATH, "utf8"),
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "application/pdf",
  }),
};
