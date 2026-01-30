CREATE TABLE "forecast_hourly" (
	"id" serial PRIMARY KEY NOT NULL,
	"forecast_point_id" integer NOT NULL,
	"time_ms" bigint NOT NULL,
	"relative_humidity" smallint NOT NULL,
	"precipitation_probability" smallint NOT NULL,
	"precipitation" double precision NOT NULL,
	"temperature" double precision NOT NULL,
	"cloud_cover" smallint NOT NULL,
	"cloud_cover_low" smallint NOT NULL,
	"cloud_cover_mid" smallint NOT NULL,
	"cloud_cover_high" smallint NOT NULL,
	"visibility" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_forecast_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"forecast_point_id" integer NOT NULL,
	"grid_i" smallint NOT NULL,
	"grid_j" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sun_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"sunrise_ms" bigint NOT NULL,
	"sunset_ms" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_hourly_point_time_uq" ON "forecast_hourly" USING btree ("forecast_point_id","time_ms");--> statement-breakpoint
CREATE INDEX "forecast_hourly_point_idx" ON "forecast_hourly" USING btree ("forecast_point_id");--> statement-breakpoint
CREATE INDEX "forecast_hourly_time_idx" ON "forecast_hourly" USING btree ("time_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_points_key_uq" ON "forecast_points" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "location_forecast_points_loc_grid_uq" ON "location_forecast_points" USING btree ("location_id","grid_i","grid_j");--> statement-breakpoint
CREATE INDEX "location_forecast_points_location_idx" ON "location_forecast_points" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "location_forecast_points_point_idx" ON "location_forecast_points" USING btree ("forecast_point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sun_events_loc_sunset_uq" ON "sun_events" USING btree ("location_id","sunset_ms");--> statement-breakpoint
CREATE INDEX "sun_events_location_idx" ON "sun_events" USING btree ("location_id");