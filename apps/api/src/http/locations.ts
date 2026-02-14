import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDb, listLocations, upsertLocation } from "@sunset/db";

const ListLocationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const CreateLocationBodySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  name: z.string().trim().min(1).max(120).optional(),
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
