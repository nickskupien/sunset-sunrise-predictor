import type { FastifyInstance } from "fastify";
import {
  JobIdParamsSchema,
  EnqueueJobBodySchema,
  ListJobRunsQuerySchema,
  ListJobsQuerySchema,
} from "@sunset/contracts";
import { createDb, enqueueJob, getJob, listJobRuns, listJobs } from "@sunset/db";

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
    const body = EnqueueJobBodySchema.parse(req.body);

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
    const q = ListJobsQuerySchema.parse((req as any).query ?? {});
    const jobs = await listJobs(db, { status: q.status, limit: q.limit });
    return { ok: true, jobs };
  });

  // Get job by id (ops)
  app.get("/jobs/:id", async (req, reply) => {
    const params = JobIdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: "invalid_id" });
    const id = params.data.id;

    const job = await getJob(db, id);
    if (!job) return reply.code(404).send({ ok: false, error: "not_found" });

    return { ok: true, job };
  });

  // List job runs (ops)
  app.get("/jobs/:id/runs", async (req, reply) => {
    const params = JobIdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: "invalid_id" });
    const id = params.data.id;

    const q = ListJobRunsQuerySchema.parse((req as any).query ?? {});
    const runs = await listJobRuns(db, id, { limit: q.limit });

    return { ok: true, runs };
  });
}
