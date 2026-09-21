import "dotenv/config";
import { closeDatabase } from "@/db/client";
import { allAdapters, getAdapter, listAdapters } from "@/ingestion/registry";
import { createIngestionLogger } from "@/ingestion/logger";
import { runIngestion } from "@/ingestion/run";
import type { RestaurantAdapter, SourceDocument } from "@/ingestion/types";
import { validateFood } from "@/ingestion/validation";

type Mode = "ingest" | "fixture" | "dry-run";

/** Parses and validates without touching the database, and reports what it found. */
function report(adapter: RestaurantAdapter, document: SourceDocument, mode: Mode): boolean {
  const logger = createIngestionLogger(adapter.key);
  const foods = adapter.parse(document);
  const rejected = foods.filter((food) => !validateFood(food).accepted);
  const byItemType = new Map<string, number>();
  for (const food of foods) {
    const itemType = food.itemType ?? "unclassified";
    byItemType.set(itemType, (byItemType.get(itemType) ?? 0) + 1);
  }

  logger.info(`Parsed ${foods.length} items (${[...byItemType].map(([type, count]) => `${type}: ${count}`).join(", ")})`);
  for (const food of rejected.slice(0, 10)) {
    const reasons = validateFood(food)
      .issues.filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("; ");
    logger.warn(`Rejected ${food.name}: ${reasons}`);
  }

  if (mode === "fixture") {
    logger.info(`Fixture check complete; ${rejected.length} rejected. No database writes made.`);
    return rejected.length === 0;
  }

  const shortfall = foods.length < adapter.minimumExpectedItems;
  if (shortfall) {
    logger.warn(
      `Expected at least ${adapter.minimumExpectedItems} items but the parser returned ${foods.length}. Source format may have changed.`,
    );
  }
  logger.info(`Dry run complete; ${rejected.length} rejected. No database writes made.`);
  return !shortfall && rejected.length === 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) throw new Error(`Choose an adapter: ${listAdapters().join(", ")}, or all`);

  const mode: Mode = args.includes("--fixture") ? "fixture" : args.includes("--dry-run") ? "dry-run" : "ingest";
  const selected = target === "all" ? allAdapters() : [getAdapter(target)];
  let failed = false;

  for (const adapter of selected) {
    const logger = createIngestionLogger(adapter.key);
    logger.info(`Running the ${adapter.restaurant.name} adapter ${adapter.version} (${mode})`);

    if (mode === "fixture") {
      if (!adapter.fixture) {
        logger.warn("No committed fixture, so fixture mode was skipped");
        continue;
      }
      if (!report(adapter, await adapter.fixture(), mode)) failed = true;
      continue;
    }

    if (mode === "dry-run") {
      if (!report(adapter, await adapter.fetch(), mode)) failed = true;
      continue;
    }

    const result = await runIngestion(adapter);
    logger.info(
      `Status ${result.status}: fetched ${result.fetched}, inserted ${result.inserted}, updated ${result.updated}, unchanged ${result.unchanged}, deactivated ${result.deactivated}, rejected ${result.rejected}, warnings ${result.warnings}`,
    );
    if (result.status !== "succeeded") failed = true;
  }

  if (failed) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
