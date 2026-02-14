import { z } from "zod";

const DayYmdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const NodeEnvSchema = z.enum(["development", "test", "production"]);
export const YmdDateSchema = z.string().regex(DayYmdRegex);
export const PositiveIntegerSchema = z.coerce.number().int().positive();
export const ForecastDaysSchema = z.coerce.number().int().min(1).max(16).default(7);
export const ScoreKindSchema = z.enum(["sunset", "sunrise"]);
export const ScoreKindListSchema = z.array(ScoreKindSchema).min(1).max(2);
export const DEFAULT_SCORE_KINDS = ["sunset", "sunrise"] as const;
export const CoordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export const ScoreKindListFromQueryParamSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part === "sunset" || part === "sunrise");

  return parsed.length > 0 ? parsed : undefined;
}, ScoreKindListSchema.optional());
