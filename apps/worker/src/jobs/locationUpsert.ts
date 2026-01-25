import type { Db } from "@sunset/db";
import { z } from "zod";
import { makeLocationKey, upsertLocation } from "@sunset/db";

const PayloadSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export async function locationUpsert(db: Db["db"], payload: unknown) {
  const { lat, lon } = PayloadSchema.parse(payload);

  const locationKey = makeLocationKey(lat, lon, 3);
  const location = await upsertLocation(db, { lat, lon, decimals: 3 });

  return {
    locationId: location.id,
    locationKey,
    lat: location.lat,
    lon: location.lon,
  };
}
