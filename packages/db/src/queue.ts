import { and, eq, inArray, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { jobQueue, jobRuns } from "./schema.js";

export type JobRow = typeof jobQueue.$inferSelect;

export type EnqueueInput = {
  type: string;
  key: string;
  payload?: unknown;
  runAfter?: Date;
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
 */
export async function enqueueJob(db: Db["db"], input: EnqueueInput) {
  const payload = input.payload ?? {};
  const runAfter = input.runAfter ?? new Date();
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

/**
 * Claim the next runnable job with row locking.
 * Safe with multiple workers using SKIP LOCKED.
 */
export async function claimNextJob(db: Db["db"], workerId: string): Promise<JobRow | null> {
  // Use a single statement with CTE to atomically select+update.
  const result = await db.execute(sql`
    WITH next_job AS (
      SELECT id
      FROM ${jobQueue}
      WHERE ${jobQueue.status} IN ('queued','retrying')
        AND ${jobQueue.runAfter} <= now()
      ORDER BY ${jobQueue.runAfter} ASC, ${jobQueue.id} ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${jobQueue}
    SET
      ${jobQueue.status} = 'running',
      ${jobQueue.lockedBy} = ${workerId},
      ${jobQueue.lockedAt} = now(),
      ${jobQueue.attempts} = ${jobQueue.attempts} + 1,
      ${jobQueue.updatedAt} = now()
    WHERE ${jobQueue.id} IN (SELECT id FROM next_job)
    RETURNING *;
  `);

  // drizzle execute result shape varies; use `.rows` on node-postgres
  // @ts-expect-error runtime rows exist on pg driver
  const rows = result.rows as JobRow[] | undefined;
  return rows?.[0] ?? null;
}

/**
 * Requeue "stuck" running jobs whose lease expired.
 */
export async function requeueStaleRunningJobs(db: Db["db"], leaseSeconds: number) {
  await db.execute(sql`
    UPDATE ${jobQueue}
    SET
      ${jobQueue.status} = 'retrying',
      ${jobQueue.lockedBy} = NULL,
      ${jobQueue.lockedAt} = NULL,
      ${jobQueue.runAfter} = now(),
      ${jobQueue.updatedAt} = now(),
      ${jobQueue.lastError} = COALESCE(${jobQueue.lastError}, 'stale lease reclaimed'),
      ${jobQueue.lastErrorAt} = now()
    WHERE ${jobQueue.status} = 'running'
      AND ${jobQueue.lockedAt} IS NOT NULL
      AND ${jobQueue.lockedAt} < (now() - (${leaseSeconds} * interval '1 second'));
  `);
}

export async function markJobSuccess(
  db: Db["db"],
  job: JobRow,
  startedAt: number,
  resultSummary?: string,
) {
  const finishedAt = new Date();
  const durationMs = Date.now() - startedAt;

  await db.transaction(async (tx) => {
    await tx.insert(jobRuns).values({
      jobId: job.id,
      type: job.type,
      key: job.key,
      attempt: job.attempts,
      status: "success",
      startedAt: new Date(startedAt),
      finishedAt,
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
        updatedAt: finishedAt,
      })
      .where(eq(jobQueue.id, job.id));
  });
}

export async function markJobFailure(db: Db["db"], job: JobRow, startedAt: number, err: unknown) {
  const finishedAt = new Date();
  const durationMs = Date.now() - startedAt;

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error ? (err.stack ?? "") : "";

  const attempt = job.attempts; // already incremented on claim
  const willRetry = attempt < job.maxAttempts;
  const nextStatus = willRetry ? "retrying" : "dead";
  const delayMs = willRetry ? backoffMs(attempt) : 0;
  const runAfter = new Date(Date.now() + delayMs);

  await db.transaction(async (tx) => {
    await tx.insert(jobRuns).values({
      jobId: job.id,
      type: job.type,
      key: job.key,
      attempt,
      status: "fail",
      startedAt: new Date(startedAt),
      finishedAt,
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
        lastErrorAt: finishedAt,
        runAfter: willRetry ? runAfter : job.runAfter, // keep existing for dead
        updatedAt: finishedAt,
      })
      .where(eq(jobQueue.id, job.id));
  });
}
