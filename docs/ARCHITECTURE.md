# Architecture

## Repository audit

The starting repository contained an empty `main.js`, a README with the project name repeated, and no package manifest, framework, tests, database, configuration, or application code. There was no working implementation to retain and no legacy migration path to support.

## Application boundaries

```text
Official source
  → restaurant adapter (fetch + parse)
  → normalized food contract
  → schema and anomaly validation
  → transactional compare/upsert
  → PostgreSQL
  → query layer / JSON API
  → Next.js server-rendered pages
```

- `src/ingestion/adapters`: one source-specific parser per restaurant. It knows source markup, not database details.
- `src/ingestion`: shared fetch policy, adapter registry, validation, change detection, and run orchestration.
- `src/db`: Drizzle schema, connection lifecycle, migrations, and read queries.
- `src/lib`: framework-independent metrics, classifications, search-intent parsing, and filter parsing.
- `src/app`: routes and API endpoints.
- `src/components`: reusable presentation components.

## Data model

The first migration creates five tables:

- `restaurants`: stable restaurant identity and public metadata.
- `sources`: authoritative URLs, source kind, HTTP metadata, and a content hash.
- `foods`: the query-optimized canonical item/variant record and its nutrition values.
- `scrape_runs`: auditable run status and insert/update/reject/deactivate counts.
- `data_quality_issues`: warnings and quarantined changes requiring review.

Nutrition remains on `foods` because it is a one-to-one attribute set and nearly every discovery query needs it. Separating it would add joins without improving integrity. Sizes and source variants are separate food rows. `categories` is a PostgreSQL array because the first official source lists identical records in multiple categories; this avoids duplicate foods while retaining every category filter.

The idempotency key is `(restaurant_id, source_item_id)`. Public slugs are unique separately and are not used to decide whether a scrape creates a record.

The ordered 40-chain catalog lives in `src/db/restaurant-catalog.ts` and is synchronized idempotently after every migration. Catalog presence and nutrition availability are intentionally separate: a restaurant can be browsable while showing “Nutrition coming soon,” but it cannot display invented food records.

## Data safety

- A minimum expected row count catches selector/source breakage before existing foods are touched.
- Parsing produces stable IDs and rejects duplicate IDs.
- All food mutations, data-quality issues, source metadata, and successful run totals commit in one transaction.
- Hard schema errors and major relative changes are rejected and leave the prior food untouched.
- Unusual absolute values are imported with warnings because catering portions can legitimately exceed single-meal review thresholds.
- A successful refresh resolves open issues from older runs before recording the current review queue, so recurring warnings do not inflate current health counts.
- Missing foods are deactivated only after a complete run with no rejected rows.
- Failed fetches/parses update the run to `failed`; they never clear previously valid data.

## Search and rankings

Current search intentionally uses simple case-insensitive matching while the dataset is small. The query boundary in `src/db/queries.ts` can be replaced by PostgreSQL full-text/trigram matching or an external engine without changing routes or adapters. An expression GIN index is already created for future PostgreSQL full-text queries.

Rankings calculate ratios in SQL or application code. Derived values are not persisted:

- protein per 100 calories = `(protein_g / calories) * 100`
- calories per gram of protein = `calories / protein_g`

Null and zero denominators are excluded. Classifications are explicit objective rules. Subjective concepts such as taste and “fan favorite” are not inferred from nutrition.

## Next implementation increments

1. Run the Chick-fil-A adapter against PostgreSQL in the deployment environment and review the initial warnings.
2. Add an official Chipotle PDF adapter with PDF fixtures and a component/customization model.
3. Inspect authenticated/location-dependent public web calls for McDonald's, Taco Bell, and Wendy's and document terms before choosing endpoints.
4. Add admin authentication and issue-resolution actions before exposing `/admin/data-health` outside a trusted environment.
5. Schedule ingestion, alert on failed/stale runs, and add database integration tests in CI.
6. Add editorial/user-rating entities if runner-up or taste-based recommendations are introduced.
