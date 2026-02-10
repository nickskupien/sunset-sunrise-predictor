import type { Db } from "@sunset/db";
import { ping } from "./ping.js";
import { locationUpsert } from "./locationUpsert.js";
import { forecastRefresh } from "./forecastRefresh.js";
import { scoreCompute } from "./scoreCompute.js";
import { scoreSchedule } from "./scoreSchedule.js";

export type JobHandler = (db: Db["db"], payload: unknown) => Promise<unknown>;

export const handlers: Record<string, JobHandler> = {
  ping,
  "location.upsert": locationUpsert,
  "forecast.refresh": forecastRefresh,
  "score.compute": scoreCompute,
  "score.schedule": scoreSchedule,
};
