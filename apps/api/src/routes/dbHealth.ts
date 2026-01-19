import type { FastifyInstance } from "fastify";
import { createDb } from "@sunset/db";

export async function registerDbHealthRoutes(app: FastifyInstance) {
  app.get("/db/health", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL missing");

    const { pool } = createDb(databaseUrl);

    try {
      const now = (await pool.query("select now()")).rows[0].now as string;

      return {
        ok: true,
        dbTime: now,
        time: new Date().toISOString()
      };
    } finally {
      await pool.end();
    }
  });
}
