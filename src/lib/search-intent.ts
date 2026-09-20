import type { SearchIntent } from "@/lib/domain";

const PROTEIN_PATTERNS = [
  /(?:at\s+least|min(?:imum)?\s*)?(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(?:of\s+)?protein/gi,
  /protein\s*(?:>=|over|above|at\s+least)\s*(\d+(?:\.\d+)?)\s*g?/gi,
];
const CALORIE_PATTERNS = [
  /(?:under|below|less\s+than|up\s+to|<=|max(?:imum)?)\s*(\d+)\s*(?:cal(?:orie)?s?|kcal)?/gi,
  /(\d+)\s*(?:cal(?:orie)?s?|kcal)\s*(?:or\s+less|max(?:imum)?|and\s+under)/gi,
];

export function parseSearchIntent(input: string): SearchIntent {
  let text = input.trim();
  let minProtein: number | undefined;
  let maxCalories: number | undefined;

  for (const pattern of PROTEIN_PATTERNS) {
    text = text.replace(pattern, (_match, value: string) => {
      minProtein ??= Number(value);
      return " ";
    });
  }

  for (const pattern of CALORIE_PATTERNS) {
    text = text.replace(pattern, (_match, value: string) => {
      maxCalories ??= Number(value);
      return " ";
    });
  }

  return {
    text: text.replace(/\s+/g, " ").trim(),
    ...(maxCalories !== undefined ? { maxCalories } : {}),
    ...(minProtein !== undefined ? { minProtein } : {}),
  };
}
