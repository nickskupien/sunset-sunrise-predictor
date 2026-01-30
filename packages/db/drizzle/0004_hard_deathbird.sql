DROP INDEX "sun_events_loc_sunset_uq";--> statement-breakpoint
ALTER TABLE "sun_events" ADD COLUMN "day" date NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sun_events_loc_day_uq" ON "sun_events" USING btree ("location_id","day");