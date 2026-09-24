import type { FoodListItem, NutritionValues } from "@/lib/domain";

export function proteinPer100Calories(food: Pick<NutritionValues, "proteinG" | "calories">): number | null {
  if (food.proteinG === null || food.calories === null || food.calories <= 0) return null;
  return (food.proteinG / food.calories) * 100;
}

export function caloriesPerGramProtein(food: Pick<NutritionValues, "proteinG" | "calories">): number | null {
  if (food.proteinG === null || food.calories === null || food.proteinG <= 0) return null;
  return food.calories / food.proteinG;
}

export type ObjectiveClassification =
  | "Protein Monster"
  | "Cutting Pick"
  | "Macro MVP"
  | "Low-Cal Pick"
  | "Balanced Meal"
  | "Calorie Bomb";

export function classifyFood(food: NutritionValues): ObjectiveClassification[] {
  const labels: ObjectiveClassification[] = [];
  const efficiency = proteinPer100Calories(food);
  const calories = food.calories;
  const protein = food.proteinG;

  if (protein !== null && protein >= 40) labels.push("Protein Monster");
  if (calories !== null && calories >= 250 && calories <= 700 && efficiency !== null && efficiency >= 8) {
    labels.push("Cutting Pick");
  }
  if (
    calories !== null &&
    calories >= 250 &&
    calories <= 750 &&
    efficiency !== null &&
    efficiency >= 8 &&
    food.fiberG !== null &&
    food.fiberG >= 3 &&
    (food.sodiumMg === null || food.sodiumMg <= 1_500)
  ) {
    labels.push("Macro MVP");
  }
  if (calories !== null && calories <= 350 && protein !== null && protein >= 15) labels.push("Low-Cal Pick");
  if (
    calories !== null &&
    calories >= 300 &&
    calories <= 750 &&
    protein !== null &&
    protein >= 25 &&
    (food.fatG === null || food.fatG <= 30) &&
    (food.carbsG === null || food.carbsG <= 80)
  ) {
    labels.push("Balanced Meal");
  }
  if (calories !== null && calories >= 800 && (efficiency === null || efficiency < 4)) labels.push("Calorie Bomb");

  return labels;
}

export function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

export function foodAccessibleSummary(food: FoodListItem): string {
  return [
    food.restaurantName,
    formatMetric(food.calories, " calories"),
    formatMetric(food.proteinG, " grams protein"),
  ].join(", ");
}
