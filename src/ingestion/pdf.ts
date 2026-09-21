import { extractText, getDocumentProxy } from "unpdf";

/**
 * Page boundaries stay visible in the extracted text because official charts
 * repeat sections per page (for example one beverage lineup per bottler), and
 * adapters need to know which page a row came from. The marker is also readable
 * in committed fixtures.
 */
export const PDF_PAGE_BREAK = "=== PDF PAGE BREAK ===";

/**
 * Converts an official PDF into deterministic page-delimited text so the
 * restaurant parser stays a pure, fixture-testable function over a string.
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  if (!pages.length) throw new Error("Official PDF contained no extractable pages");
  return pages.join(`\n${PDF_PAGE_BREAK}\n`);
}

export function splitPdfPages(body: string): string[] {
  return body.split(PDF_PAGE_BREAK);
}

/** A number, an FDA "less than" amount such as "<1", or a cell with stray characters. */
const CELL = String.raw`<?\d[\d.,]*[A-Za-z]?`;

export interface NumericTableRow {
  name: string;
  servingSize: string;
  cells: string[];
}

export interface NumericTableRowOptions {
  /** How many nutrition columns follow the serving size. */
  columnCount: number;
  /** Matches the serving-size token that separates the item name from the numbers. */
  servingSize: RegExp;
  /** Trailing markers to drop first, such as the allergen "X" columns some charts append. */
  trailing?: RegExp;
}

/**
 * Builds a reader for the one row shape every official nutrition chart shares
 * once its PDF is flattened to text: an item name, a serving size, then a fixed
 * run of nutrition cells. Returning null for a non-row lets a caller walk a page
 * line by line and ignore headings and legal copy.
 */
export function numericTableRowReader(
  options: NumericTableRowOptions,
): (line: string) => NumericTableRow | null {
  const servingSize = options.servingSize.source;
  const pattern = new RegExp(
    String.raw`^(.*?)\s*(${servingSize})\s+((?:${CELL}\s+){${options.columnCount - 1}}${CELL})$`,
    "i",
  );

  return (line) => {
    const trimmed = options.trailing ? line.replace(options.trailing, "") : line;
    // Charts print "< 1" with a space, which would otherwise read as two cells.
    const match = pattern.exec(trimmed.replace(/<\s+/g, "<"));
    if (!match) return null;
    return { name: match[1].trim(), servingSize: match[2].trim(), cells: match[3].split(/\s+/) };
  };
}
