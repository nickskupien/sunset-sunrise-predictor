import type { FastifyInstance } from "fastify";
import { pool } from "../config/db.js";

export async function registerDbHealthRoutes(app: FastifyInstance) {
  app.get("/db/health", async () => {
    const now = (await pool.query("select now()")).rows[0].now as string;

    return {
      ok: true,
      dbTime: now,
      time: new Date().toISOString()
    };
  });
}
