import type { FastifyInstance } from "fastify";
import { pool } from "../config/db.js";

export async function registerDbHealthRoutes(app: FastifyInstance) {
  app.get("/db/health", async (request, reply) => {
    try {
      const result = await pool.query("select now()");
      const now = result.rows[0].now as string;

      return {
        ok: true,
        dbTime: now,
        time: new Date().toISOString()
      };
    } catch (err) {
      request.log.error(err, "DB health check failed");
      return reply.code(503).send({
        ok: false,
        error: "Database connection failed",
        time: new Date().toISOString()
      });
    }
  });
}
