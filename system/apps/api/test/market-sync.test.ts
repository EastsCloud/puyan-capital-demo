import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import Fastify from 'fastify';import {ZodError} from 'zod';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,token:'test-market-token',invalid:false,partial:false,calls:[] as string[]}));
vi.mock('../src/db.js',()=>{const query=async(sql:string,values?:unknown[])=>{const result=values===undefined?(await state.db.exec(sql)).at(-1)??{}:await state.db.query(sql,values);return {rows:result.rows??[],rowCount:result.affectedRows??result.rows?.length??0};};return {pool:{query,connect:async()=>({query,release(){}})}};});
vi.mock('../src/auth.js',()=>({requirePasswordChanged:(request:any)=>request.currentUser}));
vi.mock('../src/eodhd.js',async()=>({...await import('../src/eodhd-client.js'),getActiveEodhdToken:async()=>state.token||null}));
import {registerMarketSyncRoutes} from '../src/market-sync.js';
import {registerAutomaticValuationRoutes,calculateAutomaticValues,yahooDailyClose} from '../src/automatic-valuation.js';
import {previousBusinessDate,normalizedTicker,priceRows} from '../src/market-sync-provider.js';
const app=Fastify();let org:string,other:string,user:string,workflow:string,archive:string,quantitySnapshot:string;
const date='2026-10-30';
beforeAll(async()=>{
 state.db=new PGlite({extensions:{pgcrypto}});const directory=new URL('../../../db/migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(file=>file.endsWith('.sql')).sort())await state.db.exec(await readFile(new URL(file,directory),'utf8'));
 org=(await state.db.query("INSERT INTO organizations(name) VALUES('Market tests') RETURNING id")).rows[0].id;
 other=(await state.db.query("INSERT INTO organizations(name) VALUES('Other market tests') RETURNING id")).rows[0].id;
 user=(await state.db.query("INSERT INTO users(organization_id,username,display_name,role,password_hash,must_change_password) VALUES($1,'market-admin','Test','system_admin','not-a-credential',false) RETURNING id",[org])).rows[0].id;
 const portfolio=(await state.db.query("INSERT INTO portfolios(organization_id,code,name,initial_principal) VALUES($1,'AUTO','Test',10000) RETURNING id",[org])).rows[0].id;
 workflow=(await state.db.query("INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES($1,$2,'annual_cycle',2026,'active','monitoring',$3) RETURNING id",[org,portfolio,user])).rows[0].id;
 archive=(await state.db.query("INSERT INTO investment_archives(organization_id,portfolio_id,workflow_case_id,name,kind,business_year,created_by) VALUES($1,$2,$3,'Test','annual',2026,$4) RETURNING id",[org,portfolio,workflow,user])).rows[0].id;
 await state.db.query('INSERT INTO archive_selection(organization_id,archive_id,selected_by) VALUES($1,$2,$3)',[org,archive,user]);
 const source=(await state.db.query("INSERT INTO source_files(organization_id,source_type,original_filename,object_key,content_type,byte_size,sha256,business_date,imported_by,retain_until) VALUES($1,'test','test.csv','test-only','text/csv',1,$2,'2026-10-29',$3,'2031-10-29') RETURNING id",[org,'a'.repeat(64),user])).rows[0].id;
 quantitySnapshot=(await state.db.query("INSERT INTO position_snapshots(portfolio_id,business_date,source_file_id,adapter_name,adapter_version,status,imported_by) VALUES($1,'2026-10-29',$2,'test','1','effective',$3) RETURNING id",[portfolio,source,user])).rows[0].id;
 for(const [ticker,exchange,quantity,classification] of [['AAPL','NASDAQ',10,{sleeve:'us',style:'growth',market:'US'}],['0005','HKEX',100,{sleeve:'emerging',style:'value',market:'HK'}]])await state.db.query('INSERT INTO position_snapshot_lines(position_snapshot_id,ticker,exchange_code,quantity,market_price,market_value,currency,classification) VALUES($1,$2,$3,$4,1,$4,\'USD\',$5)',[quantitySnapshot,ticker,exchange,quantity,JSON.stringify(classification)]);
 vi.stubGlobal('fetch',vi.fn(async(url:URL|string)=>{
  const parsed=new URL(String(url));state.calls.push(parsed.pathname);
  if(parsed.pathname.includes('/chart/'))return Response.json({chart:{result:[{meta:{exchangeTimezoneName:'UTC'},timestamp:[Date.parse(date+'T16:00:00Z')/1000],indicators:{quote:[{close:[.128]}],adjclose:[{adjclose:[999]}]}}]}});
  if(state.partial&&parsed.pathname.endsWith('/TSE'))return new Response('not covered',{status:403});
  const hk=parsed.pathname.endsWith('/HK');
  if(parsed.pathname.includes('exchange-symbol-list'))return Response.json([{Code:hk?'5':'AAPL',Name:hk?'HSBC':'Apple',Currency:hk?'HKD':'USD',Type:'Common Stock',Exchange:hk?'HK':'NASDAQ'}]);
  return Response.json([{code:hk?'5':'AAPL',date,close:state.invalid?0:hk?80:10,adjusted_close:hk?20:5}]);
 }));
 app.decorateRequest('currentUser',null);app.addHook('onRequest',async request=>{request.currentUser={id:user,organizationId:request.headers['x-org']??org,role:request.headers['x-role']??'system_admin',locale:'zh-CN',mustChangePassword:false} as any;});
 app.setErrorHandler((error,_req,reply)=>reply.code(error instanceof ZodError?400:(error as any).statusCode??500).send({error:(error as Error).message}));
 await registerMarketSyncRoutes(app);await registerAutomaticValuationRoutes(app);await app.ready();
},30000);
afterAll(async()=>{await app.close();await state.db.close();vi.unstubAllGlobals();});
async function waitForJob(id:string){for(let i=0;i<200;i++){const row=(await state.db.query('SELECT * FROM market_data_jobs WHERE id=$1',[id])).rows[0];if(!['queued','running'].includes(row.status))return row;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Sync test timeout');}
async function settings(markets=['US','HK']){const result=await app.inject({method:'POST',url:'/api/admin/market-data/settings',payload:{markets,autoEnabled:false,syncHourUtc:8}});expect(result.statusCode,result.body).toBe(200);}
async function sync(operation:string){const result=await app.inject({method:'POST',url:'/api/admin/market-data/sync',payload:{operation,businessDate:date}});expect(result.statusCode,result.body).toBe(202);return waitForJob(result.json().job.id);}
describe('bulk market synchronization and quantity-based valuation',()=>{
 it('requires administrator permission, valid dates and a configured provider',async()=>{
  expect((await app.inject({method:'POST',url:'/api/admin/market-data/sync',headers:{'x-role':'execution_team'},payload:{operation:'directory'}})).statusCode).toBe(403);
  state.token='';expect((await app.inject({method:'POST',url:'/api/admin/market-data/sync',payload:{operation:'directory'}})).statusCode).toBe(422);state.token='test-market-token';
  expect((await app.inject({method:'POST',url:'/api/admin/market-data/sync',payload:{operation:'prices',businessDate:'2026-02-30'}})).statusCode).toBe(422);
 });
 it('automatically imports market directories with exact identities, pagination and organization isolation',async()=>{
  await settings();expect((await sync('directory')).status).toBe('succeeded');
  const result=await app.inject({method:'GET',url:'/api/market-directory?q=0005'});expect(result.json().securities[0]).toMatchObject({ticker:'0005',provider_exchange:'HK',name:'HSBC'});
  expect((await app.inject({method:'GET',url:'/api/market-directory',headers:{'x-org':other}})).json().securities).toHaveLength(0);
  expect((await state.db.query('SELECT count(*)::int AS count FROM ticker_universe')).rows[0].count).toBe(24);
 });
 it('bulk-loads unadjusted closes and creates a frozen USD preview without booking values or changing quantities',async()=>{
  expect((await sync('prices')).status).toBe('succeeded');
  const valuation=(await app.inject({method:'GET',url:`/api/workflows/${workflow}/automatic-valuation`})).json().valuation;
  expect(valuation.status).toBe('ready');expect(Number(valuation.total_value)).toBeCloseTo(1124);
  expect(valuation.evidence.lines.find((line:any)=>line.ticker==='AAPL').localPrice).toBe(10);
  expect(valuation.evidence.lines.find((line:any)=>line.ticker==='0005')).toMatchObject({localPrice:80,fx:.128,baseValue:1024});
  expect((await state.db.query('SELECT * FROM equity_value_observations')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT * FROM position_snapshots')).rows).toHaveLength(1);
 });
 it('reports partial entitlement failures and retains successful prior data when new prices are invalid',async()=>{
  await settings(['US','TSE']);state.partial=true;const partial=await sync('directory');expect(partial.status).toBe('partial');expect(partial.progress.some((item:any)=>item.market==='TSE'&&item.status==='failed')).toBe(true);state.partial=false;
  await settings(['US']);state.invalid=true;expect((await sync('prices')).status).toBe('failed');state.invalid=false;
  expect(Number((await state.db.query("SELECT close FROM market_daily_prices WHERE ticker='AAPL'")).rows[0].close)).toBe(10);
 });
 it('requires explicit unchanged-quantity acknowledgement, current archive and execution role before applying',async()=>{
  const row=(await state.db.query('SELECT * FROM automatic_equity_valuations')).rows[0];const body={valuationId:row.id,valuationRevision:row.revision,quantitySnapshotId:quantitySnapshot,unchangedQuantitiesAcknowledged:true};const url=`/api/workflows/${workflow}/automatic-valuation/apply`;
  expect((await app.inject({method:'POST',url,payload:body})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url,headers:{'x-role':'execution_team','x-archive-id':archive},payload:{...body,unchangedQuantitiesAcknowledged:false}})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url,headers:{'x-role':'execution_team','x-archive-id':'stale'},payload:body})).statusCode).toBe(409);
  expect((await app.inject({method:'POST',url,headers:{'x-role':'execution_team','x-archive-id':archive},payload:{...body,valuationRevision:row.revision+1}})).statusCode).toBe(409);
  const applied=await app.inject({method:'POST',url,headers:{'x-role':'execution_team','x-archive-id':archive},payload:body});expect(applied.statusCode,applied.body).toBe(200);
  expect(Number((await state.db.query('SELECT market_value FROM equity_value_observations')).rows[0].market_value)).toBe(1124);
  expect((await state.db.query('SELECT quantity FROM position_snapshot_lines WHERE position_snapshot_id=$1 ORDER BY ticker',[applied.json().positionSnapshotId])).rows.map((line:any)=>Number(line.quantity))).toEqual([100,10]);
  expect((await app.inject({method:'POST',url,headers:{'x-role':'execution_team','x-archive-id':archive},payload:body})).statusCode).toBe(409);
  expect((await state.db.query('SELECT * FROM equity_value_observations')).rows).toHaveLength(1);
 });
 it('blocks an incomplete price preview from booking any official valuation',async()=>{
  const refreshed=await app.inject({method:'POST',url:`/api/workflows/${workflow}/automatic-valuation/refresh`,headers:{'x-role':'execution_team'},payload:{businessDate:'2026-10-29'}});
  expect(refreshed.statusCode,refreshed.body).toBe(200);const row=refreshed.json().valuation;
  expect(row.status).toBe('incomplete');expect(row.total_value).toBe(null);expect(row.evidence.issues).toHaveLength(2);
  const result=await app.inject({method:'POST',url:`/api/workflows/${workflow}/automatic-valuation/apply`,headers:{'x-role':'execution_team','x-archive-id':archive},payload:{valuationId:row.id,valuationRevision:row.revision,quantitySnapshotId:row.quantity_snapshot_id,unchangedQuantitiesAcknowledged:true}});
  expect(result.statusCode).toBe(409);expect((await state.db.query('SELECT * FROM equity_value_observations')).rows).toHaveLength(1);
 });
 it('rejects a preview whose source quantities were superseded by a later actual snapshot',async()=>{
  const row=(await state.db.query("UPDATE automatic_equity_valuations SET status='ready' WHERE business_date='2026-10-29' RETURNING *")).rows[0];
  const result=await app.inject({method:'POST',url:`/api/workflows/${workflow}/automatic-valuation/apply`,headers:{'x-role':'execution_team','x-archive-id':archive},payload:{valuationId:row.id,valuationRevision:row.revision,quantitySnapshotId:row.quantity_snapshot_id,unchangedQuantitiesAcknowledged:true}});
  expect(result.statusCode).toBe(409);expect(result.json().error).toContain('数量已更新');
 });
 it('normalizes dates/symbols and never accepts wrong-date prices, adjusted prices as valuation prices, or invalid FX',async()=>{
  expect(previousBusinessDate(new Date('2026-11-02T08:00:00Z'))).toBe('2026-10-30');expect(normalizedTicker('5','HK')).toBe('0005');
  expect(priceRows([{code:'AAPL',date:'2026-10-29',close:10}], 'US',date)).toEqual([]);
  expect(()=>calculateAutomaticValues([{ticker:'TEST',quantity:1,localPrice:10,fx:0}])).toThrow();
  expect((await yahooDailyClose('HKDUSD=X',date)).price).toBe(.128);
  const audit=(await state.db.query('SELECT detail FROM audit_events')).rows;expect(JSON.stringify(audit)).not.toContain(state.token);
 });
});
