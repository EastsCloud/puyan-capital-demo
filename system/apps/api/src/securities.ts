import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";
import { writeAudit } from "./audit.js";

const securitySchema = z.object({
  ticker: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/).transform((value) => value.toUpperCase()),
  exchangeCode: z.enum(["NASDAQ", "NYSE", "AMEX", "TSE", "HKEX", "SSE", "SZSE"]),
  nameEn: z.string().trim().min(1).max(200), nameZh: z.string().trim().min(1).max(200),
  style: z.enum(["growth", "value"]), sourceName: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url().max(1000).refine((value) => /^https?:\/\//.test(value)),
});
function fail(message: string, statusCode = 409) { return Object.assign(new Error(message), { statusCode }); }

export async function registerSecurityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/securities", async (request) => {
    const user = requirePasswordChanged(request);
    const result = await pool.query(
      "SELECT * FROM ticker_universe WHERE enabled = true AND (organization_id IS NULL OR organization_id = $1) ORDER BY sleeve, style, ticker",
      [user.organizationId],
    );
    return { securities: result.rows };
  });
  app.post("/api/admin/securities", async (request, reply) => {
    const admin = requirePasswordChanged(request);
    if (admin.role !== "system_admin") throw fail("Forbidden", 403);
    const input = securitySchema.parse(request.body);
    const zh = admin.locale === "zh-CN";
    const market = input.exchangeCode === "TSE" ? "JP" : input.exchangeCode === "HKEX" ? "HK" : ["SSE", "SZSE"].includes(input.exchangeCode) ? "CN_A" : "US";
    const sleeve = market === "US" ? "us" : market === "JP" ? "developedNonUs" : "emerging";
    const length = market === "HK" ? 4 : market === "JP" ? 4 : market === "CN_A" ? 6 : null;
    if (length !== null && (!/^\d+$/.test(input.ticker) || input.ticker.length > length)) throw fail(zh ? "请填写不含交易所后缀的股票数字代码。" : "Enter the numeric ticker without an exchange suffix.");
    const ticker = length === null ? input.ticker : input.ticker.padStart(length, "0");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize same-identity additions so duplicate shared/organization records cannot appear.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`security:${ticker}:${input.exchangeCode}`]);
      const duplicate = await client.query("SELECT id FROM ticker_universe WHERE ticker = $1 AND exchange_code = $2 AND (organization_id IS NULL OR organization_id = $3)", [ticker, input.exchangeCode, admin.organizationId]);
      if (duplicate.rows.length) throw fail(zh ? "该股票已在股票库中，无需重复添加。" : "This security is already registered.");
      const result = await client.query(
        `INSERT INTO ticker_universe (ticker, exchange_code, name_en, name_zh, market, sleeve, style, instrument_type, source_name, source_url, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'equity', $8, $9, $10) RETURNING *`,
        [ticker, input.exchangeCode, input.nameEn, input.nameZh, market, sleeve, input.style, input.sourceName, input.sourceUrl, admin.organizationId],
      );
      await writeAudit(client, { organizationId: admin.organizationId, actorUserId: admin.id, action: "security.register", entityType: "ticker_universe", entityId: result.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { ticker, exchangeCode: input.exchangeCode, market, sleeve, style: input.style, sourceUrl: input.sourceUrl } });
      await client.query("COMMIT");
      return reply.code(201).send({ security: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
