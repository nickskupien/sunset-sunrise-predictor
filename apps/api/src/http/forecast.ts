import type { FastifyInstance } from "fastify";
import { ForecastCloudMapQuerySchema } from "@sunset/contracts";
import {
  createDb,
  getLocationById,
  getLocationForecastGrid,
  getNearestHourlyForPoints,
  listHourlyTimesForPointInRange,
  listForecastPointsByIds,
  listScoresForDay,
} from "@sunset/db";

function getMatchedTimeMsFromScores(scores: Array<{ inputs: unknown }>) {
  for (const score of scores) {
    if (!score || typeof score !== "object") continue;
    const inputs = score.inputs as Record<string, unknown> | null | undefined;
    if (!inputs) continue;
    const matchedTimeMs = inputs.matchedTimeMs;
    if (typeof matchedTimeMs === "number" && Number.isFinite(matchedTimeMs)) return matchedTimeMs;
  }
  return null;
}

export async function registerForecastRoutes(app: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const { db, pool } = createDb(databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/forecast/cloud-map", async (req, reply) => {
    const q = ForecastCloudMapQuerySchema.parse((req as any).query ?? {});

    const location = await getLocationById(db, q.locationId);
    if (!location) {
      return reply.code(404).send({ ok: false, error: "location_not_found" });
    }

    const scores = await listScoresForDay(db, {
      locationId: q.locationId,
      day: q.day,
      kind: q.kind,
    });

    if (scores.length === 0) {
      return reply.code(404).send({ ok: false, error: "scores_not_found" });
    }

    const matchedTimeMs = getMatchedTimeMsFromScores(scores);
    if (!matchedTimeMs) {
      return reply
        .code(409)
        .send({ ok: false, error: "matched_time_missing", message: "Score inputs missing matchedTimeMs." });
    }

    const grid = await getLocationForecastGrid(db, q.locationId);
    const pointIds = Array.from(new Set(grid.map((cell) => cell.forecastPointId)));
    const points = await listForecastPointsByIds(db, pointIds);
    const pointsById = new Map(points.map((point) => [point.id, point]));

    const targetMs = q.targetMs ?? matchedTimeMs;

    const hourlyByPoint = await getNearestHourlyForPoints(db, {
      pointIds,
      targetMs,
      windowHours: 1,
    });

    const referencePointId = pointIds[0];
    const availableTimeMs = referencePointId
      ? await listHourlyTimesForPointInRange(db, {
          pointId: referencePointId,
          fromMs: matchedTimeMs - 24 * 60 * 60 * 1000,
          toMs: matchedTimeMs + 24 * 60 * 60 * 1000,
        })
      : [];

    const cells = grid
      .map((cell) => {
        const point = pointsById.get(cell.forecastPointId);
        const hourly = hourlyByPoint.get(cell.forecastPointId);
        if (!point || !hourly) return null;
        return {
          gridI: cell.gridI,
          gridJ: cell.gridJ,
          pointId: cell.forecastPointId,
          lat: point.lat,
          lon: point.lon,
          timeMs: hourly.timeMs,
          cloudCover: hourly.cloudCover,
          cloudCoverLow: hourly.cloudCoverLow,
          cloudCoverMid: hourly.cloudCoverMid,
          cloudCoverHigh: hourly.cloudCoverHigh,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      ok: true,
      location: {
        id: location.id,
        name: location.name ?? null,
        key: location.key,
        lat: location.lat,
        lon: location.lon,
        tz: location.tz ?? null,
      },
      day: q.day,
      kind: q.kind,
      matchedTimeMs,
      targetMs,
      availableTimeMs,
      cells,
    };
  });
}
