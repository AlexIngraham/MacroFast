import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFoodBySlug } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";
import { DatabaseNotice } from "@/components/database-notice";
import { MacroStat } from "@/components/macro-stat";
import { caloriesPerGramProtein, classifyFood, formatMetric, proteinPer100Calories } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const state = await safeQuery(() => getFoodBySlug(slug), null);
  if (!state.data) return { title: "Food nutrition" };
  return { title: `${state.data.name} Nutrition`, description: `${state.data.restaurantName} ${state.data.name}: calories, protein, carbs, fat, and protein efficiency.` };
}

export default async function FoodPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await safeQuery(() => getFoodBySlug(slug), null);
  if (!result.available) return <div className="shell content-page"><DatabaseNotice /></div>;
  if (!result.data) notFound();
  const food = result.data;
  const efficiency = proteinPer100Calories(food);
  const labels = classifyFood(food);

  return (
    <div className="shell page-stack content-page food-detail-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/foods">Foods</Link><span>/</span><Link href={`/restaurants/${food.restaurantSlug}`}>{food.restaurantName}</Link></nav>
      <header className="food-detail-header">
        <div>
          <Link className="section-kicker" href={`/restaurants/${food.restaurantSlug}`}>{food.restaurantName}</Link>
          <h1>{food.name}</h1>
          <p>{food.category}{food.servingSize ? ` · Serving ${food.servingSize}` : ""}</p>
          <div className="label-row">{labels.map((label) => <span className={label === "Calorie Bomb" ? "pill pill-warning" : "pill"} key={label}>{label}</span>)}</div>
        </div>
        <div className="efficiency-hero"><span>Protein efficiency</span><strong>{formatMetric(efficiency, "g")}</strong><small>protein / 100 calories</small></div>
      </header>
      <section className="nutrition-panel">
        <div className="primary-macros">
          <MacroStat label="Calories" value={food.calories} unit="" primary />
          <MacroStat label="Protein" value={food.proteinG} primary />
          <MacroStat label="Carbohydrates" value={food.carbsG} primary />
          <MacroStat label="Total fat" value={food.fatG} primary />
        </div>
        <div className="secondary-macros">
          <MacroStat label="Fiber" value={food.fiberG} />
          <MacroStat label="Sugar" value={food.sugarG} />
          <MacroStat label="Saturated fat" value={food.saturatedFatG} />
          <MacroStat label="Trans fat" value={food.transFatG} />
          <MacroStat label="Sodium" value={food.sodiumMg} unit="mg" />
          <MacroStat label="Cholesterol" value={food.cholesterolMg} unit="mg" />
        </div>
      </section>
      <section className="metric-explainer">
        <div><span>Calories per gram of protein</span><strong>{formatMetric(caloriesPerGramProtein(food), " cal")}</strong></div>
        <p>Lower is more protein-efficient. This is an objective ratio, not a claim that one food is universally healthier.</p>
      </section>
      <section className="source-card">
        <div><span className="section-kicker">Source transparency</span><h2>Where these numbers came from</h2></div>
        <dl>
          <div><dt>Official source</dt><dd><a href={food.sourceUrl} rel="noreferrer" target="_blank">{food.restaurantName} nutrition information ↗</a></dd></div>
          <div><dt>Observed</dt><dd>{food.scrapedAt.toLocaleDateString("en-US", { dateStyle: "long" })}</dd></div>
          <div><dt>Source updated</dt><dd>{food.sourceLastUpdated?.toLocaleDateString("en-US", { dateStyle: "long" }) ?? "Not published"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
