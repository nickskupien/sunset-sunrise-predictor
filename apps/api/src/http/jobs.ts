import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDb, enqueueJob, getJob, listJobRuns, listJobs } from "@sunset/db";

const EnqueueSchema = z.object({
  type: z.string().min(1),
  key: z.string().min(1),
  payload: z.unknown().optional(),
  runAfterMs: z.coerce.number().int().nonnegative().optional(), // epoch ms UTC
  maxAttempts: z.coerce.number().int().positive().max(50).optional(),
});

const ListJobsQuery = z.object({
  status: z.enum(["queued", "running", "retrying", "succeeded", "dead"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const ListRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function registerJobsRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  // One shared pool for the API process
  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  // Enqueue (deduped by type+key)
  app.post("/jobs", async (req, reply) => {
    const body = EnqueueSchema.parse(req.body);

    const job = await enqueueJob(db, {
      type: body.type,
      key: body.key,
      payload: body.payload ?? {},
      runAfterMs: body.runAfterMs,
      maxAttempts: body.maxAttempts,
    });

    return reply.code(201).send({ ok: true, job });
  });

  // List jobs (ops)
  app.get("/jobs", async (req) => {
    const q = ListJobsQuery.parse((req as any).query ?? {});
    const jobs = await listJobs(db, { status: q.status, limit: q.limit });
    return { ok: true, jobs };
  });

  // Get job by id (ops)
  app.get("/jobs/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ ok: false, error: "invalid_id" });

    const job = await getJob(db, id);
    if (!job) return reply.code(404).send({ ok: false, error: "not_found" });

    return { ok: true, job };
  });

  // List job runs (ops)
  app.get("/jobs/:id/runs", async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ ok: false, error: "invalid_id" });

    const q = ListRunsQuery.parse((req as any).query ?? {});
    const runs = await listJobRuns(db, id, { limit: q.limit });

    return { ok: true, runs };
  });
}
