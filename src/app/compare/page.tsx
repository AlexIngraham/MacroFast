import type { Metadata } from "next";
import Link from "next/link";
import { getFoodsByIds } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { DatabaseNotice } from "@/components/database-notice";
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
              <CompareRow label="Calories" foods={result.data} field="calories" />
              <CompareRow label="Protein" foods={result.data} field="proteinG" unit="g" />
              <tr className="comparison-highlight"><th>Protein / 100 cal</th>{result.data.map((food) => <td key={food.id}>{formatMetric(proteinPer100Calories(food), "g")}</td>)}</tr>
              <CompareRow label="Carbs" foods={result.data} field="carbsG" unit="g" />
              <CompareRow label="Fat" foods={result.data} field="fatG" unit="g" />
              <CompareRow label="Fiber" foods={result.data} field="fiberG" unit="g" />
              <CompareRow label="Sugar" foods={result.data} field="sugarG" unit="g" />
              <CompareRow label="Sodium" foods={result.data} field="sodiumMg" unit="mg" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, foods, field, unit = "" }: { label: string; foods: Awaited<ReturnType<typeof getFoodsByIds>>; field: keyof (typeof foods)[number]; unit?: string }) {
  return <tr><th>{label}</th>{foods.map((food) => <td key={food.id}>{formatMetric(food[field] as number | null, unit)}</td>)}</tr>;
}
