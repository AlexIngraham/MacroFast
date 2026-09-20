import { z } from "zod";
import type { NormalizedFood, NutritionValues } from "@/lib/domain";
import type { QualityIssue, ValidationResult } from "@/ingestion/types";

const nutritionNumber = z.number().finite().nonnegative().nullable();
const normalizedFoodSchema = z.object({
  sourceItemId: z.string().min(1).max(300),
  restaurantSlug: z.string().min(1),
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(400),
  description: z.string().max(2_000).nullable(),
  category: z.string().min(1).max(150),
  categories: z.array(z.string().min(1).max(150)).min(1),
  servingSize: z.string().max(150).nullable(),
  mealPeriod: z.string().max(100).nullable(),
  itemType: z.string().max(100).nullable(),
  status: z.enum(["active", "limited", "regional", "discontinued"]),
  isCustomizable: z.boolean(),
  sourceUrl: z.url(),
  sourceType: z.enum(["html", "json", "pdf", "csv", "manual"]),
  sourceLastUpdated: z.date().nullable(),
  scrapedAt: z.date(),
  calories: z.number().int().nonnegative().nullable(),
  proteinG: nutritionNumber,
  carbsG: nutritionNumber,
  fatG: nutritionNumber,
  saturatedFatG: nutritionNumber,
  transFatG: nutritionNumber,
  fiberG: nutritionNumber,
  sugarG: nutritionNumber,
  sodiumMg: nutritionNumber,
  cholesterolMg: nutritionNumber,
});

const suspiciousUpperBounds: Partial<Record<keyof NutritionValues, number>> = {
  calories: 10_000,
  proteinG: 200,
  carbsG: 1_500,
  fatG: 300,
  saturatedFatG: 150,
  transFatG: 100,
  fiberG: 200,
  sugarG: 1_000,
  sodiumMg: 25_000,
  cholesterolMg: 5_000,
};

export function validateFood(input: NormalizedFood): ValidationResult {
  const parsed = normalizedFoodSchema.safeParse(input);
  const issues: QualityIssue[] = [];

  if (!parsed.success) {
    for (const problem of parsed.error.issues) {
      issues.push({
        severity: "error",
        code: "schema_validation",
        message: `${problem.path.join(".")}: ${problem.message}`,
        sourceItemId: input.sourceItemId,
      });
    }
    return { food: input, issues, accepted: false };
  }

  for (const [field, maximum] of Object.entries(suspiciousUpperBounds) as Array<
    [keyof NutritionValues, number]
  >) {
    const value = input[field];
    if (value !== null && value > maximum) {
      issues.push({
        severity: "warning",
        code: "implausible_value",
        message: `${field} value ${value} exceeds the review threshold of ${maximum}; verify the serving size`,
        sourceItemId: input.sourceItemId,
        field,
        proposedValue: value,
      });
    }
  }

  if (input.calories === null || input.proteinG === null) {
    issues.push({
      severity: "warning",
      code: "missing_primary_macro",
      message: "Calories or protein is missing, so efficiency rankings will exclude this item",
      sourceItemId: input.sourceItemId,
    });
  }

  return { food: parsed.data, issues, accepted: !issues.some((issue) => issue.severity === "error") };
}

const monitoredFields: Array<keyof NutritionValues> = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "sodiumMg",
];

export function detectNutritionChanges(
  previous: NutritionValues,
  proposed: NormalizedFood,
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const field of monitoredFields) {
    const oldValue = previous[field];
    const newValue = proposed[field];
    if (oldValue === null || newValue === null || oldValue === newValue) continue;

    const absoluteChange = Math.abs(newValue - oldValue);
    const relativeChange = oldValue === 0 ? Number.POSITIVE_INFINITY : absoluteChange / oldValue;
    const meaningfulAbsoluteChange = field === "sodiumMg" ? 250 : field === "calories" ? 100 : 10;

    if (relativeChange >= 0.5 && absoluteChange >= meaningfulAbsoluteChange) {
      issues.push({
        severity: "error",
        code: "major_nutrition_change",
        message: `${field} changed from ${oldValue} to ${newValue}; manual review is required`,
        sourceItemId: proposed.sourceItemId,
        field,
        previousValue: oldValue,
        proposedValue: newValue,
      });
    }
  }

  return issues;
}
