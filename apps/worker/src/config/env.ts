import { WorkerEnvSchema, type WorkerEnv } from "@sunset/contracts";

export type Env = WorkerEnv;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = WorkerEnvSchema.parse(process.env);
  return cachedEnv;
}
