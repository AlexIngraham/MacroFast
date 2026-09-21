import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { NormalizedFood } from "@/lib/domain";
import { fetchOfficialBinary, fetchOfficialSource, PDF_ACCEPT } from "@/ingestion/fetch";
import { createIngestionLogger } from "@/ingestion/logger";
import { mergeDuplicateFoods, normalizeWhitespace, readNutritionCell } from "@/ingestion/parse";
import { extractPdfPages, numericTableRowReader, splitPdfPages } from "@/ingestion/pdf";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { foodSlug, slugify } from "@/lib/slug";

/** The chart is a dated asset, so its link is read from this page each run. */
const NUTRITION_PAGE_URL = "https://www.subway.com/en-US/MenuNutrition/Nutrition";
const RESTAURANT_SLUG = "subway";
const ADAPTER_KEY = "subway";

/** Calories, Total Fat, Sat. Fat, Trans Fat, Chol., Sodium, Carbohydrate, Dietary Fiber, Sugars, Added Sugars, Protein, then four % Daily Value columns. */
const COLUMN_COUNT = 15;
const MAX_UNREADABLE_ROWS = 5;

const readRow = numericTableRowReader({ columnCount: COLUMN_COUNT, servingSize: /\d+/ });

/**
 * The column headings repeat on every page as one line per column. They are
 * skipped explicitly so a heading such as "Calcium % DV" cannot be mistaken for
 * a menu section and relabel the rows that follow it.
 */
const COLUMN_HEADING =
  /^(serving size \(g\)|calories|total fat \(g\)|sat\. fat \(g\)|trans fat \(g\)\*?|chol\. \(mg\)|sodium \(mg\)|carbohydrate ?\(g\)|dietary fiber \(g\)|sugars \(g\)|added sugars \(g\)|protein ?\(g\)|vitamin [ac] % ?dv|calcium % ?dv|iron % ?dv)$/i;
const TABLE_START = /^serving size \(g\)$/i;
/**
 * The chart nests a protein grouping under each menu format, and the same
 * grouping name reappears under several formats, so both levels are tracked.
 */
const SUBSECTIONS = new Set([
  "cheesesteaks",
  "chicken",
  "italians",
  "deli-classics",
  "clubs",
  "local-favorites",
  "fresh-fit",
  "kids-mini-sub",
]);

/**
 * Each page ends with a legend block: upper-case labels naming the page's menu
 * groups, the explanatory notes, and the publication month. None of them are
 * menu sections, and treating one as a section would relabel the rows that
 * continue onto the next page.
 */
const LEGEND_LINE =
  /^(values include|double values|amount on|a registered dietitian|u\.s\. nutrition information|\*|\d+the gluten-free|2,000 calories|dressing unless noted)/i;
const UPPER_CASE_LABEL = /^[^a-z]+$/;
const PUBLICATION_DATE =
  /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;
/** Footnote markers on a name; two of them mean the item is not sold everywhere. */
const TRAILING_MARKERS = /\s*\*+$/;
const REGIONAL_MARKER = /\*{2,}$/;

const DRINK = /coffee|water|soda|juice|milk(?!\s*shake)/i;
const DESSERT = /cookie|brownie|churro|doughnut|donut|cinnabon|muffin/i;
const SAUCE = /sauce|mayonnaise|mustard|dressing|vinaigrette|oil|vinegar|ranch|sriracha|hot honey|giardiniera/i;

interface RawRow {
  section: string;
  subsection: string | null;
  name: string;
  regional: boolean;
  servingSize: string;
  cells: string[];
}

function looksLikeHeading(line: string): boolean {
  if (LEGEND_LINE.test(line) || PUBLICATION_DATE.test(line)) return false;
  // Headings are short labels; the legal copy is full sentences.
  return line.split(/\s+/).length <= 8 && /[A-Za-z]/.test(line);
}

function itemTypeOf(section: string, name: string): string {
  const key = slugify(section);
  if (key.includes("condiments") || key.includes("seasonings")) return SAUCE.test(name) ? "sauce" : "topping";
  if (key === "vegetables") return "topping";
  if (key === "cheese") return "topping";
  if (key === "breads" || key === "individual-proteins") return "component";
  if (key.includes("cookies") || key.includes("sides")) {
    if (DESSERT.test(name)) return "dessert";
    if (DRINK.test(name)) return "drink";
    return "side";
  }
  if (key.includes("soup")) return "side";
  return "entree";
}

/**
 * Drops each page's trailing legend block while keeping a genuine section
 * heading that introduces rows continuing on the next page.
 */
function usableLines(page: string): string[] {
  const lines = page.split("\n").map(normalizeWhitespace).filter(Boolean);
  let lastRow = -1;
  for (const [index, line] of lines.entries()) if (readRow(line)) lastRow = index;
  if (lastRow < 0) return [];

  const kept = lines.slice(0, lastRow + 1);
  for (const line of lines.slice(lastRow + 1)) {
    if (!UPPER_CASE_LABEL.test(line) && looksLikeHeading(line)) kept.push(line);
  }
  return kept;
}

