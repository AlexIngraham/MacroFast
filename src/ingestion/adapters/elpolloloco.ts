import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { NormalizedFood } from "@/lib/domain";
import { fetchOfficialBinary, fetchOfficialSource, PDF_ACCEPT } from "@/ingestion/fetch";
import { createIngestionLogger } from "@/ingestion/logger";
import { mergeDuplicateFoods, normalizeWhitespace, readNutritionCell } from "@/ingestion/parse";
import { extractPdfPages, numericTableRowReader } from "@/ingestion/pdf";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { foodSlug, slugify } from "@/lib/slug";

/** The guide's file name carries its revision, so the link is read from this page each run. */
const NUTRITION_PAGE_URL = "https://www.elpolloloco.com/nutrition";
const RESTAURANT_SLUG = "el-pollo-loco";
const ADAPTER_KEY = "elpolloloco";

/** Total Calories, Calories from Fat, Total Fat, Saturated Fat, Trans Fat, Cholesterol, Sodium, Total Carbohydrates, Dietary Fiber, Sugars, Protein. */
const COLUMN_COUNT = 11;
const MAX_UNREADABLE_ROWS = 5;

const readRow = numericTableRowReader({
  columnCount: COLUMN_COUNT,
  servingSize: /\d+(?:\.\d+)?/,
  /** The guide appends an "X" per allergen present. */
  trailing: /(?:\s+X)+\s*$/i,
});

const HEADER_END = /^protein\s*\(g\)$/i;
/** Revision stamp printed in the footer, for example "M4 2026". */
const REVISION = /^(M\d+\s+\d{4})$/;
/** Section banners are upper case, sometimes with a mixed-case parenthetical. */
const SECTION = /^[A-Z][A-Z0-9 &'’.\-*/®™]*$/;
const NOT_A_SECTION = /^nutrition (guide|information)/i;

const DESSERT = /churro|flan/i;
const DRINK = /coffee|chata|horchata|agua|lemonade|tea|soda|water|punch/i;
const SAUCE = /sauce|dressing|vinaigrette/i;
const DRINKS_SECTION = /drinks/i;
/** Fountain sizes print on their own row beneath the drink they belong to. */
const DRINK_SIZE = /\s*\b(Regular|Large|Small|Medium|Bottle)$/i;
/**
 * The guide footnotes limited availability with two or three asterisks
 * ("Texas and Louisiana Locations Only", "Limited Locations"). A single
 * asterisk is only a note about dressing, so it does not change availability.
 */
const REGIONAL_MARKER = /\*{2,}$/;
const TRAILING_MARKERS = /\*+$/;

interface RawRow {
  section: string;
  name: string;
  regional: boolean;
  servingSize: string;
  cells: string[];
}

function withoutMarkers(name: string): { name: string; regional: boolean } {
  return { name: name.replace(TRAILING_MARKERS, "").trim(), regional: REGIONAL_MARKER.test(name) };
}

/**
 * Rebuilds fountain-drink names. A long drink name wraps onto the size row, so
 * "Minute Maid® Aguas Frescas Regular" followed by "Mango Lime Large" is one
 * drink in two sizes rather than a drink called "Mango Lime Large".
 */
function resolveDrinkSizes(rows: RawRow[]): RawRow[] {
  const resolved: RawRow[] = [];
  let group: Array<{ row: RawRow; size: string }> = [];

  const flush = () => {
    if (!group.length) return;
    const name = group
      .map(({ row }) => row.name)
      .filter(Boolean)
      .join(" ");
    const regional = group.some(({ row }) => row.regional);
    for (const { row, size } of group) resolved.push({ ...row, name: `${name} (${size})`, regional });
    group = [];
  };

  for (const row of rows) {
    const size = DRINKS_SECTION.test(row.section) ? DRINK_SIZE.exec(row.name) : null;
    if (!size) {
      flush();
      resolved.push(row);
      continue;
    }
    // Only "Large" continues the drink above it; any other size starts a group.
    if (!/^large$/i.test(size[1]) || !group.length) flush();
    const fragment = withoutMarkers(row.name.slice(0, size.index));
    group.push({ row: { ...row, ...fragment }, size: size[1] });
  }

  flush();
  return resolved;
}

function itemTypeOf(section: string, name: string): string {
  if (/drinks/i.test(section)) return "drink";
  if (/salsas/i.test(section)) return "sauce";
  if (DESSERT.test(name)) return "dessert";
  if (/sides/i.test(section)) return SAUCE.test(name) ? "sauce" : "side";
  // A single grilled piece is part of a plate rather than a plate on its own.
  if (/fire-grilled chicken/i.test(section)) return "component";
  if (/featured/i.test(section)) {
    if (DRINK.test(name)) return "drink";
    if (/beans|chips|tortilla/i.test(name)) return "side";
    if (/tender/i.test(name)) return "component";
  }
  return "entree";
}

function readRows(body: string): { rows: RawRow[]; revisions: string[] } {
  const rows: RawRow[] = [];
  const revisions: string[] = [];
  let headerSeen = false;
  let section: string | null = null;
  let lastName: string | null = null;

  for (const rawLine of body.split("\n")) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    const revision = REVISION.exec(line);
    if (revision) {
      if (!revisions.includes(revision[1])) revisions.push(revision[1]);
      continue;
    }

    if (HEADER_END.test(line)) {
      headerSeen = true;
      continue;
    }

    const row = headerSeen ? readRow(line) : null;
    if (!row) {
      const banner = line.replace(/\([^)]*\)/g, " ").trim();
      if (SECTION.test(banner) && /[A-Z]{3}/.test(banner) && !NOT_A_SECTION.test(line)) {
        section = line;
        lastName = null;
      }
      continue;
    }

    // A wrapped row carries only a size, so it inherits the name above it.
    const rawName: string | null = row.name || lastName;
    if (!rawName || !section) continue;
    lastName = rawName;

    rows.push({
      section,
      ...withoutMarkers(rawName),
      servingSize: row.servingSize,
      cells: row.cells,
    });
  }

  return { rows: resolveDrinkSizes(rows), revisions };
}

