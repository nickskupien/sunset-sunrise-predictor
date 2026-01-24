CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'retrying', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_stack" text,
	"result_summary" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "job_queue_type_key_unique" ON "job_queue" USING btree ("type","key");--> statement-breakpoint
CREATE INDEX "job_queue_runnable_idx" ON "job_queue" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "job_queue_type_key_idx" ON "job_queue" USING btree ("type","key");--> statement-breakpoint
CREATE INDEX "job_runs_job_id_idx" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_runs_type_key_idx" ON "job_runs" USING btree ("type","key");