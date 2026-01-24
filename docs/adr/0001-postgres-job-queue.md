# ADR 0001: Custom Postgres Job Queue

## Date
2026-01-21

## Context
We need background processing for:
- fetching forecast data (cloud layers, humidity, haze, etc.)
- generating sunrise/sunset times for locations
- computing “burning sky” and other sunset/sunrise scores
- cleanup tasks (retention, backfills)

The API should stay fast and mostly return precomputed results.
We’re running in Docker and already depend on Postgres, so we want a job system that works without adding more infrastructure.

## Decision
We will build a small job queue using Postgres.

It will include:
- a `job_queue` table to store jobs and their status
- a `job_runs` table to record attempts and failures for debugging
- a worker loop that safely claims jobs using Postgres row locks

Jobs will support:
- retries with backoff (wait longer after each failure)
- deduplication (avoid creating the same job many times)
- idempotent handlers (safe to run twice)

## Why Postgres (and why custom)
Postgres gives us:
- durability (jobs survive restarts)
- safe concurrency (multiple workers can run without double-processing)
- a simple deployment story (Docker-only)

We’re implementing it ourselves because:
- it keeps dependencies low
- the requirements are small and well-defined
- it’s easier to understand and customize for this project

## Alternatives Considered
- **pg-boss / Graphile Worker (Postgres libraries):** great options, but we want full control and transparency.
- **BullMQ (Redis):** reliable, but adds Redis.
- **AWS SQS / EventBridge:** best for production scale, but not needed yet.
- **Cron only (no queue):** too fragile; jobs can be lost and there’s no retry/visibility.

## How it Works (High Level)
1. API (or scheduler) inserts a row in `job_queue`.
2. Worker polls for runnable jobs:
   - `status = queued/retrying`
   - `run_after <= now()`
3. Worker claims a job using `FOR UPDATE SKIP LOCKED` so two workers can’t claim the same job.
4. Worker runs the job:
   - success → mark job `succeeded`
   - fail → record error and either retry later or mark `dead`

## Operational Rules
- **Retries:** exponential backoff up to a max attempt count.
- **Deduplication:** jobs have a deterministic `key` (e.g. `score:latlon:date`) so we don’t enqueue duplicates.
- **Idempotency:** writes use unique constraints + upserts so re-running a job doesn’t corrupt data.
- **Visibility:** every attempt is recorded in `job_runs`.
- **Cleanup:** old jobs/runs are periodically deleted based on retention.

## Consequences
### Pros
- No extra infrastructure
- Durable and restart-safe
- Works with multiple worker containers
- Clear visibility into failures

### Cons
- We own the queue logic and must test it
- Not as feature-rich as mature queue products

## Future
If we outgrow this, we can replace the queue layer with pg-boss or SQS later without changing the job handlers.
