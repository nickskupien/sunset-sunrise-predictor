import type { Pool } from "pg";
import { ping } from "./ping.js";

export type JobHandler = (pool: Pool, payload: unknown) => Promise<unknown>;

export const handlers: Record<string, JobHandler> = {
  ping,
};
