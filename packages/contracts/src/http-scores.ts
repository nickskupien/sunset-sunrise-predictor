import { z } from "zod";
import {
  YmdDateSchema,
  DEFAULT_SCORE_KINDS,
  ForecastDaysSchema,
  CoordinatesSchema,
  PositiveIntegerSchema,
  ScoreKindSchema,
  ScoreKindListFromQueryParamSchema,
  ScoreKindListSchema,
} from "./core";
import { CreateLocationBodySchema } from "./http-locations";

export const LocationIdParamsSchema = z.object({
  locationId: PositiveIntegerSchema,
});
export type LocationIdParams = z.infer<typeof LocationIdParamsSchema>;

export const LocationScoreParamsSchema = z.object({
  locationId: PositiveIntegerSchema,
  day: YmdDateSchema,
  kind: ScoreKindSchema,
});
export type LocationScoreParams = z.infer<typeof LocationScoreParamsSchema>;

export const ScoresByCoordinatesQuerySchema = CoordinatesSchema.extend({
  day: YmdDateSchema,
  kind: ScoreKindSchema,
});
export type ScoresByCoordinatesQuery = z.infer<typeof ScoresByCoordinatesQuerySchema>;

export const PrepareScoresByCoordinatesBodySchema = CreateLocationBodySchema.extend({
  forecastDays: ForecastDaysSchema,
  kinds: ScoreKindListSchema.default(() => [...DEFAULT_SCORE_KINDS]),
});
export type PrepareScoresByCoordinatesBody = z.infer<typeof PrepareScoresByCoordinatesBodySchema>;

export const PrepareScoresByLocationBodySchema = z.object({
  forecastDays: ForecastDaysSchema,
  kinds: ScoreKindListSchema.default(() => [...DEFAULT_SCORE_KINDS]),
});
export type PrepareScoresByLocationBody = z.infer<typeof PrepareScoresByLocationBodySchema>;

export const ScoresStatusByCoordinatesQuerySchema = CoordinatesSchema.extend({
  forecastDays: ForecastDaysSchema,
  kinds: ScoreKindListFromQueryParamSchema,
  minComputedAtMs: z.coerce.number().int().nonnegative().optional(),
});
export type ScoresStatusByCoordinatesQuery = z.infer<typeof ScoresStatusByCoordinatesQuerySchema>;

export const ScoresStatusByLocationQuerySchema = z.object({
  forecastDays: ForecastDaysSchema,
  kinds: ScoreKindListFromQueryParamSchema,
  minComputedAtMs: z.coerce.number().int().nonnegative().optional(),
});
export type ScoresStatusByLocationQuery = z.infer<typeof ScoresStatusByLocationQuerySchema>;
