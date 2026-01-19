import Fastify from "fastify";
import { registerHealthRoutes } from "./http/health.js";
import { registerDbHealthRoutes } from "./http/dbHealth.js";
import { getEnv } from "./config/env.js";

const env = getEnv();

const app = Fastify({
  logger: true
});

await registerHealthRoutes(app);
await registerDbHealthRoutes(app);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
