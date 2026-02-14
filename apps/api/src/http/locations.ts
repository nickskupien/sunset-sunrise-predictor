import type { FastifyInstance } from "fastify";
import { CreateLocationBodySchema, ListLocationsQuerySchema } from "@sunset/contracts";
import { createDb, listLocations, upsertLocation } from "@sunset/db";

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

  app.post("/locations", async (req, reply) => {
    const body = CreateLocationBodySchema.parse(req.body);

    const location = await upsertLocation(db, {
      lat: body.lat,
      lon: body.lon,
      name: body.name ?? null,
      decimals: 3,
    });

    return reply.code(201).send({
      ok: true,
      status: "saved",
      location,
    });
  });
}
