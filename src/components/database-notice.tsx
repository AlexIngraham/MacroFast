export function DatabaseNotice() {
  return (
    <aside className="notice" role="status">
      <div>
        <strong>Nutrition data is not connected yet.</strong>
        <span> Start PostgreSQL, run the migration, then ingest an official source. No placeholder foods are shown.</span>
      </div>
      <code>npm run db:migrate &amp;&amp; npm run scrape chickfila</code>
    </aside>
  );
}
