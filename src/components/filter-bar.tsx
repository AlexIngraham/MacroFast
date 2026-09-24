import Link from "next/link";
import type { FoodFilters, RestaurantSummary } from "@/lib/domain";
import { foodFiltersHref, type FoodFilterOverrides } from "@/lib/food-urls";
import { FOOD_SCOPES, type FoodScope } from "@/lib/item-role";

const sorts = [
  ["protein_efficiency_desc", "Best protein / calorie"],
  ["protein_desc", "Highest protein"],
  ["calories_asc", "Lowest calories"],
  ["calories_per_protein_asc", "Lowest calories / protein"],
  ["fat_asc", "Lowest fat"],
  ["carbs_asc", "Lowest carbs"],
  ["sodium_asc", "Lowest sodium"],
  ["fiber_desc", "Highest fiber"],
] as const;

export function FilterBar({
  filters,
  restaurants,
  categories,
  lockRestaurant = false,
  pathname = "/foods",
  defaultScope = "meals",
}: {
  filters: FoodFilters;
  restaurants: RestaurantSummary[];
  categories: string[];
  lockRestaurant?: boolean;
  pathname?: string;
  defaultScope?: FoodScope;
}) {
  const scopeLabels: Record<FoodScope, string> = {
    meals: "Meals",
    sides: "Sides",
    builds: "Builds",
    drinks: "Drinks",
    all: "All",
  };
  const restaurantName = restaurants.find((restaurant) => restaurant.slug === filters.restaurant)?.name;
  const clearHref = lockRestaurant
    ? `${pathname}?scope=${defaultScope}&restaurant=${filters.restaurant ?? ""}`
    : `${pathname}?scope=meals`;
  const cleanPresetHref = (overrides: FoodFilterOverrides) =>
    foodFiltersHref(pathname, filters, {
      q: null,
      category: null,
      maxCalories: null,
      minProtein: null,
      maxFat: null,
      maxCarbs: null,
      maxSodium: null,
      scope: defaultScope,
      ...overrides,
    });

  const chips: Array<{ label: string; href: string }> = [
    {
      label: scopeLabels[filters.scope],
      href: foodFiltersHref(pathname, filters, { scope: "all", category: null }),
    },
  ];
  if (filters.query) chips.push({ label: `“${filters.query}”`, href: foodFiltersHref(pathname, filters, { q: null }) });
  if (filters.restaurant && !lockRestaurant) {
    chips.push({
      label: restaurantName ?? filters.restaurant,
      href: foodFiltersHref(pathname, filters, { restaurant: null, category: null }),
    });
  }
  if (filters.category) chips.push({ label: filters.category, href: foodFiltersHref(pathname, filters, { category: null }) });
  if (filters.maxCalories !== undefined) chips.push({ label: `≤ ${filters.maxCalories} cal`, href: foodFiltersHref(pathname, filters, { maxCalories: null }) });
  if (filters.minProtein !== undefined) chips.push({ label: `≥ ${filters.minProtein} g protein`, href: foodFiltersHref(pathname, filters, { minProtein: null }) });
  if (filters.maxCarbs !== undefined) chips.push({ label: `≤ ${filters.maxCarbs} g carbs`, href: foodFiltersHref(pathname, filters, { maxCarbs: null }) });
  if (filters.maxFat !== undefined) chips.push({ label: `≤ ${filters.maxFat} g fat`, href: foodFiltersHref(pathname, filters, { maxFat: null }) });
  if (filters.maxSodium !== undefined) chips.push({ label: `≤ ${filters.maxSodium} mg sodium`, href: foodFiltersHref(pathname, filters, { maxSodium: null }) });

  return (
    <section className="finder-controls" aria-label="Food finder controls">
      <div className="scope-control">
        <span>Explore</span>
        <nav aria-label="Food scope">
          {FOOD_SCOPES.map((scope) => (
            <Link
              aria-current={filters.scope === scope ? "page" : undefined}
              href={foodFiltersHref(pathname, filters, { scope, category: null })}
              key={scope}
            >
              {scopeLabels[scope]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="goal-presets" aria-label="Goal presets">
        <span>Goal presets</span>
        <Link href={cleanPresetHref({ sort: "protein_desc" })}>High Protein</Link>
        <Link href={cleanPresetHref({ sort: "protein_efficiency_desc", maxCalories: 700, minProtein: 20 })}>Cutting</Link>
        <Link href={cleanPresetHref({ sort: "calories_asc" })}>Low Calorie</Link>
        <Link href={cleanPresetHref({ sort: "carbs_asc" })}>Low Carb</Link>
      </div>
      <form className="filter-panel" method="get">
        <input type="hidden" name="scope" value={filters.scope} />
        <div className="filter-search">
          <label htmlFor="filter-query">Search</label>
          <input id="filter-query" name="q" defaultValue={filters.query} placeholder="Food or restaurant" />
        </div>
        {lockRestaurant ? <input type="hidden" name="restaurant" value={filters.restaurant} /> : (
          <div>
            <label htmlFor="restaurant">Restaurant</label>
            <select id="restaurant" name="restaurant" defaultValue={filters.restaurant ?? ""}>
              <option value="">All restaurants</option>
              {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.slug}>{restaurant.name}</option>)}
            </select>
          </div>
        )}
        {filters.restaurant && categories.length > 0 ? (
          <div>
            <label htmlFor="category">Source category</label>
            <select id="category" name="category" defaultValue={filters.category ?? ""}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="maxCalories">Max calories</label>
          <input id="maxCalories" name="maxCalories" inputMode="numeric" defaultValue={filters.maxCalories} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="minProtein">Min protein</label>
          <input id="minProtein" name="minProtein" inputMode="decimal" defaultValue={filters.minProtein} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="maxCarbs">Max carbs</label>
          <input id="maxCarbs" name="maxCarbs" inputMode="decimal" defaultValue={filters.maxCarbs} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="maxFat">Max fat</label>
          <input id="maxFat" name="maxFat" inputMode="decimal" defaultValue={filters.maxFat} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="maxSodium">Max sodium</label>
          <input id="maxSodium" name="maxSodium" inputMode="decimal" defaultValue={filters.maxSodium} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={filters.sort}>
            {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <button className="primary-button filter-submit" type="submit">Apply filters</button>
      </form>
      <div className="active-filter-row" aria-label="Active filters">
        <div>{chips.map((chip) => <Link className="filter-chip" href={chip.href} key={`${chip.label}-${chip.href}`}>{chip.label}<span aria-hidden="true">×</span><span className="sr-only">Remove</span></Link>)}</div>
        <Link className="clear-filters" href={clearHref}>Clear all</Link>
      </div>
    </section>
  );
}
