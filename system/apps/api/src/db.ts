import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import pg from "pg";
import { config } from "./config.js";

export interface DatabaseResult {
  // SQL row shapes differ per query and are validated at route/domain boundaries.
  rows: any[];
  rowCount: number;
}

export interface DatabaseClient {
  query(text: string, values?: unknown[]): Promise<DatabaseResult>;
  release(): void;
}

export interface DatabasePool {
  query(text: string, values?: unknown[]): Promise<DatabaseResult>;
  connect(): Promise<DatabaseClient>;
  end(): Promise<void>;
}

type RawDatabaseResult = { rows?: any[]; rowCount?: number | null; affectedRows?: number };

function normalizeResult(result: RawDatabaseResult | RawDatabaseResult[]): DatabaseResult {
  if (Array.isArray(result)) {
    const lastResult = result.at(-1);
    return lastResult ? normalizeResult(lastResult) : { rows: [], rowCount: 0 };
  }
  const rows = result.rows ?? [];
  return {
    rows,
    rowCount: result.rowCount ?? (rows.length > 0 ? rows.length : (result.affectedRows ?? 0)),
  };
}

async function createPool(): Promise<DatabasePool> {
  if (config.DATABASE_URL.startsWith("pglite://")) {
    const [{ PGlite }, { pgcrypto }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("@electric-sql/pglite/contrib/pgcrypto"),
    ]);
    const configuredPath = config.DATABASE_URL.slice("pglite://".length) || "data/runtime-pg";
    const dataPath = resolve(process.cwd(), configuredPath);
    await mkdir(resolve(dataPath, ".."), { recursive: true });
    const database = new PGlite(dataPath, { extensions: { pgcrypto } });
    await database.waitReady;

    const query = async (text: string, values?: unknown[]) => {
      if (values === undefined) {
        const results = await database.exec(text);
        const result = results.at(-1) ?? { rows: [], affectedRows: 0 };
        return normalizeResult(result);
      }
      const result = await database.query(text, values);
      return normalizeResult(result);
    };
    return {
      query,
      async connect() {
        return { query, release() {} };
      },
      async end() {
        await database.close();
      },
    };
  }

  const { Pool } = pg;
  const postgresPool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: "isater-api",
  });
  return {
    async query(text: string, values?: unknown[]) {
      return normalizeResult(await postgresPool.query(text, values));
    },
    async connect() {
      const client = await postgresPool.connect();
      return {
        async query(text: string, values?: unknown[]) {
          return normalizeResult(await client.query(text, values));
        },
        release() { client.release(); },
      };
    },
    async end() { await postgresPool.end(); },
  };
}

export const pool = await createPool();
