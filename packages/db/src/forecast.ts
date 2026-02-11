import { eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { forecastPoints, forecastHourly, locationForecastPoints } from "./schema.js";

export type ForecastPointInput = {
  key: string;
  lat: number;
  lon: number;
};

export async function upsertForecastPoints(db: Db["db"], points: ForecastPointInput[]) {
  if (points.length === 0) return new Map<string, number>();

  const rows = await db
    .insert(forecastPoints)
    .values(points.map((p) => ({ ...p, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [forecastPoints.key],
      set: {
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: forecastPoints.id, key: forecastPoints.key });

  const idByKey = new Map<string, number>();
  for (const r of rows) idByKey.set(r.key, r.id);
  return idByKey;
}

export type LocationGridLinkInput = {
  forecastPointId: number;
  gridI: number;
  gridJ: number;
};

export async function replaceLocationGridLinks(
  db: Db["db"],
  locationId: number,
  links: LocationGridLinkInput[],
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(locationForecastPoints)
      .where(eq(locationForecastPoints.locationId, locationId));

    if (links.length === 0) return;

    await tx.insert(locationForecastPoints).values(
      links.map((l) => ({
        locationId,
        forecastPointId: l.forecastPointId,
        gridI: l.gridI,
        gridJ: l.gridJ,
      })),
    );
  });
}

export type ForecastHourlyRow = {
  forecastPointId: number;
  timeMs: number; // epoch ms UTC
  relativeHumidity: number; // %
  precipitationProbability: number; // %
  precipitation: number; // mm
  temperature: number; // °C
  cloudCover: number; // %
  cloudCoverLow: number; // %
  cloudCoverMid: number; // %
  cloudCoverHigh: number; // %
  visibility: number; // meters
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertForecastHourly(db: Db["db"], rows: ForecastHourlyRow[]) {
  if (rows.length === 0) return;

  // keep batches reasonable for SQL parameter limits
  for (const batch of chunk(rows, 1500)) {
    await db
      .insert(forecastHourly)
      .values(batch.map((r) => ({ ...r, updatedAt: new Date() })))
      .onConflictDoUpdate({
        target: [forecastHourly.forecastPointId, forecastHourly.timeMs],
        set: {
          relativeHumidity: sql`excluded.relative_humidity`,
          precipitationProbability: sql`excluded.precipitation_probability`,
          precipitation: sql`excluded.precipitation`,
          temperature: sql`excluded.temperature`,
          cloudCover: sql`excluded.cloud_cover`,
          cloudCoverLow: sql`excluded.cloud_cover_low`,
          cloudCoverMid: sql`excluded.cloud_cover_mid`,
          cloudCoverHigh: sql`excluded.cloud_cover_high`,
          visibility: sql`excluded.visibility`,
          updatedAt: new Date(),
        },
      });
  }
}

export type ForecastGridCell = {
  gridI: number;
  gridJ: number;
  forecastPointId: number;
};

/**
 * Return all grid cells for the location (grid_i, grid_j, point_id).
 */
export async function getLocationForecastGrid(
  db: Db["db"],
  locationId: number,
): Promise<ForecastGridCell[]> {
  const rows = await db
    .select({
      gridI: locationForecastPoints.gridI,
      gridJ: locationForecastPoints.gridJ,
      forecastPointId: locationForecastPoints.forecastPointId,
    })
    .from(locationForecastPoints)
    .where(sql`${locationForecastPoints.locationId} = ${locationId}`);

  if (rows.length === 0) {
    throw new Error(
      `location_forecast_points missing for locationId=${locationId} (run forecast.refresh)`,
    );
  }

  return rows as ForecastGridCell[];
}

export type ForecastNearestHourlyRow = {
  forecastPointId: number;
  timeMs: number;

  relativeHumidity: number;
  precipitationProbability: number;
  precipitation: number;
  temperature: number;
  cloudCover: number;
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
  visibility: number;
};

/**
 * For each forecastPointId, fetch the hourly row closest to targetMs within +/- windowHours.
 * Uses DISTINCT ON to pick the nearest row per point in a single query.
 */
export async function getNearestHourlyForPoints(
  db: Db["db"],
  params: { pointIds: number[]; targetMs: number; windowHours?: number },
): Promise<Map<number, ForecastNearestHourlyRow>> {
  if (params.pointIds.length === 0) return new Map<number, ForecastNearestHourlyRow>();

  const windowHours = params.windowHours ?? 3;
  const windowMs = windowHours * 60 * 60 * 1000;
  const fromMs = params.targetMs - windowMs;
  const toMs = params.targetMs + windowMs;

  const result = await db.execute(sql`
    SELECT DISTINCT ON (fh.forecast_point_id)
      fh.forecast_point_id             AS "forecastPointId",
      fh.time_ms                       AS "timeMs",
      fh.relative_humidity             AS "relativeHumidity",
      fh.precipitation_probability     AS "precipitationProbability",
      fh.precipitation                 AS "precipitation",
      fh.temperature                   AS "temperature",
      fh.cloud_cover                   AS "cloudCover",
      fh.cloud_cover_low               AS "cloudCoverLow",
      fh.cloud_cover_mid               AS "cloudCoverMid",
      fh.cloud_cover_high              AS "cloudCoverHigh",
      fh.visibility                    AS "visibility"
    FROM ${forecastHourly} fh
    WHERE fh.forecast_point_id IN (${sql.join(params.pointIds, sql`, `)})
      AND fh.time_ms BETWEEN ${fromMs} AND ${toMs}
    ORDER BY fh.forecast_point_id, ABS(fh.time_ms - ${params.targetMs}) ASC;
  `);

  const rows = (result.rows ?? []) as any[];

  const byPoint = new Map<number, ForecastNearestHourlyRow>();

  for (const r of rows) {
    const pointId = Number(r.forecastPointId);
    byPoint.set(pointId, {
      forecastPointId: pointId,
      timeMs: Number(r.timeMs),

      relativeHumidity: Number(r.relativeHumidity),
      precipitationProbability: Number(r.precipitationProbability),
      precipitation: Number(r.precipitation),
      temperature: Number(r.temperature),
      cloudCover: Number(r.cloudCover),
      cloudCoverLow: Number(r.cloudCoverLow),
      cloudCoverMid: Number(r.cloudCoverMid),
      cloudCoverHigh: Number(r.cloudCoverHigh),
      visibility: Number(r.visibility),
    });
  }

  return byPoint;
}
