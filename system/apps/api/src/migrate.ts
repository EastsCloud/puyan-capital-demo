import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, "../../../db/migrations");
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

for (const file of files) {
  const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
  if (exists.rowCount) continue;

  // A previous production runner could commit the first multi-statement migration
  // and fail while normalizing the driver's result array, before recording it.
  // The migration itself is transactional, so the final trigger proves it completed.
  if (file === "0001_foundation.sql") {
    const foundation = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'audit_events_no_update'
          AND NOT tgisinternal
      ) AS complete
    `);
    if (foundation.rows[0]?.complete) {
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      process.stdout.write(`Reconciled previously applied ${file}\n`);
      continue;
    }
  }

  const sql = await readFile(join(migrationsDirectory, file), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    process.stdout.write(`Applied ${file}\n`);
  } finally {
    client.release();
  }
}

await pool.end();
