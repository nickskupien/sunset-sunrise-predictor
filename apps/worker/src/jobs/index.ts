import type { Db } from "@sunset/db";
import { ping } from "./ping.js";
import { locationUpsert } from "./locationUpsert.js";

export type JobHandler = (db: Db["db"], payload: unknown) => Promise<unknown>;

export const handlers: Record<string, JobHandler> = {
  ping,
  "location.upsert": locationUpsert,
};
