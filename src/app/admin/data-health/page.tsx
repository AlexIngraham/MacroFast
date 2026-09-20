import type { Metadata } from "next";
import { DatabaseNotice } from "@/components/database-notice";
import { listRecentQualityIssues, listRestaurantSummaries } from "@/db/queries";
import { safeQuery } from "@/db/safe-query";

export const metadata: Metadata = { title: "Data Health" };
export const dynamic = "force-dynamic";

export default async function DataHealthPage() {
  const [restaurants, issues] = await Promise.all([
    safeQuery(listRestaurantSummaries, []),
    safeQuery(() => listRecentQualityIssues(50), []),
  ]);
  return (
    <div className="shell page-stack content-page">
      <header className="page-heading"><span className="section-kicker">Internal operations</span><h1>Data health</h1><p>Ingestion freshness, failures, and records waiting for review.</p></header>
      {!restaurants.available ? <DatabaseNotice /> : null}
      <div className="health-grid">
        {restaurants.data.map((restaurant) => (
          <article className="health-card" key={restaurant.id}>
            <div><strong>{restaurant.name}</strong><span className={`status status-${restaurant.ingestionStatus}`}>{restaurant.ingestionStatus.replace("_", " ")}</span></div>
            <dl><div><dt>Active items</dt><dd>{restaurant.foodCount}</dd></div><div><dt>Last success</dt><dd>{restaurant.lastSuccessfulScrape?.toLocaleString() ?? "Never"}</dd></div><div><dt>Open issues</dt><dd>{restaurant.warningCount}</dd></div></dl>
          </article>
        ))}
      </div>
      <section><div className="section-heading"><div><span className="section-kicker">Review queue</span><h2>Open quality issues</h2></div></div>
        {issues.data.length ? <div className="issue-list">{issues.data.map((issue) => <article key={issue.id}><span className={`status status-${issue.severity === "error" ? "failed" : "warning"}`}>{issue.severity}</span><div><strong>{issue.restaurantName} · {issue.code}</strong><p>{issue.message}</p><small>{issue.createdAt.toLocaleString()}</small></div></article>)}</div> : <div className="empty-state"><strong>No open issues.</strong><span>Parser warnings and quarantined changes will appear here.</span></div>}
      </section>
    </div>
  );
}
