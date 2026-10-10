import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TEST_ENV } from "./env";

/** Applies migrations to the test database once per run. */
export default async function setup() {
  const client = postgres(TEST_ENV.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
