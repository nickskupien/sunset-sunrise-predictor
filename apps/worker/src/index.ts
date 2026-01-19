import { createDb } from "@sunset/db";
import { getEnv } from "./config/env.js";

const env = getEnv();

const { pool } = createDb(env.DATABASE_URL);

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
