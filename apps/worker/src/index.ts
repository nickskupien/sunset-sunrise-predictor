import { createDb } from "@sunset/db";
import { getEnv } from "./config/env.js";

const env = getEnv();
const { pool } = createDb(env.DATABASE_URL);

async function main() {
  const now = (await pool.query("select now()")).rows[0].now;
  console.log(`[worker] connected to postgres. now=${now}`);

  // TODO: Add actual job scheduling/execution here
  // For now, keep the process alive
  console.log("[worker] ready. Waiting for jobs...");
}

async function shutdown() {
  console.log("[worker] shutting down gracefully...");
  await pool.end();
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
