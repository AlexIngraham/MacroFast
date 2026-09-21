import type { NormalizedFood, NutritionValues } from "@/lib/domain";

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const TRACE = /^<\s*\d+(?:\.\d+)?$/;

export const NUTRITION_KEYS: Array<keyof NutritionValues> = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "saturatedFatG",
  "transFatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
  "cholesterolMg",
];

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Official charts mix plain numbers with "less than" notation and blanks.
 * `trace` keeps "<1" distinguishable from a genuinely unreadable cell so an
 * adapter can record an unknown sub-gram amount as null while still failing
 * loudly on a cell it does not understand.
 */
export type NutritionCell =
  | { kind: "value"; value: number }
  | { kind: "trace" }
  | { kind: "absent" }
  | { kind: "unreadable"; raw: string };

export function readNutritionCell(raw: string): NutritionCell {
  const cleaned = normalizeWhitespace(raw).replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "—" || cleaned.toUpperCase() === "N/A") return { kind: "absent" };
  if (NUMBER.test(cleaned)) return { kind: "value", value: Number(cleaned) };
  if (TRACE.test(cleaned)) return { kind: "trace" };
  return { kind: "unreadable", raw: cleaned };
}

/** Returns a number only when the cell is unambiguous; never guesses a value. */
export function parseNutritionNumber(raw: string): number | null {
  const cell = readNutritionCell(raw);
  return cell.kind === "value" ? cell.value : null;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Official charts repeat the same item under multiple headings. Identical
 * duplicates collapse into one food that keeps every category, while a real
 * nutrition disagreement fails the run instead of silently picking a winner.
 */
export function mergeDuplicateFoods(foods: NormalizedFood[]): NormalizedFood[] {
  const merged = new Map<string, NormalizedFood>();

  for (const food of foods) {
    const existing = merged.get(food.sourceItemId);
    if (!existing) {
      merged.set(food.sourceItemId, food);
      continue;
    }
    if (NUTRITION_KEYS.some((key) => existing[key] !== food[key])) {
      throw new Error(
        `Official source reports conflicting nutrition for "${food.name}" (${food.servingSize ?? "no serving size"})`,
      );
    }
    for (const category of food.categories) {
      if (!existing.categories.includes(category)) existing.categories.push(category);
    }
  }

  return [...merged.values()];
}
