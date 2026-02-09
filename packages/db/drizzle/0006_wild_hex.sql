CREATE TABLE "sunset_sunrise_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"score" smallint NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at_ms" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sunset_sunrise_scores_loc_day_kind_type_uq" ON "sunset_sunrise_scores" USING btree ("location_id","day","kind","type");--> statement-breakpoint
CREATE INDEX "sunset_sunrise_scores_location_idx" ON "sunset_sunrise_scores" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "sunset_sunrise_scores_day_idx" ON "sunset_sunrise_scores" USING btree ("day");--> statement-breakpoint
CREATE INDEX "sunset_sunrise_scores_kind_idx" ON "sunset_sunrise_scores" USING btree ("kind");