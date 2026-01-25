import type { Db } from "@sunset/db";

export async function ping(_db: Db["db"], payload: unknown) {
  return { ok: true, payload };
}
