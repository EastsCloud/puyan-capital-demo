import { validatePassword } from "@isater/domain";
import { pool } from "./db.js";
import { hashPassword } from "./security.js";

const username = process.env.ISATER_ADMIN_USERNAME?.trim();
const displayName = process.env.ISATER_ADMIN_DISPLAY_NAME?.trim();
const password = process.env.ISATER_ADMIN_PASSWORD ?? "";
const email = process.env.ISATER_ADMIN_EMAIL?.trim() || null;

if (!username || !displayName || !validatePassword(password).valid) {
  throw new Error("Set ISATER_ADMIN_USERNAME, ISATER_ADMIN_DISPLAY_NAME and a policy-compliant ISATER_ADMIN_PASSWORD");
}

const existing = await pool.query("SELECT count(*)::int AS count FROM users");
if (existing.rows[0].count > 0) {
  process.stdout.write("Administrator bootstrap skipped because users already exist.\n");
  await pool.end();
} else {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organization = await client.query(
      "INSERT INTO organizations (name) VALUES ('Puyan Capital') RETURNING id",
    );
    const organizationId = organization.rows[0].id;
    await client.query(
      `INSERT INTO users
        (organization_id, username, display_name, email, role, status, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, 'system_admin', 'invited', $5, true)`,
      [organizationId, username, displayName, email, passwordHash],
    );
    await client.query(
      `INSERT INTO portfolios (organization_id, code, name, base_currency)
       VALUES ($1, 'PROP-USD-01', 'Puyan Capital Proprietary Portfolio', 'USD')`,
      [organizationId],
    );
    await client.query("COMMIT");
    process.stdout.write("Initial organization, administrator and USD proprietary portfolio created.\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
