export DATABASE_URL="postgres://sunset:sunset@localhost:5432/sunset"
pnpm --filter @sunset/db db:generate
pnpm --filter @sunset/db db:migrate