import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDb, listLocations } from "@sunset/db";

const ListLocationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function registerLocationsRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/locations", async (req) => {
    const query = ListLocationsQuerySchema.parse((req as any).query ?? {});
    const locations = await listLocations(db, { limit: query.limit });
    return { ok: true, locations };
  });
}
