import { z } from "zod";
import { NodeEnvSchema } from "./core";

export const ApiEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export const WorkerEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WORKER_ID: z.string().min(1).optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  LEASE_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
});
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export const WebEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  API_BASE_URL: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "API_BASE_URL must use http or https",
    })
    .transform((value) => value.replace(/\/+$/, ""))
    .default("http://localhost:3001"),
});
export type WebEnv = z.infer<typeof WebEnvSchema>;
