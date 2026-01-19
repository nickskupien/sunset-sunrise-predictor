# Sunset Predictor (Monorepo)

Local dev (Docker) smoke test checklist:
- http://localhost:3000 SSR page renders
- SSR page successfully calls API
- API + worker both connect to Postgres
- Drizzle migrations apply cleanly

## Prereqs
- Docker + Docker Compose
- Node 20+ (recommended)
- pnpm (`corepack enable`)

## Setup
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

Then run migrations from your host (needs DATABASE_URL):
```bash
export DATABASE_URL="postgres://sunset:sunset@localhost:5432/sunset"

pnpm db:generate
pnpm db:migrate
```

3) Start everything
```bash
docker compose up --build
```

## Smoke test
- Web: http://localhost:3000
  - Should render SSR content including API response and DB health

- API:
  - http://localhost:3001/health
  - http://localhost:3001/db/health

## Notes
- Inside Docker, the web app reaches the API at `http://api:3001`
- Postgres is available to services at host `postgres:5432`