import { eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { forecastPoints, forecastHourly, locationForecastPoints, sunEvents } from "./schema.js";

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

export type SunEventRow = {
  locationId: number;
  day: string; // YYYY-MM-DD
  sunriseMs: number; // epoch ms UTC
  sunsetMs: number; // epoch ms UTC
};

export async function upsertSunEvents(db: Db["db"], rows: SunEventRow[]) {
  if (rows.length === 0) return;

  await db
    .insert(sunEvents)
    .values(rows.map((r) => ({ ...r, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [sunEvents.locationId, sunEvents.day],
      set: {
        sunriseMs: sql`excluded.sunrise_ms`,
        sunsetMs: sql`excluded.sunset_ms`,
        updatedAt: new Date(),
      },
    });
}
