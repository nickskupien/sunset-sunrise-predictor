import { eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { jobQueue, jobRuns } from "./schema.js";

export type JobRow = typeof jobQueue.$inferSelect;

export type EnqueueInput = {
  type: string;
  key: string;
  payload?: unknown;
  runAfterMs?: number; // epoch ms UTC
  maxAttempts?: number;
};

export function backoffMs(attempt: number) {
  // attempt starts at 1
  const base = 10_000; // 10s
  const cap = 15 * 60_000; // 15m
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 1000); // 0-999ms
  return exp + jitter;
}

function trim(s: string, max = 2000) {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/**
 * Enqueue (deduped by type+key).
 * If the row already exists, we "reset" it to queued (unless it's currently running).
 *
 * Note: DB stores timestamptz, app uses epoch ms UTC.
 */
export async function enqueueJob(db: Db["db"], input: EnqueueInput) {
  const payload = input.payload ?? {};
  const runAfterMs = input.runAfterMs ?? Date.now();
  const runAfter = new Date(runAfterMs);
  const maxAttempts = input.maxAttempts ?? 5;

  // Insert-or-update with ON CONFLICT.
  // If it's running, we leave it alone (avoid stomping in-flight work).
  const rows = await db
    .insert(jobQueue)
    .values({
      type: input.type,
      key: input.key,
      payload,
      status: "queued",
      runAfter,
      attempts: 0,
      maxAttempts,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [jobQueue.type, jobQueue.key],
      set: {
        payload,
        // Only reset if not currently running
        status: sql`CASE WHEN ${jobQueue.status} = 'running' THEN ${jobQueue.status} ELSE 'queued' END`,
        runAfter: sql`CASE WHEN ${jobQueue.status} = 'running' THEN ${jobQueue.runAfter} ELSE ${runAfter} END`,
        attempts: sql`CASE WHEN ${jobQueue.status} = 'running' THEN ${jobQueue.attempts} ELSE 0 END`,
        maxAttempts,
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0]!;
}

// NOTE: timestamps returned from raw SQL are expressed as epoch ms UTC.
// pg may return bigints as strings depending on configuration.
export type ClaimedJob = {
  id: number;
  type: string;
  key: string;
  payload: unknown;
  status: "running";
  runAfterMs: number | string;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAtMs: number | string | null;
  lastError: string | null;
  lastErrorAtMs: number | string | null;
  createdAtMs: number | string;
  updatedAtMs: number | string;
};

export type JobSuccessContext = Pick<ClaimedJob, "id" | "type" | "key" | "attempts">;

export type JobFailureContext = Pick<
  ClaimedJob,
  "id" | "type" | "key" | "attempts" | "maxAttempts"
>;

function toMs(v: number | string | null | undefined) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Claim the next runnable job with row locking.
 * Safe with multiple workers using SKIP LOCKED.
 */
export async function claimNextJob(db: Db["db"], workerId: string): Promise<ClaimedJob | null> {
  const result = await db.execute(sql`
    WITH next_job AS (
      SELECT jq.id
      FROM ${jobQueue} AS jq
      WHERE jq.status IN ('queued','retrying')
        AND jq.run_after <= now()
      ORDER BY jq.run_after ASC, jq.id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${jobQueue} AS jq
    SET
      status = 'running',
      locked_by = ${workerId},
      locked_at = now(),
      attempts = jq.attempts + 1,
      updated_at = now()
    WHERE jq.id IN (SELECT id FROM next_job)
    RETURNING
      jq.id,
      jq.type,
      jq.key,
      jq.payload,
      jq.status,

      (extract(epoch from jq.run_after) * 1000)::bigint      AS "runAfterMs",
      jq.attempts,
      jq.max_attempts                                        AS "maxAttempts",
      jq.locked_by                                           AS "lockedBy",
      CASE WHEN jq.locked_at IS NULL THEN NULL
           ELSE (extract(epoch from jq.locked_at) * 1000)::bigint
      END                                                    AS "lockedAtMs",
      jq.last_error                                          AS "lastError",
      CASE WHEN jq.last_error_at IS NULL THEN NULL
           ELSE (extract(epoch from jq.last_error_at) * 1000)::bigint
      END                                                    AS "lastErrorAtMs",
      (extract(epoch from jq.created_at) * 1000)::bigint      AS "createdAtMs",
      (extract(epoch from jq.updated_at) * 1000)::bigint      AS "updatedAtMs";
  `);

  // @ts-expect-error runtime rows exist on pg driver
  const rows = result.rows as ClaimedJob[] | undefined;
  const row = rows?.[0];
  if (!row) return null;

  // Normalize bigint-ish fields to numbers when pg returns strings
  return {
    ...row,
    runAfterMs: toMs(row.runAfterMs) ?? row.runAfterMs,
    lockedAtMs: toMs(row.lockedAtMs),
    lastErrorAtMs: toMs(row.lastErrorAtMs),
    createdAtMs: toMs(row.createdAtMs) ?? row.createdAtMs,
    updatedAtMs: toMs(row.updatedAtMs) ?? row.updatedAtMs,
  };
}

/**
 * Requeue "stuck" running jobs whose lease expired.
 */
export async function requeueStaleRunningJobs(db: Db["db"], leaseSeconds: number) {
  await db.execute(sql`
    UPDATE ${jobQueue} AS jq
    SET
      status = 'retrying',
      locked_by = NULL,
      locked_at = NULL,
      run_after = now(),
      updated_at = now(),
      last_error = COALESCE(jq.last_error, 'stale lease reclaimed'),
      last_error_at = now()
    WHERE jq.status = 'running'
      AND jq.locked_at IS NOT NULL
      AND jq.locked_at < (now() - (${leaseSeconds} * interval '1 second'));
  `);
}

export async function markJobSuccess(
  db: Db["db"],
  job: JobSuccessContext,
  startedAtMs: number,
  resultSummary?: string,
) {
  const finishedAtMs = Date.now();
  const durationMs = finishedAtMs - startedAtMs;

  await db.transaction(async (tx) => {
    await tx.insert(jobRuns).values({
      jobId: job.id,
      type: job.type,
      key: job.key,
      attempt: job.attempts,
      status: "success",
      startedAt: new Date(startedAtMs),
      finishedAt: new Date(finishedAtMs),
      durationMs,
      resultSummary: resultSummary ? trim(resultSummary, 2000) : null,
    });

    await tx
      .update(jobQueue)
      .set({
        status: "succeeded",
        lockedBy: null,
        lockedAt: null,
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date(finishedAtMs),
      })
      .where(eq(jobQueue.id, job.id));
  });
}

export async function markJobFailure(
  db: Db["db"],
  job: JobFailureContext,
  startedAtMs: number,
  err: unknown,
) {
  const finishedAtMs = Date.now();
  const durationMs = finishedAtMs - startedAtMs;

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error ? (err.stack ?? "") : "";

  const attempt = job.attempts; // already incremented on claim
  const willRetry = attempt < job.maxAttempts;
  const nextStatus = willRetry ? "retrying" : "dead";
  const nextRunAfterMs = willRetry ? finishedAtMs + backoffMs(attempt) : null;

  await db.transaction(async (tx) => {
    await tx.insert(jobRuns).values({
      jobId: job.id,
      type: job.type,
      key: job.key,
      attempt,
      status: "fail",
      startedAt: new Date(startedAtMs),
      finishedAt: new Date(finishedAtMs),
      durationMs,
      errorMessage: trim(message, 2000),
      errorStack: stack ? trim(stack, 8000) : null,
    });

    await tx
      .update(jobQueue)
      .set({
        status: nextStatus as any,
        lockedBy: null,
        lockedAt: null,
        lastError: trim(message, 2000),
        lastErrorAt: new Date(finishedAtMs),
        ...(willRetry ? { runAfter: new Date(nextRunAfterMs!) } : {}),
        updatedAt: new Date(finishedAtMs),
      })
      .where(eq(jobQueue.id, job.id));
  });
}

export async function getJobById(db: Db["db"], id: number) {
  const rows = await db.select().from(jobQueue).where(eq(jobQueue.id, id)).limit(1);
  return rows[0] ?? null;
}
