import { DatabaseConfigurationError } from "@/db/client";

export interface QueryState<T> {
  data: T;
  available: boolean;
}

export async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<QueryState<T>> {
  try {
    return { data: await query(), available: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "test" && !(error instanceof DatabaseConfigurationError)) {
      console.error("Database query failed", error);
    }
    return { data: fallback, available: false };
  }
}
