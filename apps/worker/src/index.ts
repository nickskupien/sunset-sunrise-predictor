import { createDb } from "@sunset/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const { pool } = createDb(databaseUrl);

async function main() {
  const now = (await pool.query("select now()")).rows[0].now;
  console.log(`[worker] connected to postgres. now=${now}`);
}

main()
  .catch((err) => {
    console.error("[worker] error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
