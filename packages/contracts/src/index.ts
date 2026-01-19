import { z } from "zod";

export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  time: z.string()
});

export type HealthResponse = z.infer<typeof HealthSchema>;

export const DbHealthSchema = z.object({
  ok: z.boolean(),
  dbTime: z.string(),
  time: z.string()
});

export type DbHealthResponse = z.infer<typeof DbHealthSchema>;
