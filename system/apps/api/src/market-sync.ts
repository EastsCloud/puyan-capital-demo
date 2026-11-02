import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {pool} from './db.js';
import {requirePasswordChanged} from './auth.js';
import {archiveError,json} from './archives.js';
import {writeAudit} from './audit.js';
import {getActiveEodhdToken} from './eodhd.js';
import {safeHistoryReason} from './market-history.js';
import {directoryRows,priceRows,fetchMarketRows,previousBusinessDate,supportedMarkets,type SyncMarket} from './market-sync-provider.js';
import {refreshOrganizationValuations} from './automatic-valuation.js';
const settingsSchema=z.object({markets:z.array(z.enum(supportedMarkets)).min(1).max(5).refine(items=>new Set(items).size===items.length),autoEnabled:z.boolean(),syncHourUtc:z.number().int().min(0).max(23)});
function admin(request:FastifyRequest){const user=requirePasswordChanged(request);if(user.role!=='system_admin')throw archiveError('Forbidden',403);return user;}
const defaults={markets:[...supportedMarkets],auto_enabled:false,sync_hour_utc:8};
async function queue(organizationId:string,requestedBy:string|null,operation:'directory'|'prices',date:string,markets:SyncMarket[]) {
 return (await pool.query(`INSERT INTO market_data_jobs(organization_id,requested_by,operation,business_date,markets) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(organization_id,operation) WHERE status IN ('queued','running') DO NOTHING RETURNING *`,[organizationId,requestedBy,operation,date,JSON.stringify(markets)])).rows[0];
}
async function runJob(job:any,signal:AbortSignal) {
 let token:string|null=null;const progress:any[]=[];
 try {
  token=await getActiveEodhdToken(job.organization_id);if(!token)throw new Error('EODHD connection is not enabled; configure credentials before synchronizing.');
  const date=String(job.business_date instanceof Date?job.business_date.toISOString().slice(0,10):job.business_date).slice(0,10);
  for(const market of json<SyncMarket[]>(job.markets)) {
   signal.throwIfAborted();try {
    const response=await fetchMarketRows(token,market,job.operation,date,signal);
    const rows=job.operation==='directory'?directoryRows(response.rows,market):priceRows(response.rows,market,date);
    if(!rows.length)throw new Error('No usable records for the requested market/date');
    const db=await pool.connect();try {await db.query('BEGIN');
     for(let offset=0;offset<rows.length;offset+=400){signal.throwIfAborted();const batch=rows.slice(offset,offset+400);const values:unknown[]=[];
      if(job.operation==='directory'){
       const placeholders=batch.map((raw,index)=>{const row=raw as ReturnType<typeof directoryRows>[number];const base=index*10;values.push(job.organization_id,market,row.ticker,row.name,row.currency,row.instrumentType,row.listingExchange,row.isin,response.sourceUrl,job.id);return `(${Array.from({length:10},(_,n)=>'$'+(base+n+1)).join(',')})`;});
       await db.query(`INSERT INTO market_security_directory(organization_id,provider_exchange,ticker,name,currency,instrument_type,listing_exchange,isin,source_url,job_id) VALUES ${placeholders.join(',')} ON CONFLICT(organization_id,provider_exchange,ticker) DO UPDATE SET name=EXCLUDED.name,currency=EXCLUDED.currency,instrument_type=EXCLUDED.instrument_type,listing_exchange=EXCLUDED.listing_exchange,isin=EXCLUDED.isin,source_url=EXCLUDED.source_url,job_id=EXCLUDED.job_id,updated_at=now()`,values);
      }else{
       const placeholders=batch.map((raw,index)=>{const row=raw as ReturnType<typeof priceRows>[number];const base=index*8;values.push(job.organization_id,market,row.ticker,row.date,row.close,row.adjustedClose,response.sourceUrl,job.id);return `(${Array.from({length:8},(_,n)=>'$'+(base+n+1)).join(',')})`;});
       await db.query(`INSERT INTO market_daily_prices(organization_id,provider_exchange,ticker,business_date,close,adjusted_close,source_url,job_id) VALUES ${placeholders.join(',')} ON CONFLICT(organization_id,provider_exchange,ticker,business_date) DO UPDATE SET close=EXCLUDED.close,adjusted_close=EXCLUDED.adjusted_close,source_url=EXCLUDED.source_url,job_id=EXCLUDED.job_id,retrieved_at=now()`,values);
      }
     }
     if(job.operation==='directory')await db.query('DELETE FROM market_security_directory WHERE organization_id=$1 AND provider_exchange=$2 AND job_id<>$3',[job.organization_id,market,job.id]);
     await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    progress.push({market,status:'succeeded',rows:rows.length,rejected:response.rows.length-rows.length});
   }catch(error){progress.push({market,status:'failed',reason:safeHistoryReason(error,token)});}
   await pool.query("UPDATE market_data_jobs SET progress=$2 WHERE id=$1 AND status='running'",[job.id,JSON.stringify(progress)]);
  }
  if(job.operation==='prices'&&progress.some(item=>item.status==='succeeded'))try{await refreshOrganizationValuations(job.organization_id,date,signal);}catch(error){progress.push({stage:'valuation',status:'failed',reason:safeHistoryReason(error,token)});}
  const successes=progress.filter(item=>item.status==='succeeded').length;
  const status=successes===progress.length?'succeeded':successes?'partial':'failed';
  await pool.query("UPDATE market_data_jobs SET status=$2,progress=$3,completed_at=now() WHERE id=$1 AND status='running'",[job.id,status,JSON.stringify(progress)]);
  await writeAudit(pool,{organizationId:job.organization_id,actorUserId:job.requested_by,action:`market_data.${job.operation}`,entityType:'market_data_job',entityId:job.id,outcome:status==='succeeded'?'allowed':'failed',detail:{date,progress,status}});
 }catch(error){await pool.query("UPDATE market_data_jobs SET status='failed',error_message=$2,completed_at=now() WHERE id=$1 AND status IN ('queued','running')",[job.id,safeHistoryReason(error,token)]);}
}
export async function registerMarketSyncRoutes(app:FastifyInstance) {
 const pending=new Map<string,{controller:AbortController;promise:Promise<void>}>();let ticking=false,closed=false;
 const tick=async()=>{if(ticking||closed)return;ticking=true;try{
  await pool.query("UPDATE market_data_jobs SET status='failed',error_message='Synchronization interrupted or timed out; retry.',completed_at=now() WHERE status IN ('queued','running') AND deadline_at<=now()");
  const now=new Date();const settings=(await pool.query('SELECT * FROM market_data_settings WHERE auto_enabled=true AND sync_hour_utc<=$1',[now.getUTCHours()])).rows;
  for(const setting of settings)for(const operation of ['directory','prices'] as const){const already=(await pool.query('SELECT id FROM market_data_jobs WHERE organization_id=$1 AND operation=$2 AND created_at>=CURRENT_DATE LIMIT 1',[setting.organization_id,operation])).rows[0];if(!already)await queue(setting.organization_id,setting.updated_by,operation,previousBusinessDate(now),json(setting.markets));}
  for(let slot=pending.size;slot<2;slot++){
   const job=(await pool.query("UPDATE market_data_jobs SET status='running' WHERE id=(SELECT id FROM market_data_jobs WHERE status='queued' AND deadline_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) AND status='queued' RETURNING *")).rows[0];
   if(!job)break;const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),180000);
   const promise=runJob(job,controller.signal).finally(()=>{clearTimeout(deadline);pending.delete(job.id);if(!closed)setImmediate(()=>void tick().catch(error=>app.log.error(error,'market sync worker')));});pending.set(job.id,{controller,promise});
  }
 }finally{ticking=false;}};
 const timer=setInterval(()=>void tick().catch(error=>app.log.error(error,'market sync scheduler')),60000);timer.unref();
 app.addHook('onReady',async()=>{void tick().catch(error=>app.log.error(error,'market sync startup'));});
 app.addHook('onClose',async()=>{closed=true;clearInterval(timer);for(const item of pending.values())item.controller.abort();await Promise.allSettled([...pending.values()].map(item=>item.promise));});
 app.get('/api/admin/market-data',async request=>{const user=admin(request);const settings=(await pool.query('SELECT * FROM market_data_settings WHERE organization_id=$1',[user.organizationId])).rows[0]??defaults;
  return {settings,jobs:(await pool.query('SELECT * FROM market_data_jobs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 12',[user.organizationId])).rows,counts:(await pool.query('SELECT provider_exchange,count(*)::int AS count FROM market_security_directory WHERE organization_id=$1 GROUP BY provider_exchange',[user.organizationId])).rows};});
 app.post('/api/admin/market-data/settings',async request=>{const user=admin(request);const input=settingsSchema.parse(request.body);
  const settings=(await pool.query(`INSERT INTO market_data_settings(organization_id,markets,auto_enabled,sync_hour_utc,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id) DO UPDATE SET markets=EXCLUDED.markets,auto_enabled=EXCLUDED.auto_enabled,sync_hour_utc=EXCLUDED.sync_hour_utc,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,[user.organizationId,JSON.stringify(input.markets),input.autoEnabled,input.syncHourUtc,user.id])).rows[0];
  await writeAudit(pool,{organizationId:user.organizationId,actorUserId:user.id,action:'market_data.settings',entityType:'organization',entityId:user.organizationId,outcome:'allowed',detail:input});return {settings};});
 app.post('/api/admin/market-data/sync',async(request,reply)=>{const user=admin(request);const input=z.object({operation:z.enum(['directory','prices']),businessDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).parse(request.body);
  if(!await getActiveEodhdToken(user.organizationId))throw archiveError('请先启用EODHD连接。 / Enable EODHD connection first.',422);
  const date=input.businessDate??previousBusinessDate();if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>=new Date().toISOString().slice(0,10))throw archiveError('请选择今天之前有效的行情日期。',422);
  const settings=(await pool.query('SELECT * FROM market_data_settings WHERE organization_id=$1',[user.organizationId])).rows[0]??defaults;
  const job=await queue(user.organizationId,user.id,input.operation,date,json(settings.markets));if(!job)throw archiveError('同类同步正在排队或运行，请稍后查看。');
  setImmediate(()=>void tick().catch(error=>app.log.error(error,'market sync start')));return reply.code(202).send({job});});
 app.get('/api/market-directory',async request=>{const user=requirePasswordChanged(request);const input=z.object({q:z.string().trim().max(100).default(''),market:z.enum(supportedMarkets).optional(),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(request.query);
  const rows=await pool.query(`SELECT * FROM market_security_directory WHERE organization_id=$1 AND ($2::text IS NULL OR provider_exchange=$2) AND (ticker ILIKE $3 OR name ILIKE $3) ORDER BY provider_exchange,ticker LIMIT 101 OFFSET $4`,[user.organizationId,input.market??null,`%${input.q}%`,input.offset]);return {securities:rows.rows.slice(0,100),hasMore:rows.rows.length>100,offset:input.offset};});
}
