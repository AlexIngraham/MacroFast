# Ingestion operations

## Run locally

```bash
docker compose up -d db
cp .env.example .env
npm run db:migrate
npm run scrape all
```

The CLI and Next.js both read `.env` for this local workflow. Deployment platforms should inject `DATABASE_URL` and `INGESTION_USER_AGENT` as managed environment variables.

On macOS without Docker, PostgreSQL can be run directly with Homebrew:

```bash
brew install postgresql@17
brew services start postgresql@17
createuser --login --pwprompt macrofast
createdb --owner=macrofast macrofast
```

Use `macrofast` as the local password when following the checked-in `.env.example`, or update `DATABASE_URL` to match the credentials you choose.

`npm run db:migrate` also upserts the ordered restaurant catalog. `npm run refresh` is the local one-command equivalent of migrating, synchronizing the catalog, and running every implemented adapter.

Adapter keys are `chickfila`, `chipotle`, `jerseymikes`, `subway` and `elpolloloco`. A restaurant's catalog slug also resolves, so `jersey-mikes` works as well as `jerseymikes`.

To test a parser without network access or database writes:

```bash
npm run scrape chipotle -- --fixture
```

To confirm a live source still parses, without writing anything:

```bash
npm run scrape chipotle -- --dry-run
```

A dry run prints the item count and the classification breakdown, lists rejected rows, and warns when the count falls below the adapter's `minimumExpectedItems`. Run it after any suspected source change and before promoting a new adapter. Both flags accept `all` in place of a key.

Jersey Mike's makes one request per product size with 250 ms between them, so a full run of every adapter currently takes a little under two minutes.

## Expected outcomes

- `succeeded`: all rows validated and the transaction committed. Warnings may still be present for review.
- `partial`: one or more rows were quarantined; valid rows were updated but no missing rows were deactivated.
- `failed`: fetch, parse, minimum-count, duplicate-ID, duplicate-slug, or database failure. Prior valid foods remain available.

A repeat run of an unchanged source reports every row as `unchanged`, which is the quickest confirmation that an adapter's identifiers are stable.

Warnings are expected rather than exceptional. Chick-fil-A reports ten on catering portions that legitimately exceed the review thresholds, and Jersey Mike's reports nine items whose official ingredient data is incomplete, so their nutrition is stored as unknown and excluded from efficiency rankings.

The read-only `/admin/data-health` route summarizes item counts, recent status, timestamps, and open issues. Protect that route with deployment authentication before adding mutation controls or exposing operational details publicly.

## Scheduling

Run adapters from a single scheduled worker, not from web requests. Start weekly while source behavior is being learned. Stagger restaurants, use one low-rate request stream per domain, and alert on:

- failed or partial status;
- item-count drops;
- data older than the chosen freshness target;
- open major-change issues;
- repeated source timeouts or HTTP blocking responses.

Do not automatically retry HTTP 403/429 responses in a tight loop. Stop, inspect the source policy, and switch to a permitted document/manual import when necessary.

The checked-in `.github/workflows/refresh-nutrition.yml` runs every Monday at 09:17 UTC and can also be started manually. It requires these GitHub repository secrets:

- `MACROFAST_DATABASE_URL`: a PostgreSQL connection reachable from GitHub-hosted runners.
- `MACROFAST_INGESTION_USER_AGENT`: a descriptive user agent with a real project contact or data-policy URL.

The workflow only runs adapters present in the registry. Catalog-only restaurants remain visible with a coming-soon state until an authoritative adapter is implemented and tested.

## Recovery

Food writes and a successful run record are transactional. For source failures, fix or roll back only the affected adapter and rerun it; other adapters and the last valid rows are independent. Never truncate foods as part of a refresh.