export function parseElPolloLoco(document: SourceDocument): NormalizedFood[] {
  const logger = createIngestionLogger(ADAPTER_KEY);
  const { rows, revisions } = readRows(document.body);
  const foods: NormalizedFood[] = [];
  const unreadable: string[] = [];

  for (const row of rows) {
    const cells = row.cells.map(readNutritionCell);
    const damaged = cells.find((cell) => cell.kind === "unreadable");
    if (damaged?.kind === "unreadable") {
      unreadable.push(`${row.name} cell "${damaged.raw}"`);
      continue;
    }

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

    const servingSize = `${row.servingSize} oz`;
    const category = normalizeWhitespace(row.section);
    const name = row.name;
    const itemType = itemTypeOf(category, name);

    foods.push({
      sourceItemId: slugify(`${category}-${name}-${servingSize}`),
      restaurantSlug: RESTAURANT_SLUG,
      name,
      slug: foodSlug(RESTAURANT_SLUG, name, servingSize, slugify(category)),
      description: null,
      category,
      categories: [category],
      servingSize,
      mealPeriod: null,
      itemType,
      status: row.regional ? "regional" : "active",
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
      sourceUrl: NUTRITION_PAGE_URL,
      sourceType: "pdf",
      sourceLastUpdated: document.sourceLastUpdated,
      scrapedAt: document.fetchedAt,
    });
  }

  if (unreadable.length > MAX_UNREADABLE_ROWS) {
    throw new Error(
      `Could not read nutrition cells on ${unreadable.length} rows, above the allowance of ${MAX_UNREADABLE_ROWS}. The guide layout may have changed. First: ${unreadable[0]}`,
    );
  }
  for (const row of unreadable) logger.warn(`Skipped a row with an unreadable cell: ${row}`);
  if (revisions.length) logger.info(`Guide revision ${revisions.join(", ")}`);

  return mergeDuplicateFoods(foods);
}

/** Reads the current guide link from the official nutrition page. */
export function findGuideUrl(html: string): string {
  const $ = cheerio.load(html);
  const href = $('a[href$=".pdf"]')
    .toArray()
    .map((anchor) => $(anchor).attr("href") ?? "")
    .find((candidate) => /nutrition/i.test(candidate));
  if (!href) throw new Error(`No nutrition guide PDF is linked from ${NUTRITION_PAGE_URL}`);
  return new URL(href, NUTRITION_PAGE_URL).toString();
}

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/elpolloloco.sample.txt", import.meta.url));

export const elPolloLocoAdapter: RestaurantAdapter = {
  key: ADAPTER_KEY,
  version: "1.0.0",
  restaurant: {
    slug: RESTAURANT_SLUG,
    name: "El Pollo Loco",
    websiteUrl: "https://www.elpolloloco.com",
  },
  source: {
    name: "Official Nutrition Guide (PDF)",
    url: NUTRITION_PAGE_URL,
    type: "pdf",
  },
  minimumExpectedItems: 90,
  fetch: async () => {
    const logger = createIngestionLogger(ADAPTER_KEY);
    logger.info("Reading the official nutrition page for the current guide link...");
    const page = await fetchOfficialSource(NUTRITION_PAGE_URL);
    const guideUrl = findGuideUrl(page.body);

    logger.info(`Downloading ${guideUrl}`);
    const { bytes, ...metadata } = await fetchOfficialBinary(guideUrl, { accept: PDF_ACCEPT });
    logger.info(`Downloaded ${bytes.byteLength} bytes; extracting text`);
    return { body: await extractPdfPages(bytes), ...metadata };
  },
  parse: parseElPolloLoco,
  fixture: async () => ({
    body: await readFile(FIXTURE_PATH, "utf8"),
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "application/pdf",
  }),
};
