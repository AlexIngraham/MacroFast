import { notFound } from "next/navigation";
import { DatabaseNotice } from "@/components/database-notice";
import { FilterBar } from "@/components/filter-bar";
import { FoodTable } from "@/components/food-table";
import { Pagination } from "@/components/pagination";
import { getRestaurantBySlug, listCategories, listFoods, listRestaurantSummaries } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { parseFoodFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const restaurantState = await safeQuery(() => getRestaurantBySlug(slug), null);
  if (restaurantState.available && !restaurantState.data) notFound();

  const restaurant = restaurantState.data;
  const filters = parseFoodFilters({ ...(await searchParams), restaurant: slug });
  const [foods, restaurants, categories] = await Promise.all([
    safeQuery(() => listFoods(filters), { items: [], total: 0 }),
    safeQuery(listRestaurantSummaries, []),
    safeQuery(() => listCategories(slug), []),
  ]);

  return (
    <div className="shell page-stack content-page">
      <header className="restaurant-hero">
        <span className="restaurant-monogram restaurant-monogram-large">{restaurant?.name.slice(0, 2).toUpperCase() ?? "—"}</span>
        <div><span className="section-kicker">Restaurant menu</span><h1>{restaurant?.name ?? "Restaurant"}</h1><p>{foods.data.total} active nutrition records</p></div>
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
          <nav className="quick-filter-nav" aria-label="Quick filters">
            <a href={`/restaurants/${slug}?sort=protein_efficiency_desc`}>Best protein / calorie</a>
            <a href={`/restaurants/${slug}?sort=protein_desc`}>Highest protein</a>
            <a href={`/restaurants/${slug}?maxCalories=500`}>Under 500 cal</a>
            <a href={`/restaurants/${slug}?maxCalories=750`}>Under 750 cal</a>
            <a href={`/restaurants/${slug}?maxCarbs=20&sort=protein_desc`}>Low carb</a>
            <a href={`/restaurants/${slug}?category=Breakfast`}>Breakfast</a>
          </nav>
          <FilterBar filters={filters} restaurants={restaurants.data} categories={categories.data} lockRestaurant />
          <FoodTable foods={foods.data.items} showRestaurant={false} />
          <Pagination total={foods.data.total} filters={filters} pathname={`/restaurants/${slug}`} />
        </>
      )}
    </div>
  );
}
