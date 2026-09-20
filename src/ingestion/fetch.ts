import { createHash } from "node:crypto";
import type { SourceDocument } from "@/ingestion/types";

const DEFAULT_USER_AGENT = "MacroFastNutritionBot/0.1 (+https://example.com/data-policy)";

export async function fetchOfficialSource(url: string): Promise<SourceDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": process.env.INGESTION_USER_AGENT ?? DEFAULT_USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Official source returned HTTP ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    if (!body.trim()) throw new Error("Official source returned an empty response");

    const lastModified = response.headers.get("last-modified");
    const parsedLastModified = lastModified ? new Date(lastModified) : null;

    return {
      body,
      fetchedAt: new Date(),
      sourceLastUpdated:
        parsedLastModified && !Number.isNaN(parsedLastModified.getTime()) ? parsedLastModified : null,
      etag: response.headers.get("etag"),
      lastModified,
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
