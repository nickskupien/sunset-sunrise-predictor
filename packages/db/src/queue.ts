// packages/db/src/queue.ts
import { eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { jobQueue, jobRuns } from "./schema.js";

export type JobRow = typeof jobQueue.$inferSelect;

export type JobStatus = "queued" | "running" | "retrying" | "succeeded" | "dead";

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

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function requireNumber(v: unknown, label: string): number {
  const n = asNumberOrNull(v);
  if (n == null) throw new Error(`Expected numeric ${label}`);
  return n;
}

/**
 * Enqueue (deduped by type+key).
 * If the row already exists, we "reset" it to queued (unless it's currently running).
 *
 * DB stores timestamptz; app uses epoch ms UTC.
 */
export async function enqueueJob(db: Db["db"], input: EnqueueInput) {
  const payload = input.payload ?? {};
  const runAfterMs = input.runAfterMs ?? Date.now();
  const runAfter = new Date(runAfterMs);
  const maxAttempts = input.maxAttempts ?? 5;

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

// -------------------- Claimed jobs (worker) --------------------

type RawClaimedJob = {
  id: number;
  type: string;
  key: string;
  payload: unknown;
  status: "running";
  runAfterMs: unknown;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAtMs: unknown | null;
  lastError: string | null;
  lastErrorAtMs: unknown | null;
  createdAtMs: unknown;
  updatedAtMs: unknown;
};

export type ClaimedJob = {
  id: number;
  type: string;
  key: string;
  payload: unknown;
  status: "running";
  runAfterMs: number;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAtMs: number | null;
  lastError: string | null;
  lastErrorAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

function normalizeClaimedJob(row: RawClaimedJob): ClaimedJob {
  return {
    ...row,
    runAfterMs: requireNumber(row.runAfterMs, "runAfterMs"),
    lockedAtMs: asNumberOrNull(row.lockedAtMs),
    lastErrorAtMs: asNumberOrNull(row.lastErrorAtMs),
    createdAtMs: requireNumber(row.createdAtMs, "createdAtMs"),
    updatedAtMs: requireNumber(row.updatedAtMs, "updatedAtMs"),
  };
}

export type JobSuccessContext = Pick<ClaimedJob, "id" | "type" | "key" | "attempts">;

export type JobFailureContext = Pick<
  ClaimedJob,
  "id" | "type" | "key" | "attempts" | "maxAttempts"
>;

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

  // @ts-expect-error pg driver rows exist at runtime
  const row = (result.rows?.[0] ?? null) as RawClaimedJob | null;
  return row ? normalizeClaimedJob(row) : null;
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

// -------------------- Ops queries (API) --------------------

type RawJobListItem = {
  id: number;
  type: string;
  key: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfterMs: unknown;
  lockedBy: string | null;
  lockedAtMs: unknown | null;
  lastError: string | null;
  lastErrorAtMs: unknown | null;
  createdAtMs: unknown;
  updatedAtMs: unknown;
};

export type JobListItem = {
  id: number;
  type: string;
  key: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfterMs: number;
  lockedBy: string | null;
  lockedAtMs: number | null;
  lastError: string | null;
  lastErrorAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

function normalizeJobListItem(row: RawJobListItem): JobListItem {
  return {
    ...row,
    runAfterMs: requireNumber(row.runAfterMs, "runAfterMs"),
    lockedAtMs: asNumberOrNull(row.lockedAtMs),
    lastErrorAtMs: asNumberOrNull(row.lastErrorAtMs),
    createdAtMs: requireNumber(row.createdAtMs, "createdAtMs"),
    updatedAtMs: requireNumber(row.updatedAtMs, "updatedAtMs"),
  };
}

type RawJobRunItem = {
  id: number;
  jobId: number;
  type: string;
  key: string;
  attempt: number;
  status: "success" | "fail";
  startedAtMs: unknown;
  finishedAtMs: unknown;
  durationMs: number;
  errorMessage: string | null;
  errorStack: string | null;
  resultSummary: string | null;
};

export type JobRunItem = {
  id: number;
  jobId: number;
  type: string;
  key: string;
  attempt: number;
  status: "success" | "fail";
  startedAtMs: number;
  finishedAtMs: number;
  durationMs: number;
  errorMessage: string | null;
  errorStack: string | null;
  resultSummary: string | null;
};

function normalizeJobRunItem(row: RawJobRunItem): JobRunItem {
  return {
    ...row,
    startedAtMs: requireNumber(row.startedAtMs, "startedAtMs"),
    finishedAtMs: requireNumber(row.finishedAtMs, "finishedAtMs"),
  };
}

export async function listJobs(db: Db["db"], opts?: { status?: JobStatus; limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const statusFilter = opts?.status ? sql`AND jq.status = ${opts.status}` : sql``;

  const result = await db.execute(sql`
    SELECT
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
      (extract(epoch from jq.updated_at) * 1000)::bigint      AS "updatedAtMs"
    FROM ${jobQueue} AS jq
    WHERE 1=1
      ${statusFilter}
    ORDER BY jq.updated_at DESC, jq.id DESC
    LIMIT ${limit};
  `);

  // @ts-expect-error pg rows exist at runtime
  const rows = (result.rows ?? []) as RawJobListItem[];
  return rows.map(normalizeJobListItem);
}

export async function getJob(db: Db["db"], id: number) {
  const result = await db.execute(sql`
    SELECT
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
      (extract(epoch from jq.updated_at) * 1000)::bigint      AS "updatedAtMs"
    FROM ${jobQueue} AS jq
    WHERE jq.id = ${id}
    LIMIT 1;
  `);

  // @ts-expect-error pg rows exist at runtime
  const row = (result.rows?.[0] ?? null) as RawJobListItem | null;
  return row ? normalizeJobListItem(row) : null;
}

export async function listJobRuns(db: Db["db"], jobId: number, opts?: { limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  const result = await db.execute(sql`
    SELECT
      jr.id,
      jr.job_id                                               AS "jobId",
      jr.type,
      jr.key,
      jr.attempt,
      jr.status,
      (extract(epoch from jr.started_at) * 1000)::bigint       AS "startedAtMs",
      (extract(epoch from jr.finished_at) * 1000)::bigint      AS "finishedAtMs",
      jr.duration_ms                                           AS "durationMs",
      jr.error_message                                         AS "errorMessage",
      jr.error_stack                                           AS "errorStack",
      jr.result_summary                                        AS "resultSummary"
    FROM ${jobRuns} AS jr
    WHERE jr.job_id = ${jobId}
    ORDER BY jr.attempt DESC, jr.id DESC
    LIMIT ${limit};
  `);

  // @ts-expect-error pg rows exist at runtime
  const rows = (result.rows ?? []) as RawJobRunItem[];
  return rows.map(normalizeJobRunItem);
}
