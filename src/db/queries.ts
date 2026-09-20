import { and, asc, count, desc, eq, ilike, inArray, lte, gte, or, sql, type SQL } from "drizzle-orm";
import { foods, restaurants, scrapeRuns, dataQualityIssues } from "@/db/schema";
import { getDatabase } from "@/db/client";
import type { FoodFilters, FoodListItem, RestaurantSummary } from "@/lib/domain";

const foodSelection = {
  id: foods.id,
  sourceItemId: foods.sourceItemId,
  name: foods.name,
  slug: foods.slug,
  description: foods.description,
  category: foods.category,
  categories: foods.categories,
  servingSize: foods.servingSize,
  mealPeriod: foods.mealPeriod,
  itemType: foods.itemType,
  status: foods.status,
  sourceUrl: foods.sourceUrl,
  sourceLastUpdated: foods.sourceLastUpdated,
  scrapedAt: foods.scrapedAt,
  lastChangedAt: foods.lastChangedAt,
  restaurantId: restaurants.id,
  restaurantName: restaurants.name,
  restaurantSlug: restaurants.slug,
  calories: foods.calories,
  proteinG: foods.proteinG,
  carbsG: foods.carbsG,
  fatG: foods.fatG,
  saturatedFatG: foods.saturatedFatG,
  transFatG: foods.transFatG,
  fiberG: foods.fiberG,
  sugarG: foods.sugarG,
  sodiumMg: foods.sodiumMg,
  cholesterolMg: foods.cholesterolMg,
};

