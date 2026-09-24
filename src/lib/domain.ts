import type { FoodScope, ItemRole } from "@/lib/item-role";

export const SOURCE_TYPES = ["html", "json", "pdf", "csv", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const ITEM_STATUSES = ["active", "limited", "regional", "discontinued"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type NullableNumber = number | null;

export interface NutritionValues {
  calories: NullableNumber;
  proteinG: NullableNumber;
  carbsG: NullableNumber;
  fatG: NullableNumber;
  saturatedFatG: NullableNumber;
  transFatG: NullableNumber;
  fiberG: NullableNumber;
  sugarG: NullableNumber;
  sodiumMg: NullableNumber;
  cholesterolMg: NullableNumber;
}

export interface NormalizedFood extends NutritionValues {
  sourceItemId: string;
  restaurantSlug: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  categories: string[];
  servingSize: string | null;
  mealPeriod: string | null;
  itemType: string | null;
  status: ItemStatus;
  isCustomizable: boolean;
  sourceUrl: string;
  sourceType: SourceType;
  sourceLastUpdated: Date | null;
  scrapedAt: Date;
}

export interface FoodListItem extends NutritionValues {
  id: string;
  sourceItemId: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  categories: string[];
  servingSize: string | null;
  mealPeriod: string | null;
  itemType: string | null;
  status: ItemStatus;
  sourceUrl: string;
  sourceLastUpdated: Date | null;
  scrapedAt: Date;
  lastChangedAt: Date;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  itemRole: ItemRole;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string;
  displayOrder: number;
  foodCount: number;
  lastSuccessfulScrape: Date | null;
  lastAttemptedScrape: Date | null;
  ingestionStatus: "healthy" | "warning" | "failed" | "never_run";
  warningCount: number;
}

export type FoodSort =
  | "protein_desc"
  | "calories_asc"
  | "protein_efficiency_desc"
  | "calories_per_protein_asc"
  | "fat_asc"
  | "carbs_asc"
  | "sodium_asc"
  | "fiber_desc";

export interface FoodFilters {
  query?: string;
  restaurant?: string;
  category?: string;
  scope: FoodScope;
  maxCalories?: number;
  minProtein?: number;
  maxFat?: number;
  maxCarbs?: number;
  maxSodium?: number;
  sort: FoodSort;
  limit: number;
  offset: number;
}

export interface SearchIntent {
  text: string;
  maxCalories?: number;
  minProtein?: number;
}
