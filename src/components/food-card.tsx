import Link from "next/link";
import type { FoodListItem } from "@/lib/domain";
import { itemRoleLabel } from "@/lib/item-role";
import { classifyFood, formatMetric, proteinPer100Calories } from "@/lib/metrics";

export function FoodCard({ food, rank }: { food: FoodListItem; rank?: number }) {
  const efficiency = proteinPer100Calories(food);
  const label = classifyFood(food).find((value) => value !== "Calorie Bomb");

  return (
    <article className="food-card">
      <div className="food-card-top">
        {rank ? <span className="rank">#{rank}</span> : null}
        <div className="card-badges">
          <span className="role-badge">{itemRoleLabel(food.itemRole)}</span>
          {label ? <span className="pill">{label}</span> : null}
        </div>
      </div>
      <Link className="food-card-title" href={`/food/${food.slug}`}>{food.name}</Link>
      <Link className="restaurant-link" href={`/restaurants/${food.restaurantSlug}`}>{food.restaurantName}</Link>
      <div className="card-macros">
        <MacroStatValue label="Calories" value={food.calories} unit="" />
        <MacroStatValue label="Protein" value={food.proteinG} />
        <MacroStatValue label="Carbs" value={food.carbsG} />
        <MacroStatValue label="Fat" value={food.fatG} />
      </div>
      <div className="efficiency-row">
        <span>Protein efficiency</span>
        <strong>{formatMetric(efficiency, "g")} <small>/ 100 cal</small></strong>
      </div>
    </article>
  );
}

function MacroStatValue({ label, value, unit = "g" }: { label: string; value: number | null; unit?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatMetric(value, value === null ? "" : unit)}</strong>
    </div>
  );
}
