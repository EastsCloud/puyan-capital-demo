import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const migrationDirectory = join(here, "../../../db/migrations");
const db = new PGlite({ extensions: { pgcrypto } });

beforeAll(async () => {
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(join(migrationDirectory, file), "utf8"));
  }
});

afterAll(async () => {
  await db.close();
});

describe("PostgreSQL migrations", () => {
  it("creates the required production tables", async () => {
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = result.rows.map((row) => row.table_name);
    expect(tables).toEqual(expect.arrayContaining([
      "users",
      "sessions",
      "workflow_cases",
      "approval_rounds",
      "approval_votes",
      "maker_checker_actions",
      "audit_events",
      "annual_data_packages",
      "target_return_versions",
      "sleeve_target_versions",
      "proposed_portfolio_versions",
      "backtest_runs",
      "optimization_runs",
      "position_snapshots",
      "external_data_connections",
      "execution_fill_batches",
      "execution_fill_lines",
      "external_cash_flows",
      "report_distributions",
    ]));
  });

  it("installs versioned default parameters without test data", async () => {
    const versions = await db.query<{ version: number; description: string; parameters: Record<string, unknown> }>(
      "SELECT version, description, parameters FROM default_business_parameters ORDER BY version",
    );
    expect(versions.rows).toHaveLength(3);
    expect(versions.rows[0].version).toBe(1);
    expect(versions.rows[0].description).toContain("No Teresa test data");
    expect(versions.rows[1].version).toBe(2);
    expect(versions.rows[1].parameters).toHaveProperty("targetReturn");
    expect(versions.rows[2].version).toBe(3);
    expect(versions.rows[2].parameters).toHaveProperty("annualAllocation");
    expect(versions.rows[2].parameters).not.toHaveProperty("scenarioBands");
    expect(versions.rows[2].parameters).not.toHaveProperty("allocationDefaults");
    const users = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM users");
    expect(users.rows[0].count).toBe(0);
  });

  it("prevents audit records from being changed or deleted", async () => {
    const organization = await db.query<{ id: string }>(
      "INSERT INTO organizations (name) VALUES ('Migration Test') RETURNING id",
    );
    await db.query(
      `INSERT INTO audit_events (organization_id, action, entity_type, outcome)
       VALUES ($1, 'migration.test', 'database', 'allowed')`,
      [organization.rows[0].id],
    );
    await expect(db.exec("UPDATE audit_events SET action = 'changed'")).rejects.toThrow(/immutable/);
    await expect(db.exec("DELETE FROM audit_events")).rejects.toThrow(/immutable/);
  });
});
