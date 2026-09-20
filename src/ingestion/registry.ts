import { chickfilaAdapter } from "@/ingestion/adapters/chickfila";
import type { RestaurantAdapter } from "@/ingestion/types";

const adapters = new Map<string, RestaurantAdapter>([[chickfilaAdapter.key, chickfilaAdapter]]);

export function getAdapter(key: string): RestaurantAdapter {
  const adapter = adapters.get(key.toLowerCase());
  if (!adapter) {
    throw new Error(`Unknown restaurant adapter "${key}". Available adapters: ${listAdapters().join(", ")}`);
  }
  return adapter;
}

export function listAdapters(): string[] {
  return [...adapters.keys()].sort();
}

export function allAdapters(): RestaurantAdapter[] {
  return [...adapters.values()];
}
