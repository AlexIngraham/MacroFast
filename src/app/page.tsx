import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import { FoodCard } from "@/components/food-card";
import { HeroSearch } from "@/components/hero-search";
import { RestaurantCard } from "@/components/restaurant-card";
import { listFoods, listRestaurantSummaries } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";

export const dynamic = "force-dynamic";

const baseFilters = { sort: "protein_efficiency_desc" as const, limit: 6, offset: 0 };

export default async function HomePage() {
  const [restaurants, efficient, protein] = await Promise.all([
    safeQuery(listRestaurantSummaries, []),
    safeQuery(() => listFoods({ ...baseFilters, maxCalories: 700, minProtein: 20 }), { items: [], total: 0 }),
    safeQuery(() => listFoods({ ...baseFilters, sort: "protein_desc", maxCalories: 1000 }), { items: [], total: 0 }),
  ]);
  const available = restaurants.available && efficient.available && protein.available;

  return (
    <>
      <HeroSearch />
      <div className="shell page-stack">
        {!available ? <DatabaseNotice /> : null}
        <section>
          <div className="section-heading">
            <div><span className="section-kicker">Cut smarter</span><h2>Best protein per calorie</h2></div>
            <Link href="/foods?sort=protein_efficiency_desc&maxCalories=700&minProtein=20">View all <span aria-hidden="true">→</span></Link>
          </div>
          {efficient.data.items.length ? (
            <div className="food-grid">{efficient.data.items.map((food, index) => <FoodCard key={food.id} food={food} rank={index + 1} />)}</div>
          ) : <EmptySection text="Official nutrition records will appear here after the first ingestion run." />}
        </section>
        <section className="goal-strip">
          <div><span className="section-kicker">Start with your goal</span><h2>One tap. Useful answers.</h2></div>
          <div className="goal-links">
            <Link href="/foods?maxCalories=500&sort=protein_desc"><strong>≤500</strong><span>calorie picks</span></Link>
            <Link href="/foods?minProtein=40&sort=calories_asc"><strong>40g+</strong><span>protein meals</span></Link>
            <Link href="/foods?maxCarbs=20&sort=protein_desc"><strong>Low</strong><span>carb options</span></Link>
          </div>
        </section>
        <section>
          <div className="section-heading">
            <div><span className="section-kicker">Big numbers</span><h2>Protein monsters</h2></div>
            <Link href="/foods?sort=protein_desc&minProtein=40">View all <span aria-hidden="true">→</span></Link>
          </div>
          {protein.data.items.length ? (
            <div className="food-grid">{protein.data.items.map((food) => <FoodCard key={food.id} food={food} />)}</div>
          ) : <EmptySection text="High-protein items will appear after official data is imported." />}
        </section>
        <section>
          <div className="section-heading">
            <div><span className="section-kicker">Browse the menu</span><h2>Restaurants</h2></div>
            <Link href="/restaurants">All restaurants <span aria-hidden="true">→</span></Link>
          </div>
          {restaurants.data.length ? (
            <div className="restaurant-grid">{restaurants.data.slice(0, 8).map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} />)}</div>
          ) : <EmptySection text="Restaurants are created by their first successful source setup—not by placeholder seeds." />}
        </section>
      </div>
    </>
  );
}

function EmptySection({ text }: { text: string }) {
  return <div className="empty-state"><strong>Waiting for verified data</strong><span>{text}</span></div>;
}
