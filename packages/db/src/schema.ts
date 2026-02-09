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
  smallint,
  bigint,
  date,
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
    maxAttempts: integer("max_attempts").notNull().default(1),

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
    tz: text("tz"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqKey: uniqueIndex("locations_key_uq").on(t.key),
  }),
);

export const forecastPoints = pgTable(
  "forecast_points",
  {
    id: serial("id").primaryKey(),
    // global dedupe key (snapped point)
    key: text("key").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqKey: uniqueIndex("forecast_points_key_uq").on(t.key),
  }),
);

export const locationForecastPoints = pgTable(
  "location_forecast_points",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    forecastPointId: integer("forecast_point_id").notNull(),
    gridI: smallint("grid_i").notNull(), // 0..10
    gridJ: smallint("grid_j").notNull(), // 0..10
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqLocGrid: uniqueIndex("location_forecast_points_loc_grid_uq").on(
      t.locationId,
      t.gridI,
      t.gridJ,
    ),
    idxLoc: index("location_forecast_points_location_idx").on(t.locationId),
    idxPoint: index("location_forecast_points_point_idx").on(t.forecastPointId),
  }),
);

export const forecastHourly = pgTable(
  "forecast_hourly",
  {
    id: serial("id").primaryKey(),
    forecastPointId: integer("forecast_point_id").notNull(),

    // epoch ms UTC
    timeMs: bigint("time_ms", { mode: "number" }).notNull(),

    // requested fields
    relativeHumidity: smallint("relative_humidity").notNull(), // %
    precipitationProbability: smallint("precipitation_probability").notNull(), // %
    precipitation: doublePrecision("precipitation").notNull(), // mm
    temperature: doublePrecision("temperature").notNull(), // °C
    cloudCover: smallint("cloud_cover").notNull(), // %
    cloudCoverLow: smallint("cloud_cover_low").notNull(), // %
    cloudCoverMid: smallint("cloud_cover_mid").notNull(), // %
    cloudCoverHigh: smallint("cloud_cover_high").notNull(), // %
    visibility: integer("visibility").notNull(), // meters

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqPointTime: uniqueIndex("forecast_hourly_point_time_uq").on(t.forecastPointId, t.timeMs),
    idxPoint: index("forecast_hourly_point_idx").on(t.forecastPointId),
    idxTime: index("forecast_hourly_time_idx").on(t.timeMs),
  }),
);

export const sunEvents = pgTable(
  "sun_events",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    // (YYYY-MM-DD)
    day: date("day", { mode: "string" }).notNull(),

    sunriseMs: bigint("sunrise_ms", { mode: "number" }).notNull(),
    sunsetMs: bigint("sunset_ms", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqLocDay: uniqueIndex("sun_events_loc_day_uq").on(t.locationId, t.day),
    idxLoc: index("sun_events_location_idx").on(t.locationId),
  }),
);

export const sunsetSunriseScores = pgTable(
  "sunset_sunrise_scores",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    // (YYYY-MM-DD)
    day: date("day", { mode: "string" }).notNull(),

    // "sunset" | "sunrise"
    kind: text("kind").notNull(),

    // "burning_sky" | "gradient" | "clear" | "hazy" ...
    type: text("type").notNull(),

    // 0..100
    score: smallint("score").notNull(),

    inputs: jsonb("inputs").notNull().default({}),

    // epoch ms UTC
    computedAtMs: bigint("computed_at_ms", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqLocDayKindType: uniqueIndex("sunset_sunrise_scores_loc_day_kind_type_uq").on(
      t.locationId,
      t.day,
      t.kind,
      t.type,
    ),
    idxLoc: index("sunset_sunrise_scores_location_idx").on(t.locationId),
    idxDay: index("sunset_sunrise_scores_day_idx").on(t.day),
    idxKind: index("sunset_sunrise_scores_kind_idx").on(t.kind),
  }),
);
