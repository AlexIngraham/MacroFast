import type { FoodFilters, RestaurantSummary } from "@/lib/domain";

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

export function FilterBar({ filters, restaurants, categories, lockRestaurant = false }: {
  filters: FoodFilters;
  restaurants: RestaurantSummary[];
  categories: string[];
  lockRestaurant?: boolean;
}) {
  return (
    <form className="filter-panel" method="get">
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
      <div>
        <label htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue={filters.category ?? ""}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
      </div>
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
  );
}
