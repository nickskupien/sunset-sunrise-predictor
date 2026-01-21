import { createDb } from "@sunset/db";
import { getEnv } from "./env.js";

const env = getEnv();

const { db, pool } = createDb(env.DATABASE_URL);

export { db, pool };
