ALTER TABLE "job_queue" ALTER COLUMN "max_attempts" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tz" text;