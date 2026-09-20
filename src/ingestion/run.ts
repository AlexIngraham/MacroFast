import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { dataQualityIssues, foods, restaurants, scrapeRuns, sources, type FoodRow } from "@/db/schema";
import { getDatabase } from "@/db/client";
import { contentHash } from "@/ingestion/fetch";
import type { IngestionSummary, QualityIssue, RestaurantAdapter } from "@/ingestion/types";
import { detectNutritionChanges, validateFood } from "@/ingestion/validation";
import type { NormalizedFood, NutritionValues } from "@/lib/domain";

const nutritionFields: Array<keyof NutritionValues> = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "saturatedFatG",
  "transFatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
  "cholesterolMg",
];

function nutritionFromRow(row: FoodRow): NutritionValues {
  return Object.fromEntries(nutritionFields.map((field) => [field, row[field]])) as unknown as NutritionValues;
}

function changed(previous: FoodRow, proposed: NormalizedFood): boolean {
  return (
    previous.name !== proposed.name ||
    previous.slug !== proposed.slug ||
    previous.description !== proposed.description ||
    previous.category !== proposed.category ||
    previous.categories.join("\u0000") !== proposed.categories.join("\u0000") ||
    previous.servingSize !== proposed.servingSize ||
    previous.mealPeriod !== proposed.mealPeriod ||
    previous.itemType !== proposed.itemType ||
    previous.status !== proposed.status ||
    previous.isCustomizable !== proposed.isCustomizable ||
    nutritionFields.some((field) => previous[field] !== proposed[field])
  );
}

function rowValues(food: NormalizedFood, restaurantId: string, sourceId: string) {
  return {
    restaurantId,
    sourceId,
    sourceItemId: food.sourceItemId,
    slug: food.slug,
    name: food.name,
    description: food.description,
    category: food.category,
    categories: food.categories,
    servingSize: food.servingSize,
    mealPeriod: food.mealPeriod,
    itemType: food.itemType,
    status: food.status,
    isCustomizable: food.isCustomizable,
    isAvailable: food.status !== "discontinued",
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    saturatedFatG: food.saturatedFatG,
    transFatG: food.transFatG,
    fiberG: food.fiberG,
    sugarG: food.sugarG,
    sodiumMg: food.sodiumMg,
    cholesterolMg: food.cholesterolMg,
    sourceUrl: food.sourceUrl,
    sourceLastUpdated: food.sourceLastUpdated,
    scrapedAt: food.scrapedAt,
    lastSeenAt: food.scrapedAt,
    updatedAt: new Date(),
  } as const;
}

function issueRows(runId: string, issues: QualityIssue[], foodId?: string) {
  return issues.map((issue) => ({
    scrapeRunId: runId,
    foodId,
    sourceItemId: issue.sourceItemId,
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    field: issue.field,
    previousValue: issue.previousValue === undefined ? null : String(issue.previousValue),
    proposedValue: issue.proposedValue === undefined ? null : String(issue.proposedValue),
  }));
}

