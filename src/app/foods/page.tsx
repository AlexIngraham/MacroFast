import type { Metadata } from "next";
import { DatabaseNotice } from "@/components/database-notice";
import { FilterBar } from "@/components/filter-bar";
import { FoodTable } from "@/components/food-table";
import { Pagination } from "@/components/pagination";
import { listCategories, listFoods, listRestaurantSummaries } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { parseFoodFilters } from "@/lib/filters";

export const metadata: Metadata = { title: "Find Fast Food by Macros" };
export const dynamic = "force-dynamic";

export default async function FoodsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseFoodFilters(rawParams);
  const [result, restaurants, categories] = await Promise.all([
    safeQuery(() => listFoods(filters), { items: [], total: 0 }),
    safeQuery(listRestaurantSummaries, []),
    safeQuery(() => listCategories(filters.restaurant), []),
  ]);

  return (
    <div className="shell page-stack content-page">
      <header className="page-heading">
        <span className="section-kicker">Macro finder</span>
        <h1>Find food that fits.</h1>
        <p>Filter verified menu nutrition by the numbers that matter to you.</p>
      </header>
      {!result.available ? <DatabaseNotice /> : null}
      <FilterBar filters={filters} restaurants={restaurants.data} categories={categories.data} />
      <div className="result-heading">
        <div><strong>{result.data.total}</strong> matching items</div>
        <span>Nutrition values reflect standard recipes from the linked source.</span>
      </div>
      <FoodTable foods={result.data.items} />
      <Pagination total={result.data.total} filters={filters} pathname="/foods" />
    </div>
  );
}
