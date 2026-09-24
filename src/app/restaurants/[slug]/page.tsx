import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseNotice } from "@/components/database-notice";
import { FilterBar } from "@/components/filter-bar";
import { FoodCard } from "@/components/food-card";
import { FoodTable } from "@/components/food-table";
import { Pagination } from "@/components/pagination";
import {
  getRestaurantBySlug,
  getRestaurantDiscoveryProfile,
  listCategories,
  listFoods,
  listRestaurantSummaries,
} from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { parseFoodFilters } from "@/lib/filters";
import { foodFiltersHref } from "@/lib/food-urls";
import { defaultScopeForRestaurant } from "@/lib/item-role";
import type { FoodListItem } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const rawParams = await searchParams;
  const [restaurantState, profileState] = await Promise.all([
    safeQuery(() => getRestaurantBySlug(slug), null),
    safeQuery(() => getRestaurantDiscoveryProfile(slug), { mealCount: 0, buildCount: 0 }),
  ]);
  if (restaurantState.available && !restaurantState.data) notFound();

  const restaurant = restaurantState.data;
  const defaultScope = defaultScopeForRestaurant({
    meals: profileState.data.mealCount,
    builds: profileState.data.buildCount,
  });
  const filters = parseFoodFilters({ ...rawParams, restaurant: slug }, defaultScope);
  const mealFilters = { ...filters, scope: "meals" as const, category: undefined, query: undefined, offset: 0, limit: 3 };
  const hasMeals = profileState.data.mealCount > 0;
  const [foods, restaurants, categories, highProtein, cutting, lowerCalorie] = await Promise.all([
    safeQuery(() => listFoods(filters), { items: [], total: 0 }),
    safeQuery(listRestaurantSummaries, []),
    safeQuery(() => listCategories(slug, filters.scope), []),
    hasMeals
      ? safeQuery(() => listFoods({ ...mealFilters, sort: "protein_desc" }), { items: [], total: 0 })
      : Promise.resolve({ data: { items: [], total: 0 }, available: true }),
    hasMeals
      ? safeQuery(
          () => listFoods({ ...mealFilters, sort: "protein_efficiency_desc", maxCalories: 700, minProtein: 20 }),
          { items: [], total: 0 },
        )
      : Promise.resolve({ data: { items: [], total: 0 }, available: true }),
    hasMeals
      ? safeQuery(() => listFoods({ ...mealFilters, sort: "calories_asc", maxCalories: 600 }), { items: [], total: 0 })
      : Promise.resolve({ data: { items: [], total: 0 }, available: true }),
  ]);
  const isBuildOnly = !hasMeals && profileState.data.buildCount > 0;

  return (
    <div className="shell page-stack content-page">
      <header className="restaurant-hero">
        <span className="restaurant-monogram restaurant-monogram-large">{restaurant?.name.slice(0, 2).toUpperCase() ?? "—"}</span>
        <div><span className="section-kicker">Restaurant menu</span><h1>{restaurant?.name ?? "Restaurant"}</h1><p>{restaurant?.foodCount ?? foods.data.total} active nutrition records</p></div>
      </header>
      {!foods.available ? <DatabaseNotice /> : null}
      {restaurant && restaurant.foodCount === 0 ? (
        <section className="empty-state restaurant-coming-soon">
          <strong>Nutrition adapter coming soon.</strong>
          <span>{restaurant.name} is in the catalog, but no verified nutrition records have been imported yet.</span>
          <a className="secondary-button" href={restaurant.websiteUrl} rel="noreferrer" target="_blank">Visit official website ↗</a>
        </section>
      ) : (
        <>
          {isBuildOnly ? (
            <section className="build-source-notice">
              <div><span className="section-kicker">Ingredient-level source</span><h2>Build with official components</h2></div>
              <p>{restaurant?.name ?? "This restaurant"} publishes nutrition by ingredient, so MacroFast shows official build components rather than inventing finished custom orders.</p>
              <Link className="secondary-button" href={foodFiltersHref(`/restaurants/${slug}`, filters, { scope: "builds", category: null })}>Explore build components</Link>
            </section>
          ) : null}
          {hasMeals ? (
            <RestaurantDashboard
              highProtein={highProtein.data.items}
              cutting={cutting.data.items}
              lowerCalorie={lowerCalorie.data.items}
            />
          ) : null}
          <nav className="quick-filter-nav" aria-label="Quick filters">
            <Link href={foodFiltersHref(`/restaurants/${slug}`, filters, { sort: "protein_efficiency_desc" })}>Best protein / calorie</Link>
            <Link href={foodFiltersHref(`/restaurants/${slug}`, filters, { sort: "protein_desc" })}>Highest protein</Link>
            <Link href={foodFiltersHref(`/restaurants/${slug}`, filters, { maxCalories: 500 })}>Under 500 cal</Link>
            <Link href={foodFiltersHref(`/restaurants/${slug}`, filters, { maxCalories: 750 })}>Under 750 cal</Link>
            <Link href={foodFiltersHref(`/restaurants/${slug}`, filters, { maxCarbs: 20, sort: "protein_desc" })}>Low carb</Link>
          </nav>
          <FilterBar
            filters={filters}
            restaurants={restaurants.data}
            categories={categories.data}
            lockRestaurant
            pathname={`/restaurants/${slug}`}
            defaultScope={defaultScope}
          />
          <div className="result-heading">
            <div><strong>{foods.data.total}</strong> matching items</div>
            <span>Source categories are available after choosing a discovery scope.</span>
          </div>
          <FoodTable foods={foods.data.items} showRestaurant={false} />
          <Pagination total={foods.data.total} filters={filters} pathname={`/restaurants/${slug}`} />
        </>
      )}
    </div>
  );
}

function RestaurantDashboard({
  highProtein,
  cutting,
  lowerCalorie,
}: {
  highProtein: FoodListItem[];
  cutting: FoodListItem[];
  lowerCalorie: FoodListItem[];
}) {
  const slices = [
    { title: "High Protein", description: "Meals sorted by protein", foods: highProtein },
    { title: "Cutting Picks", description: "Meals sorted by protein per 100 calories", foods: cutting },
    { title: "Lower Calorie", description: "Meals under 600 calories", foods: lowerCalorie },
  ];

  return (
    <section className="restaurant-dashboard" aria-labelledby="restaurant-picks">
      <div className="section-heading">
        <div><span className="section-kicker">Order-ready picks</span><h2 id="restaurant-picks">Start with a goal</h2></div>
      </div>
      <div className="dashboard-slices">
        {slices.map((slice) => (
          <section className="dashboard-slice" key={slice.title}>
            <header><h3>{slice.title}</h3><span>{slice.description}</span></header>
            <div>{slice.foods.map((food, index) => <FoodCard food={food} key={food.id} rank={index + 1} />)}</div>
          </section>
        ))}
      </div>
    </section>
  );
}
