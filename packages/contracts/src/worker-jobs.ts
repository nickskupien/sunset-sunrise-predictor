import { z } from "zod";
import {
  YmdDateSchema,
  DEFAULT_SCORE_KINDS,
  ForecastDaysSchema,
  CoordinatesSchema,
  PositiveIntegerSchema,
  ScoreKindSchema,
  ScoreKindListSchema,
} from "./core";

export const UpsertLocationJobPayloadSchema = CoordinatesSchema;
export type UpsertLocationJobPayload = z.infer<typeof UpsertLocationJobPayloadSchema>;

export const ScoreComputeJobPayloadSchema = z.object({
  locationId: PositiveIntegerSchema,
  day: YmdDateSchema,
  kind: ScoreKindSchema,
});
export type ScoreComputeJobPayload = z.infer<typeof ScoreComputeJobPayloadSchema>;

export const ScoreScheduleJobPayloadSchema = z.object({
  locationId: PositiveIntegerSchema,
  forecastDays: ForecastDaysSchema,
  kinds: ScoreKindListSchema.default(() => [...DEFAULT_SCORE_KINDS]),
});
export type ScoreScheduleJobPayload = z.infer<typeof ScoreScheduleJobPayloadSchema>;

export const ForecastRefreshJobPayloadSchema = z.object({
  locationId: PositiveIntegerSchema,
  forecastDays: ForecastDaysSchema,
  halfSizeKm: z.number().positive().default(40),
  stepKm: z.number().positive().default(4),
  snapKm: z.number().positive().default(1),
  schedule: z
    .object({
      forecastDays: ForecastDaysSchema,
      kinds: ScoreKindListSchema,
    })
    .optional(),
});
export type ForecastRefreshJobPayload = z.infer<typeof ForecastRefreshJobPayloadSchema>;
