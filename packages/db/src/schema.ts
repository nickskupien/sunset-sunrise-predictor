import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    lat: text("lat").notNull(),
    lon: text("lon").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqName: uniqueIndex("locations_name_unique").on(t.name)
  })
);
