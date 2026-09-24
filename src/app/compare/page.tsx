import type { Metadata } from "next";
import Link from "next/link";
import { getFoodsByIds } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { DatabaseNotice } from "@/components/database-notice";
import type { FoodListItem } from "@/lib/domain";
import { itemRoleLabel } from "@/lib/item-role";
import { formatMetric, proteinPer100Calories } from "@/lib/metrics";

export const metadata: Metadata = { title: "Compare Fast Food Nutrition" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const value = (await searchParams).ids;
  const ids = (Array.isArray(value) ? value : value ? [value] : []).slice(0, 4);
  const result = await safeQuery(() => getFoodsByIds(ids), []);

  return (
    <div className="shell page-stack content-page">
      <header className="page-heading"><span className="section-kicker">Side by side</span><h1>Compare foods</h1><p>See the tradeoffs. “Best” depends on your own target.</p></header>
      {!result.available ? <DatabaseNotice /> : null}
      {!result.data.length ? (
        <div className="empty-state"><strong>No foods selected.</strong><span>Select two to four items from the food finder.</span><Link className="primary-button" href="/foods">Find foods</Link></div>
      ) : (
        <div className="comparison-wrap">
          <table className="comparison-table">
            <thead><tr><th>Metric</th>{result.data.map((food) => <th key={food.id}><Link href={`/food/${food.slug}`}>{food.name}</Link><span>{food.restaurantName}</span></th>)}</tr></thead>
            <tbody>
              <TextRow label="Role" foods={result.data} value={(food) => itemRoleLabel(food.itemRole)} />
              <TextRow label="Serving size" foods={result.data} value={(food) => food.servingSize ?? "Not published"} />
              <NumericRow label="Calories" foods={result.data} value={(food) => food.calories} emphasis="min" callout="Lowest calories" />
              <NumericRow label="Protein" foods={result.data} value={(food) => food.proteinG} unit="g" emphasis="max" callout="Highest protein" />
              <NumericRow label="Protein / 100 cal" foods={result.data} value={proteinPer100Calories} unit="g" emphasis="max" callout="Best efficiency" highlight />
              <NumericRow label="Carbs" foods={result.data} value={(food) => food.carbsG} unit="g" emphasis="min" callout="Lowest carbs" />
              <NumericRow label="Fat" foods={result.data} value={(food) => food.fatG} unit="g" emphasis="min" callout="Lowest fat" />
              <NumericRow label="Sodium" foods={result.data} value={(food) => food.sodiumMg} unit="mg" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TextRow({
  label,
  foods,
  value,
}: {
  label: string;
  foods: FoodListItem[];
  value: (food: FoodListItem) => string;
}) {
  return <tr><th>{label}</th>{foods.map((food) => <td key={food.id}>{value(food)}</td>)}</tr>;
}

function NumericRow({
  label,
  foods,
  value,
  unit = "",
  emphasis,
  callout,
  highlight = false,
}: {
  label: string;
  foods: FoodListItem[];
  value: (food: FoodListItem) => number | null;
  unit?: string;
  emphasis?: "min" | "max";
  callout?: string;
  highlight?: boolean;
}) {
  const values = foods.map(value).filter((item): item is number => item !== null);
  const emphasized = emphasis && values.length
    ? (emphasis === "min" ? Math.min(...values) : Math.max(...values))
    : null;

  return (
    <tr className={highlight ? "comparison-highlight" : undefined}>
      <th>{label}</th>
      {foods.map((food) => {
        const metric = value(food);
        const isEmphasized = metric !== null && metric === emphasized;
        return (
          <td className={isEmphasized ? "comparison-best" : undefined} key={food.id}>
            <strong>{formatMetric(metric, unit)}</strong>
            {isEmphasized && callout ? <small>{callout}</small> : null}
          </td>
        );
      })}
    </tr>
  );
}
