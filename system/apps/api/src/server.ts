import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { initializeEodhdConnectionsFromEnvironment } from "./eodhd.js";

const initializedEodhdConnections = await initializeEodhdConnectionsFromEnvironment();
if (initializedEodhdConnections > 0) {
  process.stdout.write(`Initialized ${initializedEodhdConnections} EODHD connection(s) from the protected environment.\n`);
}
const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.API_HOST, port: config.API_PORT });
