import { eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { locations } from "./schema.js";

export type LocationRow = typeof locations.$inferSelect;

function normalizeNegativeZero(n: number) {
  return Object.is(n, -0) ? 0 : n;
}

export function roundTo(n: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return normalizeNegativeZero(Math.round(n * factor) / factor);
}

/**
 * Deterministic dedupe key for "same place" requests.
 * 3 decimals ~ 111m lat resolution (good enough for v1).
 */
export function makeLocationKey(lat: number, lon: number, decimals = 3) {
  const latR = roundTo(lat, decimals).toFixed(decimals);
  const lonR = roundTo(lon, decimals).toFixed(decimals);
  return `${latR},${lonR}`;
}

export async function upsertLocation(
  db: Db["db"],
  input: { lat: number; lon: number; decimals?: number },
) {
  const decimals = input.decimals ?? 3;
  const lat = roundTo(input.lat, decimals);
  const lon = roundTo(input.lon, decimals);
  const key = makeLocationKey(lat, lon, decimals);

  const rows = await db
    .insert(locations)
    .values({
      key,
      lat,
      lon,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: locations.key,
      set: {
        lat,
        lon,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0]!;
}

export async function getLocationByKey(db: Db["db"], key: string) {
  const rows = await db.select().from(locations).where(eq(locations.key, key)).limit(1);
  return rows[0] ?? null;
}
