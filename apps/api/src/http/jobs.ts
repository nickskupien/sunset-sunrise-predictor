import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDb } from "@sunset/db";
import { enqueueJob, jobQueue, getJobById } from "@sunset/db";

const EnqueueSchema = z.object({
  type: z.string().min(1),
  key: z.string().min(1),
  payload: z.unknown().optional(),
  runAfter: z.string().datetime().optional(),
  maxAttempts: z.number().int().positive().max(50).optional(),
});

export async function registerJobsRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  // Create one shared pool for the API process (important for performance)
  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.post("/jobs", async (req, reply) => {
    const body = EnqueueSchema.parse(req.body);

    const job = await enqueueJob(db, {
      type: body.type,
      key: body.key,
      payload: body.payload ?? {},
      runAfter: body.runAfter ? new Date(body.runAfter) : undefined,
      maxAttempts: body.maxAttempts,
    });

    return reply.code(201).send(job);
  });

  app.get("/jobs/:id", async (req) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) throw new Error("Invalid job id");

    const job = await getJobById(db, id);
    if (!job) return { ok: false, error: "not_found" };

    return { ok: true, job };
  });
}