export async function runIngestion(adapter: RestaurantAdapter): Promise<IngestionSummary> {
  const db = getDatabase();
  const [restaurant] = await db
    .insert(restaurants)
    .values({ ...adapter.restaurant })
    .onConflictDoUpdate({
      target: restaurants.slug,
      set: { name: adapter.restaurant.name, websiteUrl: adapter.restaurant.websiteUrl, updatedAt: new Date() },
    })
    .returning();

  const [source] = await db
    .insert(sources)
    .values({ restaurantId: restaurant.id, ...adapter.source })
    .onConflictDoUpdate({
      target: [sources.restaurantId, sources.url],
      set: { name: adapter.source.name, type: adapter.source.type, updatedAt: new Date() },
    })
    .returning();

  const [run] = await db
    .insert(scrapeRuns)
    .values({ restaurantId: restaurant.id, sourceId: source.id, scraperVersion: adapter.version })
    .returning();

  try {
    const document = await adapter.fetch();
    const parsedFoods = adapter.parse(document);
    if (parsedFoods.length < adapter.minimumExpectedItems) {
      throw new Error(
        `Parser returned ${parsedFoods.length} items; expected at least ${adapter.minimumExpectedItems}. Existing data was left untouched.`,
      );
    }

    const duplicateIds = parsedFoods
      .map((food) => food.sourceItemId)
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length) throw new Error(`Parser produced duplicate source IDs: ${[...new Set(duplicateIds)].join(", ")}`);

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${restaurant.slug}))`);
      const existingRows = await tx.select().from(foods).where(eq(foods.restaurantId, restaurant.id));
      const activeExistingCount = existingRows.filter((row) => row.isAvailable).length;
      if (activeExistingCount > 0 && parsedFoods.length < activeExistingCount * 0.75) {
        throw new Error(
          `Item count dropped from ${activeExistingCount} to ${parsedFoods.length}; existing data was left untouched pending review.`,
        );
      }
      const existingBySourceId = new Map(existingRows.map((row) => [row.sourceItemId, row]));
      const pendingIssues: Array<typeof dataQualityIssues.$inferInsert> = [];
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      let rejected = 0;
      let warningCount = 0;
      const acceptedIds: string[] = [];

      for (const proposed of parsedFoods) {
        const validation = validateFood(proposed);
        const previous = existingBySourceId.get(proposed.sourceItemId);
        const changeIssues = previous ? detectNutritionChanges(nutritionFromRow(previous), proposed) : [];
        const allIssues = [...validation.issues, ...changeIssues];
        warningCount += allIssues.length;

        if (!validation.accepted || changeIssues.some((issue) => issue.severity === "error")) {
          rejected += 1;
          pendingIssues.push(...issueRows(run.id, allIssues, previous?.id));
          continue;
        }

        acceptedIds.push(proposed.sourceItemId);
        if (!previous) {
          const [created] = await tx.insert(foods).values(rowValues(proposed, restaurant.id, source.id)).returning();
          inserted += 1;
          pendingIssues.push(...issueRows(run.id, allIssues, created.id));
        } else if (changed(previous, proposed) || !previous.isAvailable) {
          await tx
            .update(foods)
            .set({ ...rowValues(proposed, restaurant.id, source.id), lastChangedAt: new Date() })
            .where(eq(foods.id, previous.id));
          updated += 1;
          pendingIssues.push(...issueRows(run.id, allIssues, previous.id));
        } else {
          await tx
            .update(foods)
            .set({ scrapedAt: proposed.scrapedAt, lastSeenAt: proposed.scrapedAt, updatedAt: new Date() })
            .where(eq(foods.id, previous.id));
          unchanged += 1;
          pendingIssues.push(...issueRows(run.id, allIssues, previous.id));
        }
      }

      let deactivated = 0;
      if (rejected === 0 && acceptedIds.length > 0) {
        const acceptedSet = new Set(acceptedIds);
        const missing = existingRows.filter((row) => !acceptedSet.has(row.sourceItemId) && row.isAvailable);
        if (missing.length) {
          await tx
            .update(foods)
            .set({ isAvailable: false, lastChangedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(foods.restaurantId, restaurant.id), notInArray(foods.sourceItemId, acceptedIds)));
          deactivated = missing.length;
        }
      }

      const previousRuns = await tx
        .select({ id: scrapeRuns.id })
        .from(scrapeRuns)
        .where(and(eq(scrapeRuns.restaurantId, restaurant.id), ne(scrapeRuns.id, run.id)));
      if (previousRuns.length) {
        await tx
          .update(dataQualityIssues)
          .set({ status: "resolved", resolvedAt: new Date() })
          .where(
            and(
              eq(dataQualityIssues.status, "open"),
              inArray(
                dataQualityIssues.scrapeRunId,
                previousRuns.map((previousRun) => previousRun.id),
              ),
            ),
          );
      }
      if (pendingIssues.length) await tx.insert(dataQualityIssues).values(pendingIssues);
      await tx
        .update(sources)
        .set({
          sourceLastUpdated: document.sourceLastUpdated,
          etag: document.etag,
          lastModified: document.lastModified,
          lastFetchedAt: document.fetchedAt,
          contentHash: contentHash(document.body),
          updatedAt: new Date(),
        })
        .where(eq(sources.id, source.id));

      const status = rejected > 0 ? "partial" : "succeeded";
      await tx
        .update(scrapeRuns)
        .set({
          status,
          finishedAt: new Date(),
          fetchedCount: parsedFoods.length,
          insertedCount: inserted,
          updatedCount: updated,
          unchangedCount: unchanged,
          deactivatedCount: deactivated,
          rejectedCount: rejected,
          warningCount,
        })
        .where(eq(scrapeRuns.id, run.id));

      return { status, inserted, updated, unchanged, deactivated, rejected, warningCount } as const;
    });

    return {
      status: outcome.status,
      fetched: parsedFoods.length,
      inserted: outcome.inserted,
      updated: outcome.updated,
      unchanged: outcome.unchanged,
      deactivated: outcome.deactivated,
      rejected: outcome.rejected,
      warnings: outcome.warningCount,
      runId: run.id,
    };
  } catch (error) {
    await db
      .update(scrapeRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      .where(eq(scrapeRuns.id, run.id));
    throw error;
  }
}
