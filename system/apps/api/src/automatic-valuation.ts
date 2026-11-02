import type {FastifyInstance} from 'fastify';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {pool} from './db.js';
import {requirePasswordChanged} from './auth.js';
import {archiveError,json} from './archives.js';
import {getActiveEodhdToken,eodhdSymbol} from './eodhd.js';
import {exchangeLocalDate,safeHistoryReason,yahooSymbol} from './market-history.js';
import {writeAudit} from './audit.js';
import {previousBusinessDate} from './market-sync-provider.js';
const venue:Record<string,{market:string;provider:string;currency:string}>={NASDAQ:{market:'US',provider:'US',currency:'USD'},NYSE:{market:'US',provider:'US',currency:'USD'},AMEX:{market:'US',provider:'US',currency:'USD'},TSE:{market:'JP',provider:'TSE',currency:'JPY'},HKEX:{market:'HK',provider:'HK',currency:'HKD'},SSE:{market:'CN_A',provider:'SHG',currency:'CNY'},SZSE:{market:'CN_A',provider:'SHE',currency:'CNY'}};
export function calculateAutomaticValues(lines:Array<{ticker:string;quantity:number;localPrice:number;fx:number}>) {
 if(!lines.length||lines.some(line=>![line.quantity,line.localPrice,line.fx].every(Number.isFinite)||line.quantity<0||line.localPrice<=0||line.fx<=0))throw new Error('Invalid quantity, unadjusted close or FX rate');
 const calculated=lines.map(line=>({...line,basePrice:line.localPrice*line.fx,baseValue:line.quantity*line.localPrice*line.fx}));
 return {lines:calculated,total:calculated.reduce((sum,line)=>sum+line.baseValue,0)};
}
export async function yahooDailyClose(symbol:string,date:string,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
 const url=new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
 url.searchParams.set('period1',String(Date.parse(date)/1000-2*86400));url.searchParams.set('period2',String(Date.parse(date)/1000+2*86400));url.searchParams.set('interval','1d');
 const response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`Yahoo daily ${symbol}: HTTP ${response.status}`);
 const data=(await response.json() as any).chart?.result?.[0];
 const index=data?.timestamp?.findIndex((time:number)=>exchangeLocalDate(time,data.meta?.exchangeTimezoneName??'UTC')===date)??-1;
 const price=data?.indicators?.quote?.[0]?.close?.[index];
 if(index<0||!Number.isFinite(price)||price<=0)throw new Error(`No unadjusted closing price for ${symbol} on ${date}`);
 return {price:Number(price),source:'Yahoo daily unadjusted close',sourceUrl:url.toString(),date};
}
async function rawClose(ticker:string,exchange:string,date:string,org:string,token:string|null,signal?:AbortSignal) {
 const identity=venue[exchange];if(!identity)throw new Error(`Unsupported exchange ${exchange}`);
 const cached=(await pool.query('SELECT close,source_url FROM market_daily_prices WHERE organization_id=$1 AND provider_exchange=$2 AND ticker=$3 AND business_date=$4',[org,identity.provider,ticker,date])).rows[0];
 if(cached)return {price:Number(cached.close),source:'EODHD bulk unadjusted close',sourceUrl:cached.source_url,date};
 if(!token||identity.market==='JP')return yahooDailyClose(yahooSymbol(ticker,identity.market),date,signal);
 const url=new URL(`https://eodhd.com/api/eod/${eodhdSymbol(ticker,identity.market)}`);url.searchParams.set('from',date);url.searchParams.set('to',date);url.searchParams.set('fmt','json');
 const sourceUrl=url.toString();url.searchParams.set('api_token',token);
 const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`EODHD daily ${ticker}: HTTP ${response.status}`);
 const rows=await response.json() as any;const price=Array.isArray(rows)?rows.find(row=>row.date===date)?.close:null;
 if(!Number.isFinite(price)||price<=0)throw new Error(`No unadjusted closing price for ${ticker} on ${date}`);
 return {price:Number(price),source:'EODHD unadjusted close',sourceUrl,date};
}
export async function buildAutomaticValuation(workflowId:string,organizationId:string,date:string,signal?:AbortSignal) {
 const workflow=(await pool.query("SELECT w.*,p.base_currency FROM workflow_cases w JOIN portfolios p ON p.id=w.portfolio_id JOIN investment_archives a ON a.workflow_case_id=w.id WHERE w.id=$1 AND w.organization_id=$2 AND w.status='active' AND w.current_step='monitoring' AND a.deleted_at IS NULL",[workflowId,organizationId])).rows[0];
 if(!workflow)throw archiveError('Active monitoring workflow not found');
 const snapshot=(await pool.query("SELECT * FROM position_snapshots WHERE portfolio_id=$1 AND business_date<=$2 AND status='effective' ORDER BY business_date DESC,imported_at DESC LIMIT 1",[workflow.portfolio_id,date])).rows[0];
 if(!snapshot)throw archiveError('请先导入一次实际持仓数量。 / Import an actual quantity snapshot first.');
 const holdings=(await pool.query('SELECT * FROM position_snapshot_lines WHERE position_snapshot_id=$1 ORDER BY ticker,exchange_code',[snapshot.id])).rows;
 const token=await getActiveEodhdToken(organizationId);const lines:any[]=[],issues:string[]=[];const rates=new Map<string,Awaited<ReturnType<typeof yahooDailyClose>>>();
 for(const holding of holdings){signal?.throwIfAborted();try{
  const identity=venue[holding.exchange_code];if(!identity)throw new Error(`Unsupported exchange ${holding.exchange_code}`);
  const quote=await rawClose(holding.ticker,holding.exchange_code,date,organizationId,token,signal);
  const pair=identity.currency+workflow.base_currency;
  if(identity.currency!==workflow.base_currency&&!rates.has(pair))rates.set(pair,await yahooDailyClose(`${pair}=X`,date,signal));
  const fx=identity.currency===workflow.base_currency?1:rates.get(pair)!.price;
  const calculated=calculateAutomaticValues([{ticker:holding.ticker,quantity:Number(holding.quantity),localPrice:quote.price,fx}]).lines[0];
  lines.push({...calculated,exchangeCode:holding.exchange_code,localCurrency:identity.currency,baseCurrency:workflow.base_currency,quote,fxEvidence:rates.get(pair)??null,classification:json(holding.classification)});
 }catch(error){issues.push(`${holding.ticker}: ${safeHistoryReason(error,token)}`);}}
 if(!holdings.length)issues.push('Quantity snapshot is empty');
 const evidence={quantitySnapshotDate:String(snapshot.business_date).slice(0,10),assumption:'unchanged_quantities_no_trades_or_corporate_actions',lines,issues};
 const ready=issues.length===0;const total=ready?lines.reduce((sum,line)=>sum+line.baseValue,0):null;
 const result=(await pool.query(`INSERT INTO automatic_equity_valuations(organization_id,workflow_case_id,portfolio_id,quantity_snapshot_id,business_date,status,total_value,currency,evidence)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(portfolio_id,business_date) DO UPDATE SET quantity_snapshot_id=EXCLUDED.quantity_snapshot_id,status=EXCLUDED.status,total_value=EXCLUDED.total_value,evidence=EXCLUDED.evidence,revision=automatic_equity_valuations.revision+1,created_at=now() WHERE automatic_equity_valuations.status<>'applied' RETURNING *`,[organizationId,workflowId,workflow.portfolio_id,snapshot.id,date,ready?'ready':'incomplete',total,workflow.base_currency,JSON.stringify(evidence)])).rows[0];
 return result??(await pool.query('SELECT * FROM automatic_equity_valuations WHERE portfolio_id=$1 AND business_date=$2',[workflow.portfolio_id,date])).rows[0];
}
export async function refreshOrganizationValuations(organizationId:string,date:string,signal?:AbortSignal) {
 const workflows=(await pool.query("SELECT w.id FROM workflow_cases w JOIN investment_archives a ON a.workflow_case_id=w.id WHERE w.organization_id=$1 AND w.status='active' AND w.current_step='monitoring' AND a.deleted_at IS NULL AND EXISTS(SELECT 1 FROM position_snapshots s WHERE s.portfolio_id=w.portfolio_id AND s.status='effective' AND s.business_date<=$2)",[organizationId,date])).rows;
 for(const workflow of workflows){signal?.throwIfAborted();await buildAutomaticValuation(workflow.id,organizationId,date,signal);}
}
export async function registerAutomaticValuationRoutes(app:FastifyInstance) {
 app.get('/api/workflows/:workflowId/automatic-valuation',async request=>{const user=requirePasswordChanged(request);const {workflowId}=request.params as {workflowId:string};
  return {valuation:(await pool.query('SELECT v.* FROM automatic_equity_valuations v JOIN workflow_cases w ON w.id=v.workflow_case_id WHERE v.workflow_case_id=$1 AND w.organization_id=$2 ORDER BY v.business_date DESC LIMIT 1',[workflowId,user.organizationId])).rows[0]??null};});
 app.post('/api/workflows/:workflowId/automatic-valuation/refresh',async request=>{const user=requirePasswordChanged(request);if(user.role!=='execution_team')throw archiveError('Forbidden',403);const {workflowId}=request.params as {workflowId:string};const date=z.object({businessDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(request.body).businessDate;
  if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>=new Date().toISOString().slice(0,10))throw archiveError('请选择今天之前的有效收盘日期。',422);
  return {valuation:await buildAutomaticValuation(workflowId,user.organizationId,date,AbortSignal.timeout(90000))};});
 app.post('/api/workflows/:workflowId/automatic-valuation/apply',async request=>{
  const user=requirePasswordChanged(request);if(user.role!=='execution_team')throw archiveError('Forbidden',403);const {workflowId}=request.params as {workflowId:string};
  const input=z.object({valuationId:z.string().uuid(),valuationRevision:z.number().int().positive(),quantitySnapshotId:z.string().uuid(),unchangedQuantitiesAcknowledged:z.literal(true)}).parse(request.body);
  const db=await pool.connect();try{await db.query('BEGIN');
   await db.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[user.organizationId]);
   const selected=(await db.query('SELECT a.id FROM archive_selection s JOIN investment_archives a ON a.id=s.archive_id WHERE s.organization_id=$1 AND a.workflow_case_id=$2 AND a.deleted_at IS NULL',[user.organizationId,workflowId])).rows[0];
   if(!selected||selected.id!==request.headers['x-archive-id'])throw archiveError('当前档案已变化，请刷新后确认。');
   const workflow=(await db.query("SELECT * FROM workflow_cases WHERE id=$1 AND organization_id=$2 AND status='active' AND current_step='monitoring' FOR UPDATE",[workflowId,user.organizationId])).rows[0];if(!workflow)throw archiveError('Monitoring workflow changed');
   const row=(await db.query("SELECT * FROM automatic_equity_valuations WHERE id=$1 AND workflow_case_id=$2 AND organization_id=$3 FOR UPDATE",[input.valuationId,workflowId,user.organizationId])).rows[0];
   if(!row||row.status!=='ready'||row.revision!==input.valuationRevision||row.quantity_snapshot_id!==input.quantitySnapshotId)throw archiveError('估值或数量版本已变化，请重新取价。');
   const latest=(await db.query("SELECT * FROM position_snapshots WHERE portfolio_id=$1 AND status='effective' ORDER BY business_date DESC,imported_at DESC LIMIT 1",[workflow.portfolio_id])).rows[0];
   if(latest?.id!==row.quantity_snapshot_id)throw archiveError('实际持仓数量已更新，请重新生成估值。');
   if((await db.query('SELECT id FROM equity_value_observations WHERE portfolio_id=$1 AND business_date=$2',[workflow.portfolio_id,row.business_date])).rows[0])throw archiveError('该日期已有正式估值，不会自动覆盖。');
   const evidence=json(row.evidence);const content=JSON.stringify(evidence);const sha=createHash('sha256').update(content).digest('hex');
   const source=(await db.query(`INSERT INTO source_files(organization_id,source_type,original_filename,object_key,content_type,byte_size,sha256,business_date,imported_by,retain_until)
    VALUES($1,'automatic_valuation',$2,$3,'application/json',$4,$5,$6,$7,($6::date+interval '5 years')::date) RETURNING id`,[user.organizationId,`automatic-valuation-${String(row.business_date).slice(0,10)}.json`,`database://automatic-valuation/${row.id}`,Buffer.byteLength(content),sha,row.business_date,user.id])).rows[0];
   const snapshot=(await db.query("INSERT INTO position_snapshots(portfolio_id,business_date,source_file_id,adapter_name,adapter_version,status,imported_by) VALUES($1,$2,$3,'automatic-unadjusted-close','1.0','effective',$4) RETURNING id",[workflow.portfolio_id,row.business_date,source.id,user.id])).rows[0];
   for(const line of evidence.lines)await db.query('INSERT INTO position_snapshot_lines(position_snapshot_id,ticker,exchange_code,quantity,market_price,market_value,currency,classification) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[snapshot.id,line.ticker,line.exchangeCode,line.quantity,line.basePrice,line.baseValue,row.currency,JSON.stringify({...line.classification,automaticValuationId:row.id,localPrice:line.localPrice,localCurrency:line.localCurrency,fx:line.fx})]);
   await db.query('INSERT INTO equity_value_observations(portfolio_id,position_snapshot_id,business_date,market_value,currency) VALUES($1,$2,$3,$4,$5)',[workflow.portfolio_id,snapshot.id,row.business_date,row.total_value,row.currency]);
   await db.query("UPDATE automatic_equity_valuations SET status='applied',applied_by=$2,applied_at=now() WHERE id=$1",[row.id,user.id]);
   await writeAudit(db,{organizationId:user.organizationId,actorUserId:user.id,action:'valuation.apply',entityType:'automatic_equity_valuation',entityId:row.id,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{quantitySnapshotId:row.quantity_snapshot_id,unchangedQuantitiesAcknowledged:true,positionSnapshotId:snapshot.id}});
   await db.query('COMMIT');return {positionSnapshotId:snapshot.id};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
}
