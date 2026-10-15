import {pool,type DatabaseClient,type DatabasePool} from './db.js';
export async function reconciliationReference(organizationId:string,db:DatabaseClient|DatabasePool=pool) {
  const snapshot=(await db.query(`SELECT
    COALESCE((SELECT json_agg(c) FROM security_identity_corrections c WHERE organization_id=$1),'[]') AS corrections,
    COALESCE((SELECT json_agg(s) FROM (SELECT ticker,exchange_code,trading_lot_size FROM organization_security_catalog WHERE catalog_organization_id=$1 AND enabled=true) s),'[]') AS securities`,[organizationId])).rows[0];
  const corrections=typeof snapshot.corrections==='string'?JSON.parse(snapshot.corrections):snapshot.corrections;
  const securities=typeof snapshot.securities==='string'?JSON.parse(snapshot.securities):snapshot.securities;
  return {corrections:corrections.map((c:any)=>({id:c.id,oldTicker:c.old_ticker,oldExchange:c.old_exchange,ticker:c.new_ticker,exchangeCode:c.new_exchange})),lotSizes:Object.fromEntries(securities.filter((s:any)=>s.trading_lot_size).map((s:any)=>[`${s.ticker}|${s.exchange_code}`,Number(s.trading_lot_size)]))};
}
