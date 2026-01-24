import Fastify from "fastify";
import { registerHealthRoutes } from "./http/health.js";
import { registerDbHealthRoutes } from "./http/dbHealth.js";
import { registerJobsRoutes } from "./http/jobs.js";
import { getEnv } from "./config/env.js";
import { pool } from "./config/db.js";

const env = getEnv();

const app = Fastify({
  logger: true,
});

await registerHealthRoutes(app);
await registerDbHealthRoutes(app);
await registerJobsRoutes(app);

async function shutdown() {
  app.log.info("Shutting down gracefully...");
  await app.close();
  await pool.end();
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API server listening on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  await pool.end();
  process.exit(1);
}
