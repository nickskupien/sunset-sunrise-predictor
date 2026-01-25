ALTER TABLE "locations" RENAME COLUMN "name" TO "key";--> statement-breakpoint
DROP INDEX "locations_name_unique";--> statement-breakpoint
ALTER TABLE "locations"
  ALTER COLUMN "lat" TYPE double precision USING ("lat"::double precision),
  ALTER COLUMN "lon" TYPE double precision USING ("lon"::double precision);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_key_uq" ON "locations" USING btree ("key");