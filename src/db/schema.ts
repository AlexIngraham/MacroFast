import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sourceTypeEnum = pgEnum("source_type", ["html", "json", "pdf", "csv", "manual"]);
export const itemStatusEnum = pgEnum("item_status", ["active", "limited", "regional", "discontinued"]);
export const scrapeStatusEnum = pgEnum("scrape_status", ["running", "succeeded", "partial", "failed"]);
export const issueSeverityEnum = pgEnum("issue_severity", ["warning", "error"]);
export const issueStatusEnum = pgEnum("issue_status", ["open", "accepted", "resolved"]);

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    websiteUrl: text("website_url").notNull(),
    displayOrder: integer("display_order").notNull().default(1_000),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("restaurants_slug_unique").on(table.slug)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: sourceTypeEnum("type").notNull(),
    sourceLastUpdated: timestamp("source_last_updated", { withTimezone: true }),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sources_restaurant_url_unique").on(table.restaurantId, table.url),
    index("sources_restaurant_idx").on(table.restaurantId),
  ],
);

const macro = (name: string) => numeric(name, { precision: 8, scale: 2, mode: "number" });

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    sourceItemId: text("source_item_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    categories: text("categories").array().notNull(),
    servingSize: text("serving_size"),
    mealPeriod: text("meal_period"),
    itemType: text("item_type"),
    status: itemStatusEnum("status").notNull().default("active"),
    isCustomizable: boolean("is_customizable").notNull().default(false),
    isAvailable: boolean("is_available").notNull().default(true),
    calories: integer("calories"),
    proteinG: macro("protein_g"),
    carbsG: macro("carbs_g"),
    fatG: macro("fat_g"),
    saturatedFatG: macro("saturated_fat_g"),
    transFatG: macro("trans_fat_g"),
    fiberG: macro("fiber_g"),
    sugarG: macro("sugar_g"),
    sodiumMg: macro("sodium_mg"),
    cholesterolMg: macro("cholesterol_mg"),
    sourceUrl: text("source_url").notNull(),
    sourceLastUpdated: timestamp("source_last_updated", { withTimezone: true }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("foods_restaurant_source_item_unique").on(table.restaurantId, table.sourceItemId),
    uniqueIndex("foods_slug_unique").on(table.slug),
    index("foods_restaurant_available_idx").on(table.restaurantId, table.isAvailable),
    index("foods_category_idx").on(table.category),
    index("foods_calories_idx").on(table.calories),
    index("foods_protein_idx").on(table.proteinG),
    index("foods_search_idx").using("gin", sql`to_tsvector('english', ${table.name} || ' ' || ${table.category})`),
  ],
);

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    status: scrapeStatusEnum("status").notNull().default("running"),
    scraperVersion: text("scraper_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    fetchedCount: integer("fetched_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    deactivatedCount: integer("deactivated_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("scrape_runs_restaurant_started_idx").on(table.restaurantId, table.startedAt)],
);

export const dataQualityIssues = pgTable(
  "data_quality_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scrapeRunId: uuid("scrape_run_id")
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "set null" }),
    sourceItemId: text("source_item_id"),
    severity: issueSeverityEnum("severity").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    field: text("field"),
    previousValue: text("previous_value"),
    proposedValue: text("proposed_value"),
    status: issueStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("quality_issues_run_idx").on(table.scrapeRunId),
    index("quality_issues_open_idx").on(table.status, table.severity),
  ],
);

export type FoodRow = typeof foods.$inferSelect;
export type NewFoodRow = typeof foods.$inferInsert;
