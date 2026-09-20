import type { Metadata } from "next";
import { DatabaseNotice } from "@/components/database-notice";
import { RestaurantCard } from "@/components/restaurant-card";
import { listRestaurantSummaries } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";

export const metadata: Metadata = { title: "Restaurants" };
export const dynamic = "force-dynamic";

export default async function RestaurantsPage() {
  const result = await safeQuery(listRestaurantSummaries, []);
  return (
    <div className="shell page-stack content-page">
      <header className="page-heading">
        <span className="section-kicker">Verified menus</span>
        <h1>Restaurants</h1>
        <p>Each restaurant is backed by a documented official nutrition source and an independently testable adapter.</p>
      </header>
      {!result.available ? <DatabaseNotice /> : null}
      {result.data.length ? <div className="restaurant-grid">{result.data.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} />)}</div> : (
        <div className="empty-state"><strong>No restaurants ingested yet.</strong><span>Run the first official-source adapter to populate this page.</span></div>
      )}
    </div>
  );
}
