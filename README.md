# MacroFast

MacroFast turns official restaurant nutrition data into fast, goal-oriented answers: high-protein meals, efficient cutting picks, calorie-budget filters, comparisons, and transparent source provenance. Its catalog is automatically populated with 40 priority U.S. chains; restaurants without a verified adapter are clearly marked as coming soon.

The first production ingestion adapter targets Chick-fil-A's official, server-rendered nutrition table. The architecture is adapter-based so each restaurant can use the most reliable source it offers (HTML, JSON, PDF, or a reviewed manual import) without coupling source parsing to database or UI code.

## Stack

- Next.js App Router + TypeScript
- PostgreSQL + Drizzle ORM
- Zod validation
- Vitest for parser and business-logic tests
- Plain CSS with responsive table/card views

## Local setup

1. Use Node 22 LTS (`nvm use` if you use nvm), then copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d db` or provide your own `DATABASE_URL`.
3. Install packages with `npm install`.
4. Apply the migration with `npm run db:migrate`. This also synchronizes the complete restaurant catalog.
5. Import official Chick-fil-A data with `npm run scrape chickfila`.
6. Start the site with `npm run dev`.

The app deliberately shows an empty/setup state until official data has been ingested. It does not seed fabricated nutrition records.

## Commands

```bash
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run scrape chickfila
npm run scrape all
npm run refresh
```

Use `npm run scrape chickfila -- --fixture` to exercise the complete parser and validation pipeline against the small sanitized fixture without making a network request. Fixture mode validates the pipeline but intentionally does not write the partial fixture to the database.

The included GitHub Actions workflow refreshes all registered adapters every Monday. Configure `MACROFAST_DATABASE_URL` and `MACROFAST_INGESTION_USER_AGENT` as repository secrets before enabling scheduled runs. Adding a restaurant to the catalog does not fabricate menu data; nutrition appears only when that restaurant has a verified adapter.

## Ingestion guarantees

- Adapters emit one normalized contract.
- Stable `(restaurant_id, source_item_id)` keys make imports idempotent.
- A scrape is validated and compared with prior values before upserts.
- Suspicious values and large nutrition changes are quarantined as data-quality issues.
- A failed or partial scrape never deletes previously valid foods.
- Missing live items are marked inactive only after a successful, non-empty complete run.
- Every displayed item retains its official source URL and observation timestamps.

See [the architecture notes](docs/ARCHITECTURE.md), [source research](docs/DATA_SOURCES.md), and [operations guide](docs/OPERATIONS.md) for the design and extension workflow.
