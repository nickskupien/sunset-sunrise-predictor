import { createDb } from "@sunset/db";
import { claimNextJob, markJobFailure, markJobSuccess, requeueStaleRunningJobs } from "@sunset/db";
import { getEnv } from "./config/env.js";
import { handlers } from "./jobs/index.js";

const env = getEnv();
const workerId = env.WORKER_ID ?? `${process.env.HOSTNAME ?? "worker"}-${process.pid}`;

const { db, pool } = createDb(env.DATABASE_URL);

let shuttingDown = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOne() {
  const job = await claimNextJob(db, workerId);
  if (!job) return false;

  const handler = handlers[job.type];
  const startedAt = Date.now();

  console.log(
    `[worker] job:start id=${job.id} type=${job.type} key=${job.key} attempt=${job.attempts}/${job.maxAttempts}`,
  );

  try {
    if (!handler) {
      throw new Error(`No handler registered for job type "${job.type}"`);
    }

    const result = await handler(db, job.payload);
    // TODO: store result somewhere else and keep summary light
    await markJobSuccess(db, job, startedAt, JSON.stringify(result));
    console.log(`[worker] job:success id=${job.id} type=${job.type} ms=${Date.now() - startedAt}`);
  } catch (err) {
    await markJobFailure(db, job, startedAt, err);
    console.error(
      `[worker] job:fail id=${job.id} type=${job.type} ms=${Date.now() - startedAt}`,
      err,
    );
  }

  return true;
}

async function loop() {
  console.log(
    `[worker] starting queue runner id=${workerId} concurrency=${env.WORKER_CONCURRENCY}`,
  );

  // Periodically reclaim stale running jobs
  const requeueTimer = setInterval(() => {
    requeueStaleRunningJobs(db, env.LEASE_SECONDS).catch((e) => {
      console.error("[worker] requeue stale jobs error:", e);
    });
  }, 30_000);

  try {
    while (!shuttingDown) {
      // Fill up to concurrency
      const tasks: Promise<boolean>[] = [];
      for (let i = 0; i < env.WORKER_CONCURRENCY; i++) {
        tasks.push(runOne());
      }

      const results = await Promise.all(tasks);
      const didWork = results.some(Boolean);

      if (!didWork) {
        await sleep(env.POLL_MS);
      }
    }
  } finally {
    clearInterval(requeueTimer);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("[worker] shutting down gracefully...");
  // allow loop to exit, then close pool
  setTimeout(async () => {
    await pool.end();
    process.exit(0);
  }, 250).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

loop().catch(async (err) => {
  console.error("[worker] fatal error:", err);
  try {
    await pool.end();
  } finally {
    process.exit(1);
  }
});
