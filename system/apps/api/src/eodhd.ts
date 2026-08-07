import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.js";
import { pool } from "./db.js";
import { fetchEodhdPrices } from "./eodhd-client.js";
export { eodhdSymbol, fetchEodhdPrices } from "./eodhd-client.js";

const providerCode = "eodhd";

const saveConnectionSchema = z.object({
  apiToken: z.string().trim().min(8).max(512).optional(),
  enabled: z.boolean(),
});

function requireAdmin(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (user.role !== "system_admin") {
    const error = new Error("Forbidden") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function publicConnection(row: any | undefined) {
  return {
    providerCode,
    displayName: "EODHD",
    configured: Boolean(row?.credential_ciphertext),
    enabled: Boolean(row?.enabled),
    maskedToken: row?.token_last_four ? `••••••••${row.token_last_four}` : null,
    lastTestedAt: row?.last_tested_at ?? null,
    lastTestStatus: row?.last_test_status ?? null,
    lastTestMessage: row?.last_test_message ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

async function connectionRow(organizationId: string) {
  const result = await pool.query(
    "SELECT * FROM external_data_connections WHERE organization_id = $1 AND provider_code = 'eodhd'",
    [organizationId],
  );
  return result.rows[0];
}

export async function getActiveEodhdToken(organizationId: string): Promise<string | null> {
  const row = await connectionRow(organizationId);
  if (!row?.enabled || !row.credential_ciphertext) return null;
  return decryptSecret({
    ciphertext: row.credential_ciphertext,
    iv: row.credential_iv,
    authTag: row.credential_auth_tag,
  });
}

async function getConfiguredEodhdToken(organizationId: string): Promise<string | null> {
  const row = await connectionRow(organizationId);
  if (!row?.credential_ciphertext) return null;
  return decryptSecret({
    ciphertext: row.credential_ciphertext,
    iv: row.credential_iv,
    authTag: row.credential_auth_tag,
  });
}

export async function registerExternalDataRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/external-data-connections", async (request) => {
    const admin = requireAdmin(request);
    return { connections: [publicConnection(await connectionRow(admin.organizationId))] };
  });

  app.put("/api/admin/external-data-connections/eodhd", async (request, reply) => {
    const admin = requireAdmin(request);
    const input = saveConnectionSchema.parse(request.body);
    const existing = await connectionRow(admin.organizationId);
    if (!input.apiToken && !existing?.credential_ciphertext) {
      return reply.code(400).send({ error: "api_token_required" });
    }
    const encrypted = input.apiToken ? encryptSecret(input.apiToken) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO external_data_connections
          (organization_id, provider_code, display_name, enabled, credential_ciphertext, credential_iv,
           credential_auth_tag, token_last_four, created_by, updated_by)
         VALUES ($1, 'eodhd', 'EODHD', $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (organization_id, provider_code) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           credential_ciphertext = COALESCE(EXCLUDED.credential_ciphertext, external_data_connections.credential_ciphertext),
           credential_iv = COALESCE(EXCLUDED.credential_iv, external_data_connections.credential_iv),
           credential_auth_tag = COALESCE(EXCLUDED.credential_auth_tag, external_data_connections.credential_auth_tag),
           token_last_four = COALESCE(EXCLUDED.token_last_four, external_data_connections.token_last_four),
           last_test_status = CASE WHEN EXCLUDED.credential_ciphertext IS NOT NULL THEN NULL ELSE external_data_connections.last_test_status END,
           last_test_message = CASE WHEN EXCLUDED.credential_ciphertext IS NOT NULL THEN NULL ELSE external_data_connections.last_test_message END,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
        [admin.organizationId, input.enabled, encrypted?.ciphertext ?? null, encrypted?.iv ?? null,
          encrypted?.authTag ?? null, input.apiToken?.slice(-4) ?? null, admin.id],
      );
      await writeAudit(client, {
        organizationId: admin.organizationId, actorUserId: admin.id, action: "external_data.connection.save",
        entityType: "external_data_connection", entityId: result.rows[0].id, outcome: "allowed",
        requestId: request.id, ipAddress: request.ip,
        detail: { provider: providerCode, enabled: input.enabled, credentialReplaced: Boolean(input.apiToken) },
      });
      await client.query("COMMIT");
      return { connection: publicConnection(result.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.post("/api/admin/external-data-connections/eodhd/test", async (request, reply) => {
    const admin = requireAdmin(request);
    const token = await getConfiguredEodhdToken(admin.organizationId);
    if (!token) return reply.code(409).send({ error: "eodhd_not_configured" });
    const to = new Date();
    const from = new Date(to.getTime() - 21 * 86_400_000);
    let status: "succeeded" | "failed" = "succeeded";
    let message = "EODHD connection succeeded and adjusted prices were returned.";
    try {
      const result = await fetchEodhdPrices(token, "AAPL.US", {
        from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), period: "d",
      });
      message = `Connection succeeded; ${result.points.length} adjusted-price observations were returned for AAPL.US.`;
    } catch (error) {
      status = "failed";
      message = error instanceof Error ? error.message : String(error);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE external_data_connections SET last_tested_at = now(), last_test_status = $3,
           last_test_message = $4, updated_by = $2, updated_at = now()
         WHERE organization_id = $1 AND provider_code = 'eodhd' RETURNING *`,
        [admin.organizationId, admin.id, status, message.slice(0, 500)],
      );
      await writeAudit(client, {
        organizationId: admin.organizationId, actorUserId: admin.id, action: "external_data.connection.test",
        entityType: "external_data_connection", entityId: result.rows[0].id,
        outcome: status === "succeeded" ? "allowed" : "failed", requestId: request.id, ipAddress: request.ip,
        detail: { provider: providerCode, status },
      });
      await client.query("COMMIT");
      return reply.code(status === "succeeded" ? 200 : 502).send({ connection: publicConnection(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.delete("/api/admin/external-data-connections/eodhd/credential", async (request) => {
    const admin = requireAdmin(request);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE external_data_connections SET enabled = false, credential_ciphertext = NULL, credential_iv = NULL,
           credential_auth_tag = NULL, token_last_four = NULL, last_tested_at = NULL,
           last_test_status = NULL, last_test_message = NULL, updated_by = $2, updated_at = now()
         WHERE organization_id = $1 AND provider_code = 'eodhd' RETURNING *`,
        [admin.organizationId, admin.id],
      );
      if (result.rows[0]) {
        await writeAudit(client, {
          organizationId: admin.organizationId, actorUserId: admin.id, action: "external_data.connection.clear",
          entityType: "external_data_connection", entityId: result.rows[0].id, outcome: "allowed",
          requestId: request.id, ipAddress: request.ip, detail: { provider: providerCode },
        });
      }
      await client.query("COMMIT");
      return { connection: publicConnection(result.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });
}
