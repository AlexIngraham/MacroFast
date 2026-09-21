import type { NormalizedFood, NutritionValues, SourceType } from "@/lib/domain";

export interface RestaurantDefinition {
  slug: string;
  name: string;
  websiteUrl: string;
}

export interface SourceDefinition {
  name: string;
  url: string;
  type: SourceType;
}

export interface SourceMetadata {
  fetchedAt: Date;
  sourceLastUpdated: Date | null;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
}

export interface SourceDocument extends SourceMetadata {
  body: string;
}

export interface BinarySourceDocument extends SourceMetadata {
  bytes: Uint8Array;
}

export interface RestaurantAdapter {
  key: string;
  version: string;
  restaurant: RestaurantDefinition;
  source: SourceDefinition;
  minimumExpectedItems: number;
  fetch(): Promise<SourceDocument>;
  parse(document: SourceDocument): NormalizedFood[];
  /**
   * Loads the committed fixture so `npm run scrape <key> -- --fixture` can
   * exercise parsing and validation without a network request or database.
   */
  fixture?(): Promise<SourceDocument>;
}

export interface QualityIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  sourceItemId?: string;
  field?: keyof NutritionValues;
  previousValue?: number | null;
  proposedValue?: number | null;
}

export interface ValidationResult {
  food: NormalizedFood;
  issues: QualityIssue[];
  accepted: boolean;
}

export interface IngestionSummary {
  status: "succeeded" | "partial" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  rejected: number;
  warnings: number;
  runId: string;
}
