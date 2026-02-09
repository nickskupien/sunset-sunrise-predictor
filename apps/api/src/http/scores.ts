import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDb, enqueueJob, listScoresForDay } from "@sunset/db";

const ParamsSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["sunset", "sunrise"]),
});

export async function registerScoresRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/scores/:locationId/:day/:kind", async (req, reply) => {
    const params = ParamsSchema.parse(req.params);

    const rows = await listScoresForDay(db, {
      locationId: params.locationId,
      day: params.day,
      kind: params.kind,
    });

    if (rows.length > 0) {
      return { ok: true, status: "ready", scores: rows };
    }

    const job = await enqueueJob(db, {
      type: "score.compute",
      key: `score:${params.locationId}:${params.day}:${params.kind}`,
      payload: {
        locationId: params.locationId,
        day: params.day,
        kind: params.kind,
      },
      runAfterMs: Date.now(),
      maxAttempts: 10,
    });

    return reply.code(202).send({ ok: true, status: "pending", jobId: job.id, job });
  });
}
