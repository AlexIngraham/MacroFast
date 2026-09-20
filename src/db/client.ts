import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Copy .env.example to .env and start PostgreSQL.");
    this.name = "DatabaseConfigurationError";
  }
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseConfigurationError();

  client ??= postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  database ??= drizzle(client, { schema });
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (client) await client.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}
