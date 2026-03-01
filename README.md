# Overview

As an avid photographer, I find myself planning shoots with various weather conditions in mind.

Conditions like:
- Misty sunrises
- Sunsets where the entire sky lights up red
- Smoky hazy skies
- Frost covered trees

I want to prepare for these conditions in advance, and even plan trips around the conditions.

I have not been able to find a way to predict these accurately, with photography lens in mind.

This project aims to extract weather data and predict unique, rare, and photogenic weather conditions in advance.

# Tech Stack
- **Language & Runtime:** TypeScript across the full stack, enabling end-to-end type safety and consistent developer ergonomics.
- **Frontend:** Next.js + React for SSR-capable UI delivery and modern app routing.
- **Background Processing:** Dedicated Node/TypeScript worker service for async jobs (forecast refresh, scoring, scheduling).
- **Database:** PostgreSQL 16 as the primary relational datastore.
- **API Layer:** Fastify (TypeScript, ESM) for a lean, high-performance HTTP service.
- **Data Access & Migrations:** Drizzle ORM + Drizzle Kit for typed schema modeling and migration workflows.
- **Validation & Contracts:** Zod-based shared contracts for runtime validation and cross-service API consistency.
- **Tests:** Vitest (tests), ESLint, Prettier, and strict TypeScript checks.
- **Monorepo Tooling:** PNPM workspaces with shared internal packages (contracts, db, utils, config) for modular architecture and reuse.
- **Dev Environment:** Docker + Docker Compose for reproducible multi-service local development (web, API, worker, Postgres).

# Screenshots

## Forecast Page
<img width="1000" alt="image" src="https://github.com/user-attachments/assets/3415da35-1f63-40ef-825e-a9937c19b374" />

## Location Settings Page
<img width="1000" alt="image" src="https://github.com/user-attachments/assets/2af0ce7a-4c24-4cb0-85ae-ce0f50cbf821" />

# Setup
1) Install deps
```bash
corepack enable
pnpm install
```

2) Generate & apply DB migrations

First start Postgres:
```bash
docker compose up -d postgres
```

Then run migrations from your host:
```bash
pnpm --filter @sunset/db aio:generate
```

3) Start everything
```bash
docker compose up --build
```

# Notes
- Inside Docker, the web app reaches the API at `http://api:3001`
- Postgres is available to services at host `postgres:5432`

# Lighthouse CI
Lighthouse CI is integrated for automated web performance/accessibility audits.

## Local usage
1) Run audits
```bash
pnpm lighthouse:audit
```

2) Start dashboard
```bash
pnpm lighthouse:dashboard:start
```

3) Upload to dashboard
```bash
pnpm lighthouse:dashboard:upload
```

## Reports output
- Raw LHCI output: `.lighthouseci/`
- Human-readable reports by commit: `reports/lighthouse/YYYYMMDD-HASH/`
- Commit index page: `reports/lighthouse/YYYYMMDD-HASH/index.html`

## CI workflow
- GitHub Actions workflow: `.github/workflows/lighthouse-ci.yml`

For full setup and token wiring, see `docs/lighthouse-ci.md`.
