import { z } from "zod";
import { PositiveIntegerSchema, ScoreKindSchema, YmdDateSchema } from "./core";

export const ForecastCloudMapQuerySchema = z.object({
  locationId: PositiveIntegerSchema,
  day: YmdDateSchema,
  kind: ScoreKindSchema,
  targetMs: z.coerce.number().int().positive().optional(),
});
export type ForecastCloudMapQuery = z.infer<typeof ForecastCloudMapQuerySchema>;
