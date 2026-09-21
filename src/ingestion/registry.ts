import { chickfilaAdapter } from "@/ingestion/adapters/chickfila";
import { chipotleAdapter } from "@/ingestion/adapters/chipotle";
import { elPolloLocoAdapter } from "@/ingestion/adapters/elpolloloco";
import { jerseyMikesAdapter } from "@/ingestion/adapters/jerseymikes";
import { subwayAdapter } from "@/ingestion/adapters/subway";
import type { RestaurantAdapter } from "@/ingestion/types";

const registered: RestaurantAdapter[] = [
  chickfilaAdapter,
  chipotleAdapter,
  jerseyMikesAdapter,
  subwayAdapter,
  elPolloLocoAdapter,
];

/** Both the adapter key and the catalog slug resolve, so `jerseymikes` and `jersey-mikes` both work. */
const adapters = new Map<string, RestaurantAdapter>(
  registered.flatMap((adapter) => [
    [adapter.key, adapter] as const,
    [adapter.restaurant.slug, adapter] as const,
  ]),
);

export function getAdapter(key: string): RestaurantAdapter {
  const adapter = adapters.get(key.toLowerCase());
  if (!adapter) {
    throw new Error(`Unknown restaurant adapter "${key}". Available adapters: ${listAdapters().join(", ")}`);
  }
  return adapter;
}

export function listAdapters(): string[] {
  return registered.map((adapter) => adapter.key).sort();
}

export function allAdapters(): RestaurantAdapter[] {
  return [...registered];
}
