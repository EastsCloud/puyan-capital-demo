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
  tradingLotSize:z.number().int().min(1).max(1000000).nullable().optional(),
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
      "SELECT * FROM organization_security_catalog WHERE enabled = true AND catalog_organization_id=$1 ORDER BY sleeve, style, ticker",
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
        `INSERT INTO ticker_universe (ticker, exchange_code, name_en, name_zh, market, sleeve, style, instrument_type, source_name, source_url, organization_id, data_coverage,trading_lot_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'equity', $8, $9, $10, $11,$12) RETURNING *`,
        [ticker, input.exchangeCode, input.nameEn, input.nameZh, market, sleeve, input.style, sourceName, sourceUrl, admin.organizationId, JSON.stringify(dataCoverage),input.tradingLotSize??null],
      );
      await writeAudit(client, { organizationId: admin.organizationId, actorUserId: admin.id, action: "security.register", entityType: "ticker_universe", entityId: result.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { ticker, exchangeCode: input.exchangeCode, market, sleeve, style: input.style, sourceUrl, dataCoverage } });
      await client.query("COMMIT");
      return reply.code(201).send({ security: result.rows[0], validation: identity });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  app.patch('/api/admin/securities/:securityId',async(request)=>{
    const admin=requirePasswordChanged(request);if(admin.role!=='system_admin')throw fail('Forbidden',403);
    const {securityId}=z.object({securityId:z.string().uuid()}).parse(request.params);
    const input=securitySchema.extend({expectedUpdatedAt:z.string().datetime(),reason:z.string().trim().min(5).max(1000)}).parse(request.body);
    const visible=(await pool.query('SELECT id FROM organization_security_catalog WHERE id=$1 AND catalog_organization_id=$2 AND enabled=true',[securityId,admin.organizationId])).rows[0];
    if(!visible)throw fail('Security not found',404);
    const identity=await checkIdentity(input.ticker,input.exchangeCode,admin.organizationId);
    if(identity.coverage.status==='unavailable'||identity.exchangeMatches===false)throw fail('证券价格或上市交易所核验未通过，请核对所选交易所。',422);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[admin.organizationId]);
      const before=(await client.query('SELECT * FROM ticker_universe WHERE id=$1 AND (organization_id IS NULL OR organization_id=$2) FOR UPDATE',[securityId,admin.organizationId])).rows[0];
      if(!before||new Date(before.updated_at).getTime()!==Date.parse(input.expectedUpdatedAt))throw fail('资料已由其他用户更新，请刷新后重试。');
      if((await client.query('SELECT id FROM ticker_universe WHERE organization_id=$1 AND supersedes_id=$2',[admin.organizationId,securityId])).rows[0])throw fail('此条目已有本团队修改版，请刷新。');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`security:${identity.ticker}:${input.exchangeCode}`]);
      const duplicate=(await client.query('SELECT id FROM organization_security_catalog WHERE catalog_organization_id=$1 AND ticker=$2 AND exchange_code=$3 AND id<>$4',[admin.organizationId,identity.ticker,input.exchangeCode,securityId])).rows[0];
      if(duplicate)throw fail('目标代码和交易所已存在，请使用已有证券，不要创建重复条目。');
      const values=[identity.ticker,input.exchangeCode,input.nameEn,input.nameZh,identity.market,identity.sleeve,input.style,input.sourceName||'Verified administrator reference',input.sourceUrl||`https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol(identity.ticker,identity.market))}/`,JSON.stringify({...identity.coverage,checkedAt:new Date().toISOString(),exchangeMatches:identity.exchangeMatches,listingNote:identity.listingNote}),input.tradingLotSize===undefined?before.trading_lot_size:input.tradingLotSize];
      let security;
      if(before.organization_id===null){security=(await client.query(`INSERT INTO ticker_universe(ticker,exchange_code,name_en,name_zh,market,sleeve,style,source_name,source_url,data_coverage,trading_lot_size,organization_id,instrument_type,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[...values,admin.organizationId,before.instrument_type,before.id])).rows[0];}
      else{security=(await client.query(`UPDATE ticker_universe SET ticker=$1,exchange_code=$2,name_en=$3,name_zh=$4,market=$5,sleeve=$6,style=$7,source_name=$8,source_url=$9,data_coverage=$10,trading_lot_size=$11,updated_at=clock_timestamp() WHERE id=$12 RETURNING *`,[...values,securityId])).rows[0];}
      let correction=null;
      // Same ticker and same market only: a venue typo is not a different security/market allocation.
      if(before.ticker===security.ticker&&before.market===security.market&&before.exchange_code!==security.exchange_code){
        const mappings=(await client.query('SELECT old_exchange,new_exchange FROM security_identity_corrections WHERE organization_id=$1 AND old_ticker=$2',[admin.organizationId,before.ticker])).rows;
        let venue=security.exchange_code;const seen=new Set<string>();while(!seen.has(venue)){if(venue===before.exchange_code)throw fail('更正会形成循环映射，请管理员核对既有更正记录。');seen.add(venue);const map=mappings.find(m=>m.old_exchange===venue);if(!map)break;venue=map.new_exchange;}
        correction=(await client.query('INSERT INTO security_identity_corrections(organization_id,old_ticker,old_exchange,new_ticker,new_exchange,market,reason,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[admin.organizationId,before.ticker,before.exchange_code,security.ticker,security.exchange_code,security.market,input.reason,admin.id])).rows[0];
      }
      await writeAudit(client,{organizationId:admin.organizationId,actorUserId:admin.id,action:'security.update',entityType:'ticker_universe',entityId:security.id,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{reason:input.reason,before,after:security,identityCorrection:correction,approvedSnapshotsChanged:false}});
      await client.query('COMMIT');return {security,validation:identity,identityCorrection:correction,historicalSnapshotsChanged:false};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
}
