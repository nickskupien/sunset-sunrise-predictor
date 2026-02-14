import { WebEnvSchema, type WebEnv } from "@sunset/contracts";

export type Env = WebEnv;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = WebEnvSchema.parse(process.env);
  return cachedEnv;
}
