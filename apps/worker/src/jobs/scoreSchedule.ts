import type { Db } from "@sunset/db";
import { z } from "zod";
import { enqueueJob, getLocationById } from "@sunset/db";

const PayloadSchema = z.object({
  locationId: z.number().int().positive(),
  forecastDays: z.number().int().min(1).max(16).default(7),
  kinds: z.array(z.enum(["sunset", "sunrise"])).default(["sunset", "sunrise"]),
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

    if (offset > count + 5) break;
  }

  return days;
}

export async function scoreSchedule(db: Db["db"], payloadRaw: unknown) {
  const payload = PayloadSchema.parse(payloadRaw);

  const location = await getLocationById(db, payload.locationId);
  if (!location) throw new Error(`location not found id=${payload.locationId}`);

  if (!location.tz) {
    throw new Error(`timezone not set for locationId=${payload.locationId}`);
  }

  const days = buildDayList(payload.forecastDays, location.tz);
  const jobs = [];

  for (const day of days) {
    for (const kind of payload.kinds) {
      const job = await enqueueJob(db, {
        type: "score.compute",
        key: `score:${payload.locationId}:${day}:${kind}`,
        payload: { locationId: payload.locationId, day, kind },
        runAfterMs: Date.now(),
      });
      jobs.push(job);
    }
  }

  return {
    locationId: payload.locationId,
    days,
    kinds: payload.kinds,
    scheduled: jobs.length,
  };
}