function readRows(body: string): RawRow[] {
  const rows: RawRow[] = [];
  let headerSeen = false;
  let section: string | null = null;
  let subsection: string | null = null;

  for (const page of splitPdfPages(body)) {
    for (const line of usableLines(page)) {
      if (COLUMN_HEADING.test(line)) {
        if (TABLE_START.test(line)) headerSeen = true;
        continue;
      }

      const row = headerSeen ? readRow(line) : null;
      if (!row) {
        if (!looksLikeHeading(line)) continue;
        if (SUBSECTIONS.has(slugify(line.replace(TRAILING_MARKERS, "")))) subsection = line;
        else {
          section = line;
          subsection = null;
        }
        continue;
      }

      if (!section || !row.name) continue;
      rows.push({
        section,
        subsection,
        name: row.name.replace(TRAILING_MARKERS, "").trim(),
        regional: REGIONAL_MARKER.test(row.name),
        servingSize: row.servingSize,
        cells: row.cells,
      });
    }
  }

  return rows;
}

export function parseSubway(document: SourceDocument): NormalizedFood[] {
  const logger = createIngestionLogger(ADAPTER_KEY);
  const rows = readRows(document.body);
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
      fatG,
      saturatedFatG,
      transFatG,
      cholesterolMg,
      sodiumMg,
      carbsG,
      fiberG,
      sugarG,
    ] = cells.map((cell) => (cell.kind === "value" ? cell.value : null));
    const proteinCell = cells[10];

    const category = normalizeWhitespace(row.section.replace(TRAILING_MARKERS, ""));
    const subcategory = row.subsection ? normalizeWhitespace(row.subsection.replace(TRAILING_MARKERS, "")) : null;
    const servingSize = `${row.servingSize} g`;

    foods.push({
      sourceItemId: slugify([category, subcategory, row.name, servingSize].filter(Boolean).join("-")),
      restaurantSlug: RESTAURANT_SLUG,
      name: row.name,
      slug: foodSlug(RESTAURANT_SLUG, row.name, servingSize, slugify([category, subcategory].filter(Boolean).join("-"))),
      description: null,
      category,
      categories: subcategory ? [category, subcategory] : [category],
      servingSize,
      mealPeriod: /egg patty|breakfast/i.test(category) ? "breakfast" : null,
      itemType: itemTypeOf(category, row.name),
      status: row.regional ? "regional" : "active",
      isCustomizable: false,
      calories,
      proteinG: proteinCell?.kind === "value" ? proteinCell.value : null,
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
      `Could not read nutrition cells on ${unreadable.length} rows, above the allowance of ${MAX_UNREADABLE_ROWS}. The chart layout may have changed. First: ${unreadable[0]}`,
    );
  }
  for (const row of unreadable) logger.warn(`Skipped a row with an unreadable cell: ${row}`);

  // A legend label leaking into the section state would relabel whole blocks of
  // the chart, so refuse the run rather than publish a nonsense category.
  const suspect = foods.find(
    (food) => UPPER_CASE_LABEL.test(food.category) || PUBLICATION_DATE.test(food.category),
  );
  if (suspect && !slugify(suspect.category).includes("protein-bowls")) {
    throw new Error(`Section detection produced the legend label "${suspect.category}"; the chart layout changed`);
  }

  const merged = mergeDuplicateFoods(foods);
  logger.info(`Read ${new Set(merged.map((food) => food.category)).size} chart sections`);
  return merged;
}

/** Reads the current U.S. nutrition chart link from the official nutrition page. */
export function findChartUrl(html: string): string {
  const $ = cheerio.load(html);
  const href = $('a[href$=".pdf"]')
    .toArray()
    .map((anchor) => $(anchor).attr("href") ?? "")
    .find((candidate) => /nutrition/i.test(candidate) && !/allergen|ingredient/i.test(candidate));
  if (!href) throw new Error(`No U.S. nutrition chart PDF is linked from ${NUTRITION_PAGE_URL}`);
  return new URL(href, NUTRITION_PAGE_URL).toString();
}

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/subway.sample.txt", import.meta.url));

export const subwayAdapter: RestaurantAdapter = {
  key: ADAPTER_KEY,
  version: "1.0.0",
  restaurant: {
    slug: RESTAURANT_SLUG,
    name: "Subway",
    websiteUrl: "https://www.subway.com",
  },
  source: {
    name: "Official U.S. Nutrition Information chart (PDF)",
    url: NUTRITION_PAGE_URL,
    type: "pdf",
  },
  minimumExpectedItems: 200,
  fetch: async () => {
    const logger = createIngestionLogger(ADAPTER_KEY);
    logger.info("Reading the official nutrition page for the current chart link...");
    const page = await fetchOfficialSource(NUTRITION_PAGE_URL);
    const chartUrl = findChartUrl(page.body);

    logger.info(`Downloading ${chartUrl}`);
    const { bytes, ...metadata } = await fetchOfficialBinary(chartUrl, { accept: PDF_ACCEPT });
    logger.info(`Downloaded ${bytes.byteLength} bytes; extracting text`);
    return { body: await extractPdfPages(bytes), ...metadata };
  },
  parse: parseSubway,
  fixture: async () => ({
    body: await readFile(FIXTURE_PATH, "utf8"),
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "application/pdf",
  }),
};
