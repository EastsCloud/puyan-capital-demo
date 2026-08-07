import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.API_HOST, port: config.API_PORT });
