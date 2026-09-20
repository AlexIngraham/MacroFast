# Ingestion operations

## Run locally

```bash
docker compose up -d db
cp .env.example .env
npm run db:migrate
npm run scrape chickfila
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

To test the parser without network access or database writes:

```bash
npm run scrape chickfila -- --fixture
```

## Expected outcomes

- `succeeded`: all rows validated and the transaction committed. Warnings may still be present for review.
- `partial`: one or more rows were quarantined; valid rows were updated but no missing rows were deactivated.
- `failed`: fetch, parse, minimum-count, duplicate-ID, or database failure. Prior valid foods remain available.

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
