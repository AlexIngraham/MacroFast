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
- `src/ingestion/fetch.ts`: the only place that talks to a restaurant. It sends the configurable user agent, times out, retries a transient 5xx or 429 with backoff, honours `Retry-After`, and refuses to retry a 403 or 404.
- `src/ingestion/pdf.ts`: turns an official PDF into page-delimited text and reads the one row shape every flattened nutrition chart shares, so a PDF adapter's `parse` stays a pure function over a string.
- `src/ingestion/parse.ts`: shared cell reading, whitespace normalization and duplicate merging.

An adapter's `fetch` performs every network request and any format conversion; `parse` is synchronous, takes only the returned document and is exercised by a committed fixture. An adapter that needs many requests, as Jersey Mike's does, combines them into one document body so parsing, content hashing and fixtures stay unchanged.
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

## Components versus composed meals

Several chains publish ingredients rather than finished meals. Those rows are imported faithfully and classified `component`, so an ingredient can never rank as a meal: Chipotle's chart is entirely components and drinks, Subway contributes breads and individual proteins, and El Pollo Loco's à-la-carte grilled pieces are components.

Ingestion does not compose meals. Nothing invents a burrito by adding a protein to rice and beans. A later meal-builder can read the `component` rows and sum them, which needs no schema change: `foods` already carries every nutrient, a serving size and a stable key. Jersey Mike's is the one case where a composed total is imported, because the official page itself publishes that total for a product size and the adapter reproduces the page's own default selection and rounding.

## Next implementation increments

1. Add a Buffalo Wild Wings adapter from the quarterly nutrition guide, resolving its dated link the way Subway and El Pollo Loco do.
2. Verify the first-party product requests behind the McDonald's nutrition calculator and document terms before choosing an endpoint.
3. Add admin authentication and issue-resolution actions before exposing `/admin/data-health` outside a trusted environment.
4. Alert on failed, partial or stale runs, and add database integration tests in CI.
5. Add a meal-composition model on top of the imported `component` rows for Chipotle-style builds.
6. Add editorial/user-rating entities if runner-up or taste-based recommendations are introduced.
