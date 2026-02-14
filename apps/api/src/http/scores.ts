import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDb,
  enqueueJob,
  getLocationByKey,
  getLocationById,
  listScoresForDay,
  makeLocationKey,
  upsertLocation,
} from "@sunset/db";

const ParamsSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["sunset", "sunrise"]),
});

const CoordsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

const PrepareBodySchema = CoordsSchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
  forecastDays: z.coerce.number().int().min(1).max(16).default(7),
  kinds: z.array(z.enum(["sunset", "sunrise"])).default(["sunset", "sunrise"]),
});

const PrepareLocationParamsSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const PrepareLocationBodySchema = z.object({
  forecastDays: z.coerce.number().int().min(1).max(16).default(7),
  kinds: z.array(z.enum(["sunset", "sunrise"])).default(["sunset", "sunrise"]),
});

const CoordsScoreQuerySchema = CoordsSchema.extend({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["sunset", "sunrise"]),
});

const StatusQuerySchema = CoordsSchema.extend({
  forecastDays: z.coerce.number().int().min(1).max(16).default(7),
  kinds: z.string().optional(), // comma-separated
  minComputedAtMs: z.coerce.number().int().nonnegative().optional(),
});

const StatusLocationParamsSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});

const StatusLocationQuerySchema = z.object({
  forecastDays: z.coerce.number().int().min(1).max(16).default(7),
  kinds: z.string().optional(), // comma-separated
  minComputedAtMs: z.coerce.number().int().nonnegative().optional(),
});

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDay(d: Date, timeZone?: string | null) {
  if (!timeZone) return DATE_FMT.format(d);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return DATE_FMT.format(d);
  }
}

function buildDayList(count: number, timeZone?: string | null) {
  const days: string[] = [];
  let offset = 0;

  while (days.length < count) {
    const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    const day = formatDay(d, timeZone);
    if (!days.includes(day)) days.push(day);
    offset += 1;

    if (offset > count + 5) break; // guard against pathological timezones
  }

  return days;
}

function parseKinds(raw?: string | null) {
  if (!raw) return ["sunset", "sunrise"] as const;
  const parts = raw.split(",").map((p) => p.trim());
  const kinds = parts.filter((p) => p === "sunset" || p === "sunrise");
  return kinds.length ? (kinds as ("sunset" | "sunrise")[]) : (["sunset", "sunrise"] as const);
}

async function getLocationForCoords(db: any, lat: number, lon: number) {
  const key = makeLocationKey(lat, lon, 3);
  return getLocationByKey(db, key);
}

async function handleScoresByCoords(
  db: any,
  q: z.infer<typeof CoordsScoreQuerySchema>,
  reply: any,
) {
  const location = await getLocationForCoords(db, q.lat, q.lon);
  if (!location) {
    return reply.code(404).send({ ok: false, error: "location_not_found" });
  }

  const rows = await listScoresForDay(db, {
    locationId: location.id,
    day: q.day,
    kind: q.kind,
  });

  if (rows.length > 0) {
    return reply.code(200).send({
      ok: true,
      status: "ready",
      locationId: location.id,
      scores: rows,
    });
  }

  return reply.code(200).send({
    ok: true,
    status: "missing",
    locationId: location.id,
    scores: [],
  });
}

