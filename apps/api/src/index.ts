import Fastify from "fastify";
import { registerHealthRoutes } from "./routes/health.js";
import { registerDbHealthRoutes } from "./routes/dbHealth.js";

const app = Fastify({
  logger: true
});

await registerHealthRoutes(app);
await registerDbHealthRoutes(app);

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
