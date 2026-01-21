# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a **pnpm monorepo** for a sunset/sunrise prediction application with the following architecture:

- **apps/web** - Frontend web application (SSR)
- **apps/api** - Backend REST API service
- **apps/worker** - Background worker service
- **packages/db** - Shared database layer (Drizzle ORM + Postgres)
- **packages/contracts** - Shared types/interfaces between services

All services run in Docker containers and communicate via Docker networking. The web app makes server-side calls to the API at `http://api:3001`, and all services connect to Postgres at `postgres:5432`.

## Prerequisites

- Docker + Docker Compose
- Node 20+
- pnpm (enable with `corepack enable`)

## Common Commands

### Initial Setup
```bash
# Enable pnpm
corepack enable

# Install dependencies
pnpm install

# Start Postgres for migrations
docker compose up -d postgres

# Set DATABASE_URL for local migration commands
export DATABASE_URL="postgres://sunset:sunset@localhost:5432/sunset"

# Generate and apply migrations
pnpm db:generate
pnpm db:migrate
```

### Development
```bash
# Start all services (web, api, worker, postgres)
docker compose up --build

# Run all packages in dev mode (alternative to Docker)
pnpm dev

# Build all packages
pnpm build

# Type checking across all packages
pnpm typecheck
```

### Database Management
```bash
# Generate new migration (after schema changes in packages/db)
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Run these commands with DATABASE_URL set:
export DATABASE_URL="postgres://sunset:sunset@localhost:5432/sunset"
```

### Working with Individual Packages
```bash
# Run command in specific workspace
pnpm --filter @sunset/db <command>
pnpm --filter @sunset/api <command>

# Examples
pnpm --filter @sunset/api dev
pnpm --filter @sunset/web build
```

## Docker Services

The docker-compose.yml defines four services:

1. **postgres** (port 5432)
   - User/password: `sunset/sunset`
   - Database: `sunset`
   - Healthcheck ensures it's ready before dependent services start

2. **api** (port 3001)
   - Exposes REST API endpoints
   - Connects to postgres
   - Environment: `DATABASE_URL`, `PORT=3001`

3. **worker** (no exposed port)
   - Background processing service
   - Connects to postgres
   - Environment: `DATABASE_URL`

4. **web** (port 3000)
   - SSR frontend application
   - Calls API at `http://api:3001` (internal Docker network)
   - Environment: `API_BASE_URL=http://api:3001`, `PORT=3000`

## Smoke Testing

After `docker compose up --build`, verify:

- Web: http://localhost:3000
  - Should render SSR content with API response and DB health
- API:
  - http://localhost:3001/health
  - http://localhost:3001/db/health
- Check that API and worker both connect to Postgres successfully
- Verify Drizzle migrations applied cleanly

## Architecture Notes

### Monorepo Structure
- This is a **pnpm workspace** managed via `pnpm-workspace.yaml`
- All packages are referenced by workspace protocol (e.g., `workspace:*`)
- Root `package.json` scripts use `pnpm -r` to run commands recursively

### Database Layer (packages/db)
- Uses **Drizzle ORM** for type-safe database access
- Schema definitions and migrations live here
- Shared by api and worker services
- Always run `db:generate` after schema changes, then `db:migrate` to apply

### Service Communication
- **Inside Docker**: Services use Docker service names (`postgres:5432`, `api:3001`)
- **From host machine**: Services accessible via `localhost` ports
- Web app uses `API_BASE_URL` env var to locate the API

### Docker Development Workflow
- Services mount the entire repo (`./:/app`) for hot reloading
- `node_modules` directories are excluded via volume mounts to prevent conflicts
- Postgres data persists in a Docker volume (`pgdata`)

## Development Guidelines

### When Adding New Features
1. Database changes go in `packages/db/src`
2. Run `pnpm db:generate` to create migration files
3. Run `pnpm db:migrate` to apply locally
4. Shared types/contracts go in `packages/contracts`
5. API routes go in `apps/api/src/routes`
6. Frontend pages go in `apps/web/app`

### Testing Workflow
1. Make code changes
2. Rebuild Docker services: `docker compose up --build`
3. Test endpoints and UI manually via browser/curl
4. Run type checking: `pnpm typecheck`

### Debugging
- View logs: `docker compose logs -f <service-name>`
- Shell into container: `docker compose exec <service-name> sh`
- Check database: `docker compose exec postgres psql -U sunset -d sunset`
