import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const host = process.env.ISATER_DEV_DB_HOST ?? "127.0.0.1";
const port = Number(process.env.ISATER_DEV_DB_PORT ?? 55432);
const dataDirectory = resolve(process.cwd(), process.env.ISATER_DEV_DB_PATH ?? "data/dev-pg");

await mkdir(dirname(dataDirectory), { recursive: true });
const db = new PGlite(dataDirectory, { extensions: { pgcrypto } });
await db.waitReady;

const server = new PGLiteSocketServer({ db, host, port, maxConnections: 20 });
await server.start();
process.stdout.write(`isater development database listening at ${server.getServerConn()}\n`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await server.stop();
  await db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
