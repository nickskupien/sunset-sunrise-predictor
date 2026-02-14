import { ApiEnvSchema, type ApiEnv } from "@sunset/contracts";

export type Env = ApiEnv;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = ApiEnvSchema.parse(process.env);
  return cachedEnv;
}
