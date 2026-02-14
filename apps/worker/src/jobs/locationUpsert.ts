import type { Db } from "@sunset/db";
import { UpsertLocationJobPayloadSchema } from "@sunset/contracts";
import { makeLocationKey, upsertLocation } from "@sunset/db";

export async function locationUpsert(db: Db["db"], payload: unknown) {
  const { lat, lon } = UpsertLocationJobPayloadSchema.parse(payload);

  const locationKey = makeLocationKey(lat, lon, 3);
  const location = await upsertLocation(db, { lat, lon, decimals: 3 });

  return {
    locationId: location.id,
    locationKey,
    lat: location.lat,
    lon: location.lon,
  };
}
