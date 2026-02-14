import { z } from "zod";
import { CoordinatesSchema } from "./core";

export const ListLocationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListLocationsQuery = z.infer<typeof ListLocationsQuerySchema>;

export const CreateLocationBodySchema = CoordinatesSchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
});
export type CreateLocationBody = z.infer<typeof CreateLocationBodySchema>;
