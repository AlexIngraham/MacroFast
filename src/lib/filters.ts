import { z } from "zod";
import type { FoodFilters, FoodSort } from "@/lib/domain";
import { FOOD_SCOPES, type FoodScope } from "@/lib/item-role";
import { parseSearchIntent } from "@/lib/search-intent";

const optionalNumber = z.coerce.number().finite().nonnegative().optional().catch(undefined);
const sortSchema = z
  .enum([
    "protein_desc",
    "calories_asc",
    "protein_efficiency_desc",
    "calories_per_protein_asc",
    "fat_asc",
    "carbs_asc",
    "sodium_asc",
    "fiber_desc",
  ])
  .catch("protein_efficiency_desc");
const scopeSchema = z.enum(FOOD_SCOPES);

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseFoodFilters(params: SearchParams, defaultScope: FoodScope = "meals"): FoodFilters {
  const rawQuery = first(params.q)?.trim() ?? "";
  const intent = parseSearchIntent(rawQuery);
  const maxCalories = optionalNumber.parse(first(params.maxCalories)) ?? intent.maxCalories;
  const minProtein = optionalNumber.parse(first(params.minProtein)) ?? intent.minProtein;
  const page = z.coerce.number().int().positive().catch(1).parse(first(params.page));
  const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(first(params.limit));

  return {
    query: intent.text || undefined,
    restaurant: first(params.restaurant) || undefined,
    category: first(params.restaurant) ? first(params.category) || undefined : undefined,
    scope: scopeSchema.catch(defaultScope).parse(first(params.scope)),
    maxCalories,
    minProtein,
    maxFat: optionalNumber.parse(first(params.maxFat)),
    maxCarbs: optionalNumber.parse(first(params.maxCarbs)),
    maxSodium: optionalNumber.parse(first(params.maxSodium)),
    sort: sortSchema.parse(first(params.sort)) as FoodSort,
    limit,
    offset: (page - 1) * limit,
  };
}