function foodConditions(filters: FoodFilters): SQL[] {
  const conditions: SQL[] = [eq(foods.isAvailable, true)];
  if (filters.query) {
    const pattern = `%${filters.query.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(foods.name, pattern), ilike(restaurants.name, pattern))!);
  }
  if (filters.restaurant) conditions.push(eq(restaurants.slug, filters.restaurant));
  if (filters.category) conditions.push(sql`${filters.category} = any(${foods.categories})`);
  if (filters.maxCalories !== undefined) conditions.push(lte(foods.calories, filters.maxCalories));
  if (filters.minProtein !== undefined) conditions.push(gte(foods.proteinG, filters.minProtein));
  if (filters.maxFat !== undefined) conditions.push(lte(foods.fatG, filters.maxFat));
  if (filters.maxCarbs !== undefined) conditions.push(lte(foods.carbsG, filters.maxCarbs));
  if (filters.maxSodium !== undefined) conditions.push(lte(foods.sodiumMg, filters.maxSodium));
  return conditions;
}

function foodOrder(sort: FoodFilters["sort"]): SQL {
  switch (sort) {
    case "protein_desc":
      return sql`${foods.proteinG} desc nulls last`;
    case "calories_asc":
      return sql`${foods.calories} asc nulls last`;
    case "calories_per_protein_asc":
      return sql`${foods.calories}::numeric / nullif(${foods.proteinG}, 0) asc nulls last`;
    case "fat_asc":
      return sql`${foods.fatG} asc nulls last`;
    case "carbs_asc":
      return sql`${foods.carbsG} asc nulls last`;
    case "sodium_asc":
      return sql`${foods.sodiumMg} asc nulls last`;
    case "fiber_desc":
      return sql`${foods.fiberG} desc nulls last`;
    case "protein_efficiency_desc":
    default:
      return sql`${foods.proteinG} * 100.0 / nullif(${foods.calories}, 0) desc nulls last`;
  }
}

export async function listFoods(filters: FoodFilters): Promise<{ items: FoodListItem[]; total: number }> {
  const db = getDatabase();
  const conditions = foodConditions(filters);
  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db
      .select(foodSelection)
      .from(foods)
      .innerJoin(restaurants, eq(foods.restaurantId, restaurants.id))
      .where(where)
      .orderBy(foodOrder(filters.sort), asc(foods.name))
      .limit(filters.limit)
      .offset(filters.offset),
    db
      .select({ count: count() })
      .from(foods)
      .innerJoin(restaurants, eq(foods.restaurantId, restaurants.id))
      .where(where),
  ]);

  return { items, total: totalRows[0]?.count ?? 0 };
}

export async function getFoodBySlug(slug: string): Promise<FoodListItem | null> {
  const rows = await getDatabase()
    .select(foodSelection)
    .from(foods)
    .innerJoin(restaurants, eq(foods.restaurantId, restaurants.id))
    .where(and(eq(foods.slug, slug), eq(foods.isAvailable, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getFoodsByIds(ids: string[]): Promise<FoodListItem[]> {
  if (ids.length === 0) return [];
  return getDatabase()
    .select(foodSelection)
    .from(foods)
    .innerJoin(restaurants, eq(foods.restaurantId, restaurants.id))
    .where(and(eq(foods.isAvailable, true), inArray(foods.id, ids)))
    .limit(4);
}

export async function listCategories(restaurantSlug?: string): Promise<string[]> {
  const conditions = [eq(foods.isAvailable, true)];
  if (restaurantSlug) conditions.push(eq(restaurants.slug, restaurantSlug));
  const rows = await getDatabase()
    .selectDistinct({ category: sql<string>`unnest(${foods.categories})` })
    .from(foods)
    .innerJoin(restaurants, eq(foods.restaurantId, restaurants.id))
    .where(and(...conditions))
    .orderBy(sql`1`);
  return rows.map((row) => row.category);
}

export async function listRestaurantSummaries(): Promise<RestaurantSummary[]> {
  const db = getDatabase();
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    website_url: string;
    display_order: number;
    food_count: number;
    last_successful_scrape: Date | null;
    last_attempted_scrape: Date | null;
    latest_status: "succeeded" | "partial" | "failed" | "running" | null;
    warning_count: number;
  }>(sql`
    select
      r.id,
      r.name,
      r.slug,
      r.website_url,
      r.display_order,
      count(distinct f.id)::int as food_count,
      max(sr.finished_at) filter (where sr.status = 'succeeded') as last_successful_scrape,
      max(sr.started_at) as last_attempted_scrape,
      (array_agg(sr.status order by sr.started_at desc) filter (where sr.id is not null))[1] as latest_status,
      count(distinct dqi.id) filter (where dqi.status = 'open')::int as warning_count
    from restaurants r
    left join foods f on f.restaurant_id = r.id and f.is_available = true
    left join scrape_runs sr on sr.restaurant_id = r.id
    left join data_quality_issues dqi on dqi.scrape_run_id = sr.id and dqi.status = 'open'
    where r.is_active = true
    group by r.id
    order by r.display_order asc, r.name asc
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    websiteUrl: row.website_url,
    displayOrder: row.display_order,
    foodCount: row.food_count,
    lastSuccessfulScrape: row.last_successful_scrape,
    lastAttemptedScrape: row.last_attempted_scrape,
    ingestionStatus:
      row.latest_status === null
        ? "never_run"
        : row.latest_status === "failed"
          ? "failed"
          : row.latest_status === "partial" || row.warning_count > 0
            ? "warning"
            : "healthy",
    warningCount: row.warning_count,
  }));
}

export async function getRestaurantBySlug(slug: string): Promise<RestaurantSummary | null> {
  const restaurants = await listRestaurantSummaries();
  return restaurants.find((restaurant) => restaurant.slug === slug) ?? null;
}

export async function listRecentQualityIssues(limit = 50) {
  return getDatabase()
    .select({
      id: dataQualityIssues.id,
      severity: dataQualityIssues.severity,
      code: dataQualityIssues.code,
      message: dataQualityIssues.message,
      sourceItemId: dataQualityIssues.sourceItemId,
      status: dataQualityIssues.status,
      createdAt: dataQualityIssues.createdAt,
      restaurantName: restaurants.name,
      runStartedAt: scrapeRuns.startedAt,
    })
    .from(dataQualityIssues)
    .innerJoin(scrapeRuns, eq(dataQualityIssues.scrapeRunId, scrapeRuns.id))
    .innerJoin(restaurants, eq(scrapeRuns.restaurantId, restaurants.id))
    .where(eq(dataQualityIssues.status, "open"))
    .orderBy(desc(dataQualityIssues.createdAt))
    .limit(limit);
}

export async function databaseIsReady(): Promise<boolean> {
  try {
    await getDatabase().execute(sql`select 1 from restaurants limit 1`);
    return true;
  } catch {
    return false;
  }
}
