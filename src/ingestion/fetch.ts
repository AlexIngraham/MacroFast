import { createHash } from "node:crypto";
import type { BinarySourceDocument, SourceDocument, SourceMetadata } from "@/ingestion/types";

const DEFAULT_USER_AGENT = "MacroFastNutritionBot/0.1 (+https://example.com/data-policy)";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const MAX_WAIT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
export const JSON_ACCEPT = "application/json,text/javascript;q=0.9,*/*;q=0.8";
export const PDF_ACCEPT = "application/pdf,*/*;q=0.8";

export class SourceRequestError extends Error {
  readonly url: string;
  readonly status: number | null;

  constructor(url: string, status: number | null, message: string) {
    super(message);
    this.name = "SourceRequestError";
    this.url = url;
    this.status = status;
  }
}

export interface RequestOptions {
  accept?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function userAgent(): string {
  return process.env.INGESTION_USER_AGENT ?? DEFAULT_USER_AGENT;
}

/**
 * Returns how long the server asked us to wait, or null when it gave no usable
 * instruction. A blocked source is never retried faster than it requested.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const date = new Date(header);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, date.getTime() - Date.now());
}

async function performRequest(url: string, options: RequestOptions, accept: string): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: SourceRequestError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: accept, "User-Agent": userAgent() },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      lastError = new SourceRequestError(
        url,
        null,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt === maxAttempts) throw lastError;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return response;

    const detail = `Official source returned HTTP ${response.status} ${response.statusText}`;
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
      throw new SourceRequestError(url, response.status, detail);
    }

    const requested = retryAfterMs(response);
    const wait = requested ?? BASE_BACKOFF_MS * 2 ** (attempt - 1);
    if (wait > MAX_WAIT_MS) {
      throw new SourceRequestError(
        url,
        response.status,
        `${detail} and asked for a ${Math.round(wait / 1_000)}s wait; stopping instead of retrying`,
      );
    }
    await sleep(wait);
  }

  throw lastError ?? new SourceRequestError(url, null, "Request failed without a response");
}

function sourceMetadata(response: Response, fetchedAt: Date): SourceMetadata {
  const lastModified = response.headers.get("last-modified");
  const parsedLastModified = lastModified ? new Date(lastModified) : null;

  return {
    fetchedAt,
    sourceLastUpdated:
      parsedLastModified && !Number.isNaN(parsedLastModified.getTime()) ? parsedLastModified : null,
    etag: response.headers.get("etag"),
    lastModified,
    contentType: response.headers.get("content-type"),
  };
}

export async function fetchOfficialSource(url: string, options: RequestOptions = {}): Promise<SourceDocument> {
  const response = await performRequest(url, options, options.accept ?? HTML_ACCEPT);
  const body = await response.text();
  if (!body.trim()) throw new SourceRequestError(url, response.status, "Official source returned an empty response");
  return { body, ...sourceMetadata(response, new Date()) };
}

export async function fetchOfficialBinary(
  url: string,
  options: RequestOptions = {},
): Promise<BinarySourceDocument> {
  const response = await performRequest(url, options, options.accept ?? "*/*");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new SourceRequestError(url, response.status, "Official source returned an empty document");
  return { bytes, ...sourceMetadata(response, new Date()) };
}

export function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
