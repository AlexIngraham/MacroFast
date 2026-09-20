import Link from "next/link";
import type { FoodListItem } from "@/lib/domain";
import { formatMetric, proteinPer100Calories } from "@/lib/metrics";

export function FoodTable({ foods, showRestaurant = true, selectable = true }: {
  foods: FoodListItem[];
  showRestaurant?: boolean;
  selectable?: boolean;
}) {
  if (!foods.length) {
    return <div className="empty-state"><strong>No matching foods yet.</strong><span>Try widening your filters.</span></div>;
  }

  return (
    <form action="/compare" method="get">
      <div className="food-table-wrap">
        <table className="food-table">
          <thead>
            <tr>
              {selectable ? <th className="select-column"><span className="sr-only">Compare</span></th> : null}
              <th>Food</th>
              <th>Calories</th>
              <th>Protein</th>
              <th>Carbs</th>
              <th>Fat</th>
              <th>Protein / 100 cal</th>
            </tr>
          </thead>
          <tbody>
            {foods.map((food) => (
              <tr key={food.id}>
                {selectable ? <td><input type="checkbox" name="ids" value={food.id} aria-label={`Compare ${food.name}`} /></td> : null}
                <td>
                  <Link className="table-title" href={`/food/${food.slug}`}>{food.name}</Link>
                  <span className="table-subtitle">{showRestaurant ? food.restaurantName : food.category}{food.servingSize ? ` · ${food.servingSize}` : ""}</span>
                </td>
                <td><strong>{formatMetric(food.calories)}</strong></td>
                <td className="protein-cell"><strong>{formatMetric(food.proteinG, "g")}</strong></td>
                <td>{formatMetric(food.carbsG, "g")}</td>
                <td>{formatMetric(food.fatG, "g")}</td>
                <td><span className="efficiency-chip">{formatMetric(proteinPer100Calories(food), "g")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectable ? <div className="table-actions"><span>Select up to four foods</span><button className="secondary-button" type="submit">Compare selected</button></div> : null}
      <div className="mobile-food-list">
        {foods.map((food) => <FoodCardCompact key={food.id} food={food} selectable={selectable} />)}
      </div>
    </form>
  );
}

function FoodCardCompact({ food, selectable }: { food: FoodListItem; selectable: boolean }) {
  return (
    <article className="compact-card">
      <div>
        <Link className="table-title" href={`/food/${food.slug}`}>{food.name}</Link>
        <span className="table-subtitle">{food.restaurantName} · {food.category}</span>
      </div>
      {selectable ? <input type="checkbox" name="ids" value={food.id} aria-label={`Compare ${food.name}`} /> : null}
      <div className="compact-macros">
        <span><strong>{formatMetric(food.calories)}</strong> cal</span>
        <span><strong>{formatMetric(food.proteinG, "g")}</strong> protein</span>
        <span><strong>{formatMetric(proteinPer100Calories(food), "g")}</strong> / 100 cal</span>
      </div>
    </article>
  );
}
