import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __mailedSql?: postgres.Sql;
  __mailedDb?: Db;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function sqlClient(): postgres.Sql {
  if (!globalForDb.__mailedSql) {
    globalForDb.__mailedSql = postgres(connectionString(), {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalForDb.__mailedSql;
}

function getDb(): Db {
  if (!globalForDb.__mailedDb) {
    globalForDb.__mailedDb = drizzle(sqlClient(), { schema });
  }
  return globalForDb.__mailedDb;
}

/** Lazily-initialised Drizzle client shared across the process. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export async function closeDb() {
  if (globalForDb.__mailedSql) {
    await globalForDb.__mailedSql.end({ timeout: 5 });
    globalForDb.__mailedSql = undefined;
    globalForDb.__mailedDb = undefined;
  }
}

export { schema };
