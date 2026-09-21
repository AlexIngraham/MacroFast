# MacroFast

MacroFast turns official restaurant nutrition data into fast, goal-oriented answers: high-protein meals, efficient cutting picks, calorie-budget filters, comparisons, and transparent source provenance. Its catalog is automatically populated with 40 priority U.S. chains; restaurants without a verified adapter are clearly marked as coming soon.

The architecture is adapter-based so each restaurant can use the most reliable source it offers without coupling source parsing to database or UI code. Five chains are ingested today, each from a different kind of official source:

| Adapter | Restaurant | Official source | Items |
| --- | --- | --- | --- |
| `chickfila` | Chick-fil-A | Server-rendered nutrition table (HTML) | 372 |
| `chipotle` | Chipotle | U.S. Nutrition Facts chart (PDF) | 123 |
| `jerseymikes` | Jersey Mike's | Nutrition data service behind the official calculator (JSON) | 267 |
| `subway` | Subway | U.S. Nutrition Information chart (PDF) | 209 |
| `elpolloloco` | El Pollo Loco | Nutrition Guide (PDF) | 120 |

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
5. Import every registered restaurant with `npm run scrape all`, or one at a time with `npm run scrape chipotle`.
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
npm run scrape chipotle
npm run scrape all
npm run refresh
```

Each adapter has two checks that need no database:

- `npm run scrape <key> -- --fixture` parses the committed sanitized fixture and validates it, with no network request. Fixture mode exercises the pipeline but intentionally does not write the partial fixture to the database.
- `npm run scrape <key> -- --dry-run` fetches the live official source, parses it, reports the item count and classification breakdown, and warns if the count falls below the adapter's minimum. It makes no database writes, so it is the safe way to confirm a source still parses before a real import.

Both accept `all` in place of an adapter key.

The included GitHub Actions workflow refreshes all registered adapters every Monday. Configure `MACROFAST_DATABASE_URL` and `MACROFAST_INGESTION_USER_AGENT` as repository secrets before enabling scheduled runs. Adding a restaurant to the catalog does not fabricate menu data; nutrition appears only when that restaurant has a verified adapter.

## Ingestion guarantees

- Adapters emit one normalized contract.
- Stable `(restaurant_id, source_item_id)` keys make imports idempotent.
- A scrape is validated and compared with prior values before upserts.
- Suspicious values and large nutrition changes are quarantined as data-quality issues.
- A failed or partial scrape never deletes previously valid foods.
- Missing live items are marked inactive only after a successful, non-empty complete run.
- Every displayed item retains its official source URL and observation timestamps.
- A nutrient the official source does not publish is stored as null rather than guessed or zeroed.
- Items an official source publishes as ingredients are classified as components so they cannot rank as complete meals.

See [the architecture notes](docs/ARCHITECTURE.md), [source research](docs/DATA_SOURCES.md), and [operations guide](docs/OPERATIONS.md) for the design and extension workflow.
