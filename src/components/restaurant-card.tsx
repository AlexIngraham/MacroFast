import Link from "next/link";
import type { RestaurantSummary } from "@/lib/domain";

export function RestaurantCard({ restaurant }: { restaurant: RestaurantSummary }) {
  return (
    <Link className="restaurant-card" href={`/restaurants/${restaurant.slug}`}>
      <span className="restaurant-monogram">{restaurant.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{restaurant.name}</strong>
        <span>{restaurant.foodCount > 0 ? `${restaurant.foodCount} tracked items` : "Nutrition coming soon"}</span>
      </div>
      <span className="card-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
