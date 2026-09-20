CREATE TYPE "public"."issue_severity" AS ENUM('warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'accepted', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('active', 'limited', 'regional', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."scrape_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('html', 'json', 'pdf', 'csv', 'manual');--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrape_run_id" uuid NOT NULL,
	"food_id" uuid,
	"source_item_id" text,
	"severity" "issue_severity" NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"field" text,
	"previous_value" text,
	"proposed_value" text,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_item_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"categories" text[] NOT NULL,
	"serving_size" text,
	"meal_period" text,
	"item_type" text,
	"status" "item_status" DEFAULT 'active' NOT NULL,
	"is_customizable" boolean DEFAULT false NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"calories" integer,
	"protein_g" numeric(8, 2),
	"carbs_g" numeric(8, 2),
	"fat_g" numeric(8, 2),
	"saturated_fat_g" numeric(8, 2),
	"trans_fat_g" numeric(8, 2),
	"fiber_g" numeric(8, 2),
	"sugar_g" numeric(8, 2),
	"sodium_mg" numeric(8, 2),
	"cholesterol_mg" numeric(8, 2),
	"source_url" text NOT NULL,
	"source_last_updated" timestamp with time zone,
	"scraped_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"source_id" uuid,
	"status" "scrape_status" DEFAULT 'running' NOT NULL,
	"scraper_version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"unchanged_count" integer DEFAULT 0 NOT NULL,
	"deactivated_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" "source_type" NOT NULL,
	"source_last_updated" timestamp with time zone,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quality_issues_run_idx" ON "data_quality_issues" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE INDEX "quality_issues_open_idx" ON "data_quality_issues" USING btree ("status","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_restaurant_source_item_unique" ON "foods" USING btree ("restaurant_id","source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_slug_unique" ON "foods" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "foods_restaurant_available_idx" ON "foods" USING btree ("restaurant_id","is_available");--> statement-breakpoint
CREATE INDEX "foods_category_idx" ON "foods" USING btree ("category");--> statement-breakpoint
CREATE INDEX "foods_calories_idx" ON "foods" USING btree ("calories");--> statement-breakpoint
CREATE INDEX "foods_protein_idx" ON "foods" USING btree ("protein_g");--> statement-breakpoint
CREATE INDEX "foods_search_idx" ON "foods" USING gin (to_tsvector('english', "name" || ' ' || "category"));--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_slug_unique" ON "restaurants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "scrape_runs_restaurant_started_idx" ON "scrape_runs" USING btree ("restaurant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_restaurant_url_unique" ON "sources" USING btree ("restaurant_id","url");--> statement-breakpoint
CREATE INDEX "sources_restaurant_idx" ON "sources" USING btree ("restaurant_id");