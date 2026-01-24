import type { Pool } from "pg";

export async function ping(_pool: Pool, payload: unknown) {
  return { ok: true, payload };
}
