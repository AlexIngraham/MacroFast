import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, getDatabase } from "@/db/client";
import { syncRestaurantCatalog } from "@/db/restaurant-catalog";

async function main() {
  await migrate(getDatabase(), { migrationsFolder: "drizzle" });
  const restaurantCount = await syncRestaurantCatalog();
  await closeDatabase();
  process.stdout.write(`Database migrations applied; ${restaurantCount} restaurants synchronized.\n`);
}

main().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  await closeDatabase();
  process.exitCode = 1;
});
