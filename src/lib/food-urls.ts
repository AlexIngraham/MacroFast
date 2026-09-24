import type { FoodFilters } from "@/lib/domain";

type FilterKey =
  | "q"
  | "restaurant"
  | "category"
  | "scope"
  | "maxCalories"
  | "minProtein"
  | "maxFat"
  | "maxCarbs"
  | "maxSodium"
  | "sort"
  | "limit"
  | "page";

export type FoodFilterOverrides = Partial<Record<FilterKey, string | number | null | undefined>>;

export function foodFilterParams(filters: FoodFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.restaurant) params.set("restaurant", filters.restaurant);
  if (filters.category) params.set("category", filters.category);
  params.set("scope", filters.scope);
  if (filters.maxCalories !== undefined) params.set("maxCalories", String(filters.maxCalories));
  if (filters.minProtein !== undefined) params.set("minProtein", String(filters.minProtein));
  if (filters.maxFat !== undefined) params.set("maxFat", String(filters.maxFat));
  if (filters.maxCarbs !== undefined) params.set("maxCarbs", String(filters.maxCarbs));
  if (filters.maxSodium !== undefined) params.set("maxSodium", String(filters.maxSodium));
  params.set("sort", filters.sort);
  if (filters.limit !== 50) params.set("limit", String(filters.limit));
  const page = Math.floor(filters.offset / filters.limit) + 1;
  if (page > 1) params.set("page", String(page));
  return params;
}

export function foodFiltersHref(
  pathname: string,
  filters: FoodFilters,
  overrides: FoodFilterOverrides = {},
): string {
  const params = foodFilterParams(filters);
  if (!Object.hasOwn(overrides, "page")) params.delete("page");

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
