import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { sunsetSunriseScores } from "./schema.js";

export type ScoreKind = "sunset" | "sunrise";

export type UpsertScoreInput = {
  locationId: number;
  day: string; // YYYY-MM-DD
  kind: ScoreKind;
  type: string;
  score: number;
  computedAtMs: number;
  inputs?: Record<string, unknown>;
};

export type ScoreRow = typeof sunsetSunriseScores.$inferSelect;

export async function listScoresForDay(
  db: Db["db"],
  input: { locationId: number; day: string; kind: ScoreKind },
): Promise<ScoreRow[]> {
  return db
    .select()
    .from(sunsetSunriseScores)
    .where(
      and(
        eq(sunsetSunriseScores.locationId, input.locationId),
        eq(sunsetSunriseScores.day, input.day),
        eq(sunsetSunriseScores.kind, input.kind),
      ),
    )
    .orderBy(asc(sunsetSunriseScores.type));
}

export async function getScore(
  db: Db["db"],
  input: { locationId: number; day: string; kind: ScoreKind; type: string },
): Promise<ScoreRow | null> {
  const rows = await db
    .select()
    .from(sunsetSunriseScores)
    .where(
      and(
        eq(sunsetSunriseScores.locationId, input.locationId),
        eq(sunsetSunriseScores.day, input.day),
        eq(sunsetSunriseScores.kind, input.kind),
        eq(sunsetSunriseScores.type, input.type),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertScores(db: Db["db"], rows: UpsertScoreInput[]) {
  if (rows.length === 0) return [] as ScoreRow[];

  const toInsert = rows.map((r) => ({
    locationId: r.locationId,
    day: r.day,
    kind: r.kind,
    type: r.type,
    score: r.score,
    inputs: r.inputs ?? {},
    computedAtMs: r.computedAtMs,
    updatedAt: new Date(),
  }));

  return db
    .insert(sunsetSunriseScores)
    .values(toInsert)
    .onConflictDoUpdate({
      target: [
        sunsetSunriseScores.locationId,
        sunsetSunriseScores.day,
        sunsetSunriseScores.kind,
        sunsetSunriseScores.type,
      ],
      set: {
        score: sql`excluded.score`,
        inputs: sql`excluded.inputs`,
        computedAtMs: sql`excluded.computed_at_ms`,
        updatedAt: new Date(),
      },
    })
    .returning();
}
