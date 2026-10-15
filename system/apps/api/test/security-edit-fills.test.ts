import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import Fastify from 'fastify';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>{process.env.DATABASE_URL='pglite://unused-security-test';process.env.NODE_ENV='test';return {db:null as any,org:'',other:'',users:{} as Record<string,any>};});
vi.mock('../src/db.js',()=>{const query=async(sql:string,values?:unknown[])=>{const r=values===undefined?(await state.db.exec(sql)).at(-1)??{}:await state.db.query(sql,values);return {rows:r.rows??[],rowCount:r.affectedRows??r.rows?.length??0};};return {pool:{query,connect:async()=>({query,release(){}})}};});
vi.mock('../src/auth.js',()=>({requirePasswordChanged:(request:any)=>({...state.users[request.headers['x-user']??'admin'],organizationId:request.headers['x-org']??state.org})}));
vi.mock('../src/eodhd.js',async()=>({...await import('../src/eodhd-client.js'),getActiveEodhdToken:async()=>null}));
vi.mock('../src/market-history.js',async original=>({...await original<typeof import('../src/market-history.js')>(),collectHistoricalSeries:async(requests:any[])=>{const symbol=requests[0].symbol;return {series:[{symbol,sourceName:'Yahoo Finance chart',exchange:symbol==='CRCL'?'NYQ':symbol.endsWith('.T')?'JPX':'NMS'}],coverage:[{symbol,provider:'Synthetic venue fixture',status:'ready',observations:156}]};}}));
import {registerSecurityRoutes} from '../src/securities.js';
import {registerOperationalRoutes} from '../src/operations.js';
const app=Fastify();let cost:any,crcl:any,workflow:string,planId:string,batchId:string;
beforeAll(async()=>{
 state.db=new PGlite({extensions:{pgcrypto}});const dir=new URL('../../../db/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await state.db.exec(await readFile(new URL(file,dir),'utf8'));
 state.org=(await state.db.query("INSERT INTO organizations(name) VALUES ('Edit test') RETURNING id")).rows[0].id;state.other=(await state.db.query("INSERT INTO organizations(name) VALUES ('Other') RETURNING id")).rows[0].id;
 for(const [name,role] of [['admin','system_admin'],['maker','execution_team'],['checker','execution_team']]){const u=(await state.db.query('INSERT INTO users(organization_id,username,display_name,role,password_hash,must_change_password) VALUES ($1,$2,$2,$3,\'test-only\',false) RETURNING id',[state.org,name,role])).rows[0];state.users[name]={id:u.id,role,organizationId:state.org,locale:'zh-CN'};}
 for(const [ticker,venue] of [['COST','NYSE'],['CRCL','NASDAQ']]){const s=(await state.db.query("INSERT INTO ticker_universe(ticker,exchange_code,name_en,name_zh,market,sleeve,style,instrument_type,source_name,source_url,organization_id) VALUES ($1,$2,'Legacy test','测试','US','us','growth','equity','test','https://example.com',$3) RETURNING *",[ticker,venue,state.org])).rows[0];if(ticker==='COST')cost=s;else crcl=s;}
 const p=(await state.db.query("INSERT INTO portfolios(organization_id,code,name) VALUES ($1,'EDIT','Test') RETURNING id",[state.org])).rows[0].id;
 workflow=(await state.db.query("INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES ($1,$2,'annual_cycle',2026,'active','monitoring',$3) RETURNING id",[state.org,p,state.users.admin.id])).rows[0].id;
 planId=(await state.db.query("INSERT INTO maker_checker_actions(workflow_case_id,action_type,submitted_by,reviewed_by,reviewed_at,status,payload) VALUES ($1,'confirm_implementation',$2,$3,now(),'approved',$4) RETURNING id",[workflow,state.users.maker.id,state.users.checker.id,JSON.stringify({orders:[{ticker:'COST',exchangeCode:'NYSE',side:'BUY',targetValue:1000},{ticker:'6861',exchangeCode:'TSE',side:'BUY',targetValue:225000}]})])).rows[0].id;
 app.setErrorHandler((error,_request,reply)=>reply.code((error as any).statusCode??500).send({message:(error as Error).message}));await registerSecurityRoutes(app);await registerOperationalRoutes(app);await app.ready();
},30000);
afterAll(async()=>{await app.close();await state.db.close();});
const editBody=(s:any,exchangeCode:string)=>({ticker:s.ticker,exchangeCode,nameEn:s.name_en,nameZh:s.name_zh,style:s.style,expectedUpdatedAt:new Date(s.updated_at).toISOString(),reason:'核实后更正录入错误的交易所'});
const fills={businessDate:'2026-10-15',filename:'synthetic.csv',content:'Synthetic test only',valueTolerancePct:2,fills:[{ticker:'COST',exchangeCode:'NASDAQ',side:'BUY',quantity:1,price:1000},{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity:500,price:398.2}]};
describe('security correction and execution reconciliation persistence',()=>{
 it('requires administrator and organization scope for edits',async()=>{expect((await app.inject({method:'PATCH',url:`/api/admin/securities/${cost.id}`,headers:{'x-user':'maker'},payload:editBody(cost,'NASDAQ')})).statusCode).toBe(403);expect((await app.inject({method:'PATCH',url:`/api/admin/securities/${cost.id}`,headers:{'x-org':state.other},payload:editBody(cost,'NASDAQ')})).statusCode).toBe(404);});
 it('rejects a wrong listing venue and updates COST/CRCL with immutable audit evidence',async()=>{
  expect((await app.inject({method:'PATCH',url:`/api/admin/securities/${cost.id}`,payload:editBody(cost,'NYSE')})).statusCode).toBe(422);
  for(const [s,venue] of [[cost,'NASDAQ'],[crcl,'NYSE']] as const){const r=await app.inject({method:'PATCH',url:`/api/admin/securities/${s.id}`,payload:editBody(s,venue)});expect(r.statusCode,r.body).toBe(200);expect(r.json().identityCorrection.old_exchange).toBe(s.exchange_code);expect(r.json().historicalSnapshotsChanged).toBe(false);}
  expect((await state.db.query("SELECT id FROM audit_events WHERE action='security.update'")).rows).toHaveLength(2);
  expect((await app.inject({method:'PATCH',url:`/api/admin/securities/${cost.id}`,payload:editBody(cost,'NASDAQ')})).statusCode).toBe(409);
 });
 it('isolates edits of shared catalog rows and rejects duplicate target identities',async()=>{
  const shared=(await state.db.query("SELECT * FROM ticker_universe WHERE ticker='AAPL' AND organization_id IS NULL")).rows[0];const body={...editBody(shared,'NASDAQ'),nameZh:'本团队修改名称'};
  const response=await app.inject({method:'PATCH',url:`/api/admin/securities/${shared.id}`,payload:body});expect(response.statusCode,response.body).toBe(200);expect(response.json().security.id).not.toBe(shared.id);
  const ours=(await app.inject({method:'GET',url:'/api/securities'})).json().securities.filter((s:any)=>s.ticker==='AAPL');expect(ours).toHaveLength(1);expect(ours[0].name_zh).toBe('本团队修改名称');
  const theirs=(await app.inject({method:'GET',url:'/api/securities',headers:{'x-org':state.other}})).json().securities.find((s:any)=>s.ticker==='AAPL');expect(theirs.name_zh).toBe(shared.name_zh);
  const current=(await state.db.query('SELECT * FROM ticker_universe WHERE id=$1',[cost.id])).rows[0];expect((await app.inject({method:'PATCH',url:`/api/admin/securities/${cost.id}`,payload:{...editBody(current,'NASDAQ'),ticker:'AAPL'}})).statusCode).toBe(409);
 });
 it('applies audited corrections and lot hints without altering approved plan or automatically passing a difference',async()=>{
  const response=await app.inject({method:'POST',url:`/api/workflows/${workflow}/execution-fills/preview`,headers:{'x-user':'maker'},payload:fills});expect(response.statusCode,response.body).toBe(200);
  const lines=response.json().preview.importedLines;expect(lines.find((l:any)=>l.ticker==='COST')).toMatchObject({status:'matched',detail:{identityCorrections:[{oldExchange:'NYSE',exchangeCode:'NASDAQ'}]}});expect(lines.find((l:any)=>l.ticker==='6861')).toMatchObject({status:'exception',varianceValue:-25900,detail:{lotRoundingCandidate:true,toleranceValue:4500}});
  expect((await state.db.query('SELECT payload FROM maker_checker_actions WHERE id=$1',[planId])).rows[0].payload.orders[0].exchangeCode).toBe('NYSE');
  const saved=await app.inject({method:'POST',url:`/api/workflows/${workflow}/execution-fills`,headers:{'x-user':'maker'},payload:fills});expect(saved.statusCode,saved.body).toBe(201);batchId=saved.json().fillBatch.id;
  const context=(await app.inject({method:'GET',url:`/api/workflows/${workflow}/execution-evidence/context`,headers:{'x-user':'checker'}})).json();expect(context.latestFillBatch.lines.find((l:any)=>l.ticker==='6861').detail.reason).toBe('board_lot_rounding_review');expect(context.approvedOrders[0].exchangeCode).toBe('NASDAQ');
 });
 it('requires a different reviewer and a persisted explanation to approve exceptions',async()=>{
  const review=(who:string,note?:string)=>app.inject({method:'POST',url:`/api/execution-fill-batches/${batchId}/review`,headers:{'x-user':who},payload:{decision:'approve',note}});
  expect((await review('checker')).statusCode).toBe(409);expect((await review('maker','核实整手限制及价格币种')).statusCode).not.toBe(200);
  const approved=await review('checker','已核对6861每手100股及本位币价格，确认整手取整造成差异');expect(approved.statusCode,approved.body).toBe(200);expect(approved.json().fillBatch).toMatchObject({status:'exceptions',review_status:'approved'});expect(approved.json().fillBatch.review_note).toContain('整手取整');
  expect((await app.inject({method:'DELETE',url:`/api/execution-fill-batches/${batchId}`,headers:{'x-user':'maker'}})).statusCode).toBe(409);
 });
});
