import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";
import { collectHistoricalSeries, fetchYahooSeries, safeHistoryReason } from "./market-history.js";
import { normalizeSecurityIdentity, listingExchangeMatches } from "./security-identity.js";
import { eodhdSymbol, getActiveEodhdToken } from "./eodhd.js";
import { yahooSymbol } from "./market-history.js";
import { writeAudit } from "./audit.js";

const securitySchema = z.object({
  ticker: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/).transform((value) => value.toUpperCase()),
  exchangeCode: z.enum(["NASDAQ", "NYSE", "AMEX", "TSE", "HKEX", "SSE", "SZSE"]),
  nameEn: z.string().trim().min(1).max(200), nameZh: z.string().trim().min(1).max(200),
  style: z.enum(["growth", "value"]), sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z.union([z.literal(""), z.string().url().max(1000).refine((value) => /^https?:\/\//.test(value))]).optional(),
});
function fail(message: string, statusCode = 409) { return Object.assign(new Error(message), { statusCode }); }

async function checkIdentity(rawTicker: string, exchangeCode: string, organizationId: string) {
  let normalized: ReturnType<typeof normalizeSecurityIdentity>;
  try { normalized = normalizeSecurityIdentity(rawTicker, exchangeCode); } catch (error) { throw fail((error as Error).message, 400); }
  const token = await getActiveEodhdToken(organizationId);
  const symbol = yahooSymbol(normalized.ticker, normalized.market);
  const collection = await collectHistoricalSeries([{ symbol, eodhdSymbol: eodhdSymbol(normalized.ticker, normalized.market), market: normalized.market }], token);
  let listingExchange = collection.series.find(item => item.sourceName === "Yahoo Finance chart")?.exchange ?? "";
  let listingNote: string | null = null;
  if (!listingExchange && collection.series.length) {
    try { listingExchange = (await fetchYahooSeries(symbol, { allowShort: true })).exchange; }
    catch (error) { listingNote = safeHistoryReason(error, token); }
  }
  const exchangeMatches = listingExchangeMatches(exchangeCode, listingExchange);
  if (exchangeMatches === null && !listingNote) listingNote = "Exact listing venue could not be independently verified; administrator must confirm it.";
  return { ...normalized, exchangeCode, coverage: collection.coverage[0], exchangeMatches, listingExchange, listingNote };
}

export async function registerSecurityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/securities", async (request) => {
    const user = requirePasswordChanged(request);
    const result = await pool.query(
      "SELECT * FROM ticker_universe WHERE enabled = true AND (organization_id IS NULL OR organization_id = $1) ORDER BY sleeve, style, ticker",
      [user.organizationId],
    );
    return { securities: result.rows };
  });
  app.post("/api/admin/securities/check", async (request) => {
    const admin = requirePasswordChanged(request);
    if (admin.role !== "system_admin") throw fail("Forbidden", 403);
    const input = securitySchema.pick({ ticker: true, exchangeCode: true }).parse(request.body);
    return { validation: await checkIdentity(input.ticker, input.exchangeCode, admin.organizationId) };
  });
  app.post("/api/admin/securities", async (request, reply) => {
    const admin = requirePasswordChanged(request);
    if (admin.role !== "system_admin") throw fail("Forbidden", 403);
    const input = securitySchema.parse(request.body);
    const zh = admin.locale === "zh-CN";
    const identity = await checkIdentity(input.ticker, input.exchangeCode, admin.organizationId);
    if (identity.coverage.status === "unavailable" || identity.exchangeMatches === false) return reply.code(422).send({ error: "security_data_unavailable", message: identity.exchangeMatches === false ? (zh ? "实际上市交易所与所选交易所不一致，请核对。" : "The listing exchange does not match the selected exchange.") : (zh ? "未取得该证券的真实价格，请核对代码、市场和数据连接。" : "No real prices returned. Check ticker, market and connection."), validation: identity });
    const { ticker, market, sleeve } = identity;
    const sourceName = input.sourceName || "Yahoo Finance reference (auto-generated)";
    const sourceUrl = input.sourceUrl || `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol(ticker, market))}/`;
    const dataCoverage = { ...identity.coverage, checkedAt: new Date().toISOString(), exchangeMatches: identity.exchangeMatches, listingNote: identity.listingNote };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize same-identity additions so duplicate shared/organization records cannot appear.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`security:${ticker}:${input.exchangeCode}`]);
      const duplicate = await client.query("SELECT id FROM ticker_universe WHERE ticker = $1 AND exchange_code = $2 AND (organization_id IS NULL OR organization_id = $3)", [ticker, input.exchangeCode, admin.organizationId]);
      if (duplicate.rows.length) throw fail(zh ? "该股票已在股票库中，无需重复添加。" : "This security is already registered.");
      const result = await client.query(
        `INSERT INTO ticker_universe (ticker, exchange_code, name_en, name_zh, market, sleeve, style, instrument_type, source_name, source_url, organization_id, data_coverage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'equity', $8, $9, $10, $11) RETURNING *`,
        [ticker, input.exchangeCode, input.nameEn, input.nameZh, market, sleeve, input.style, sourceName, sourceUrl, admin.organizationId, JSON.stringify(dataCoverage)],
      );
      await writeAudit(client, { organizationId: admin.organizationId, actorUserId: admin.id, action: "security.register", entityType: "ticker_universe", entityId: result.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { ticker, exchangeCode: input.exchangeCode, market, sleeve, style: input.style, sourceUrl, dataCoverage } });
      await client.query("COMMIT");
      return reply.code(201).send({ security: result.rows[0], validation: identity });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
