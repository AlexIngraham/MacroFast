import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closeDatabase } from "@/db/client";
import { allAdapters, getAdapter, listAdapters } from "@/ingestion/registry";
import { runIngestion } from "@/ingestion/run";
import { validateFood } from "@/ingestion/validation";
import { parseChickfila } from "@/ingestion/adapters/chickfila";

async function runFixture(): Promise<void> {
  const path = fileURLToPath(new URL("../ingestion/fixtures/chickfila.sample.html", import.meta.url));
  const body = await readFile(path, "utf8");
  const items = parseChickfila({
    body,
    fetchedAt: new Date(),
    sourceLastUpdated: null,
    etag: null,
    lastModified: null,
    contentType: "text/html",
  });
  const rejected = items.filter((item) => !validateFood(item).accepted);
  process.stdout.write(`Fixture parsed ${items.length} items; ${rejected.length} rejected. No database writes made.\n`);
  if (rejected.length) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) throw new Error(`Choose an adapter: ${listAdapters().join(", ")}, or all`);
  if (args.includes("--fixture")) return runFixture();

  const selected = target === "all" ? allAdapters() : [getAdapter(target)];
  for (const adapter of selected) {
    process.stdout.write(`Running ${adapter.restaurant.name} adapter ${adapter.version}...\n`);
    const result = await runIngestion(adapter);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