export async function registerScoresRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  // Prepare scores by coordinates (enqueue forecast + schedule jobs)
  app.post("/scores/prepare", async (req, reply) => {
    const body = PrepareBodySchema.parse(req.body);
    const acceptedAtMs = Date.now();

    const location = await upsertLocation(db, {
      lat: body.lat,
      lon: body.lon,
      name: body.name ?? null,
      decimals: 3,
    });

    const forecastJob = await enqueueJob(db, {
      type: "forecast.refresh",
      key: `forecast_hourly:location:${location.id}`,
      payload: {
        locationId: location.id,
        forecastDays: body.forecastDays,
        schedule: {
          forecastDays: body.forecastDays,
          kinds: body.kinds,
        },
      },
      runAfterMs: Date.now(),
    });

    return reply.code(202).send({
      ok: true,
      status: "queued",
      requestId: forecastJob.id,
      locationId: location.id,
      locationKey: location.key,
      locationName: location.name ?? null,
      timezone: location.tz ?? null,
      kinds: body.kinds,
      forecastDays: body.forecastDays,
      acceptedAtMs,
      jobs: {
        forecast: forecastJob,
      },
    });
  });

  // Prepare scores by locationId (enqueue forecast + schedule jobs)
  app.post("/scores/prepare/:locationId", async (req, reply) => {
    const params = PrepareLocationParamsSchema.parse(req.params);
    const body = PrepareLocationBodySchema.parse(req.body ?? {});
    const acceptedAtMs = Date.now();

    const location = await getLocationById(db, params.locationId);
    if (!location) {
      return reply.code(404).send({ ok: false, error: "location_not_found" });
    }

    const forecastJob = await enqueueJob(db, {
      type: "forecast.refresh",
      key: `forecast_hourly:location:${location.id}`,
      payload: {
        locationId: location.id,
        forecastDays: body.forecastDays,
        schedule: {
          forecastDays: body.forecastDays,
          kinds: body.kinds,
        },
      },
      runAfterMs: Date.now(),
    });

    return reply.code(202).send({
      ok: true,
      status: "queued",
      requestId: forecastJob.id,
      locationId: location.id,
      locationKey: location.key,
      locationName: location.name ?? null,
      timezone: location.tz ?? null,
      kinds: body.kinds,
      forecastDays: body.forecastDays,
      acceptedAtMs,
      jobs: {
        forecast: forecastJob,
      },
    });
  });

  // Fetch scores by coordinates (read-only)
  app.get("/scores/by-coords", async (req, reply) => {
    const q = CoordsScoreQuerySchema.parse((req as any).query ?? {});
    return handleScoresByCoords(db, q, reply);
  });

  // Fetch scores by coordinates (alias)
  app.get("/scores", async (req, reply) => {
    const q = CoordsScoreQuerySchema.parse((req as any).query ?? {});
    return handleScoresByCoords(db, q, reply);
  });

  // Status for a batch of days/kinds (read-only)
  app.get("/scores/status", async (req, reply) => {
    const q = StatusQuerySchema.parse((req as any).query ?? {});
    const kinds = parseKinds(q.kinds);
    const minComputedAtMs = q.minComputedAtMs ?? null;

    const location = await getLocationForCoords(db, q.lat, q.lon);
    if (!location) {
      return reply.code(404).send({ ok: false, error: "location_not_found" });
    }

    if (!location.tz) {
      return reply.code(200).send({
        ok: true,
        status: "pending_timezone",
        locationId: location.id,
        timezone: null,
        days: [],
        kinds,
      });
    }

    const days = buildDayList(q.forecastDays, location.tz);
    const checks = [] as { day: string; kind: "sunset" | "sunrise"; ready: boolean }[];

    for (const day of days) {
      for (const kind of kinds) {
        const rows = await listScoresForDay(db, {
          locationId: location.id,
          day,
          kind,
        });
        const ready =
          rows.length > 0 &&
          (minComputedAtMs == null || rows.every((row) => row.computedAtMs >= minComputedAtMs));
        checks.push({ day, kind, ready });
      }
    }

    const readyCount = checks.filter((c) => c.ready).length;
    const total = checks.length;
    const missing = checks.filter((c) => !c.ready).map((c) => ({ day: c.day, kind: c.kind }));

    return reply.code(200).send({
      ok: true,
      status: readyCount === total ? "ready" : "partial",
      locationId: location.id,
      timezone: location.tz,
      days,
      kinds,
      ready: { count: readyCount, total },
      missing,
    });
  });

  // Status by locationId (read-only)
  app.get("/scores/status/:locationId", async (req, reply) => {
    const params = StatusLocationParamsSchema.parse(req.params);
    const q = StatusLocationQuerySchema.parse((req as any).query ?? {});
    const kinds = parseKinds(q.kinds);
    const minComputedAtMs = q.minComputedAtMs ?? null;

    const location = await getLocationById(db, params.locationId);
    if (!location) {
      return reply.code(404).send({ ok: false, error: "location_not_found" });
    }

    if (!location.tz) {
      return reply.code(200).send({
        ok: true,
        status: "pending_timezone",
        locationId: location.id,
        timezone: null,
        days: [],
        kinds,
      });
    }

    const days = buildDayList(q.forecastDays, location.tz);
    const checks = [] as { day: string; kind: "sunset" | "sunrise"; ready: boolean }[];

    for (const day of days) {
      for (const kind of kinds) {
        const rows = await listScoresForDay(db, {
          locationId: location.id,
          day,
          kind,
        });
        const ready =
          rows.length > 0 &&
          (minComputedAtMs == null || rows.every((row) => row.computedAtMs >= minComputedAtMs));
        checks.push({ day, kind, ready });
      }
    }

    const readyCount = checks.filter((c) => c.ready).length;
    const total = checks.length;
    const missing = checks.filter((c) => !c.ready).map((c) => ({ day: c.day, kind: c.kind }));

    return reply.code(200).send({
      ok: true,
      status: readyCount === total ? "ready" : "partial",
      locationId: location.id,
      timezone: location.tz,
      days,
      kinds,
      ready: { count: readyCount, total },
      missing,
    });
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
    });

    return reply.code(202).send({ ok: true, status: "pending", jobId: job.id, job });
  });
}
