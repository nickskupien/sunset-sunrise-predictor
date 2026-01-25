import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// --- Job queue status enum
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "retrying",
  "succeeded",
  "dead",
]);

export const jobQueue = pgTable(
  "job_queue",
  {
    id: serial("id").primaryKey(),

    // e.g. "ping", "forecast.ingest", "score.compute"
    type: text("type").notNull(),

    // deterministic dedupe key. Example: "score:43.123:-79.321:2026-01-24"
    key: text("key").notNull(),

    payload: jsonb("payload").notNull().default({}),

    status: jobStatus("status").notNull().default("queued"),

    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),

    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),

    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),

    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One row per (type,key) => simple dedupe model
    uniqTypeKey: uniqueIndex("job_queue_type_key_unique").on(t.type, t.key),

    // Fast polling
    runnableIdx: index("job_queue_runnable_idx").on(t.status, t.runAfter),

    // Fast lookups
    typeKeyIdx: index("job_queue_type_key_idx").on(t.type, t.key),
  }),
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),

    type: text("type").notNull(),
    key: text("key").notNull(),

    attempt: integer("attempt").notNull(),

    // "success" | "fail"
    status: text("status").notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull().default(0),

    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    resultSummary: text("result_summary"),
  },
  (t) => ({
    jobIdIdx: index("job_runs_job_id_idx").on(t.jobId),
    typeKeyIdx: index("job_runs_type_key_idx").on(t.type, t.key),
  }),
);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqKey: uniqueIndex("locations_key_uq").on(t.key),
  }),
);
