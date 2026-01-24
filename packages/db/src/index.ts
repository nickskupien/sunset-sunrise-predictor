import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type Db = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  return { db, pool };
}

export * from "./schema.js";
export * from "./queue.js";
