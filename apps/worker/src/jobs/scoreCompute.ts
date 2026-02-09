import type { Db } from "@sunset/db";
import { z } from "zod";
import { listScoresForDay, upsertScores } from "@sunset/db";

const PayloadSchema = z.object({
  locationId: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["sunset", "sunrise"]),
});

const SCORE_TYPES = ["burning_sky", "gradient", "clear", "hazy"] as const;

export async function scoreCompute(db: Db["db"], payloadRaw: unknown) {
  const payload = PayloadSchema.parse(payloadRaw);

  // idempotency: if we already have rows for this day/kind, just return them
  const existing = await listScoresForDay(db, payload);
  if (existing.length > 0) return existing;

  const computedAtMs = Date.now();

  // TODO: real math later. Hardcode for now.
  // If you want “burning_sky=70, gradient=50 ...”, put those here.
  const hardcoded: Record<string, number> = {
    burning_sky: 70,
    gradient: 50,
    clear: 0,
    hazy: 0,
  };

  const rows = SCORE_TYPES.map((type) => ({
    locationId: payload.locationId,
    day: payload.day,
    kind: payload.kind,
    type,
    score: hardcoded[type] ?? 0,
    computedAtMs,
    inputs: {}, // later fill with forecast snapshot etc.
  }));

  const saved = await upsertScores(db, rows);
  return saved;
}
