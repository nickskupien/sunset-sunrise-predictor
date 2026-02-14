import { z } from "zod";
import { PositiveIntegerSchema } from "./core";

export const JobIdParamsSchema = z.object({
  id: PositiveIntegerSchema,
});
export type JobIdParams = z.infer<typeof JobIdParamsSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "retrying", "succeeded", "dead"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const EnqueueJobBodySchema = z.object({
  type: z.string().min(1),
  key: z.string().min(1),
  payload: z.unknown().optional(),
  runAfterMs: z.coerce.number().int().nonnegative().optional(),
  maxAttempts: z.coerce.number().int().positive().max(50).optional(),
});
export type EnqueueJobBody = z.infer<typeof EnqueueJobBodySchema>;

export const ListJobsQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListJobsQuery = z.infer<typeof ListJobsQuerySchema>;

export const ListJobRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListJobRunsQuery = z.infer<typeof ListJobRunsQuerySchema>;
