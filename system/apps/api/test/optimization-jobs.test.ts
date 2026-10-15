import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import Fastify from 'fastify';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,user:null as any}));
vi.mock('../src/auth.js',()=>({requirePasswordChanged:(request:any)=>({...state.user,role:request.headers['x-role']??state.user.role,organizationId:request.headers['x-org']??state.user.organizationId})}));
vi.mock('../src/eodhd.js',async()=>({...await import('../src/eodhd-client.js'),getActiveEodhdToken:async()=>null}));
vi.mock('../src/market-history.js',async original=>({...await original<typeof import('../src/market-history.js')>(),collectHistoricalSeries:async()=>{throw new Error('Replacement fixture has no prices');}}));
vi.mock('../src/db.js',()=>{const query=async(sql:string,values?:unknown[])=>{if(values===undefined){const r=(await state.db.exec(sql)).at(-1)??{};return {rows:r.rows??[],rowCount:r.affectedRows??r.rows?.length??0};}const r=await state.db.query(sql,values);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};return {pool:{query,connect:async()=>({query,release(){}})}};});
import {registerOptimizationRoutes} from '../src/optimization.js';
const app=Fastify();let workflowId:string,proposalId:string,sleeveId:string;let targets:any;let resultRun:any;
beforeAll(async()=>{
 state.db=new PGlite({extensions:{pgcrypto}});const dir=new URL('../../../db/migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await state.db.exec(await readFile(new URL(f,dir),'utf8'));
 const org=(await state.db.query("INSERT INTO organizations(name) VALUES ('Optimizer integration') RETURNING id")).rows[0].id;
 const user=(await state.db.query("INSERT INTO users(organization_id,username,display_name,role,password_hash,must_change_password) VALUES ($1,'executor','Test','execution_team','test-only',false) RETURNING id",[org])).rows[0].id;state.user={id:user,organizationId:org,displayName:'Test',role:'execution_team',locale:'zh-CN'};
 const portfolio=(await state.db.query("INSERT INTO portfolios(organization_id,code,name) VALUES ($1,'OPT','Optimization test') RETURNING id",[org])).rows[0].id;
 workflowId=(await state.db.query("INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES ($1,$2,'annual_cycle',2026,'active','optimization',$3) RETURNING id",[org,portfolio,user])).rows[0].id;
 const annual=(await state.db.query("INSERT INTO annual_data_packages(workflow_case_id,version,as_of_date,scenario,model_version,source_manifest,recommendation,created_by) VALUES ($1,1,'2026-01-01','balanced','test','[]','{}',$2) RETURNING id",[workflowId,user])).rows[0].id;
 const target=(await state.db.query("INSERT INTO target_return_versions(workflow_case_id,version,annual_data_package_id,operating_cost_rate,expected_cpi_rate,scenario_adjustment_rate,target_return_rate,calculation,created_by) VALUES ($1,1,$2,0,0,0,.03,'{}',$3) RETURNING id",[workflowId,annual,user])).rows[0].id;
 targets={equityTargets:['us','developedNonUs','emerging'].map(key=>({key,targetReturn:.03,targetBeta:1,betaControlActive:true,maximumDrawdownLimit:-.2,capm:{beta:1,betaControlActive:true}}))};
 sleeveId=(await state.db.query("INSERT INTO sleeve_target_versions(workflow_case_id,target_return_version_id,version,targets,reconciliation_difference,created_by) VALUES ($1,$2,1,$3,0,$4) RETURNING id",[workflowId,target,JSON.stringify(targets),user])).rows[0].id;
 proposalId=(await state.db.query("INSERT INTO proposed_portfolio_versions(workflow_case_id,sleeve_target_version_id,version,status,created_by) VALUES ($1,$2,1,'backtest_failed',$3) RETURNING id",[workflowId,sleeveId,user])).rows[0].id;
 const weeks=Array.from({length:156},(_,i)=>{const d=new Date('2023-01-02');d.setUTCDate(d.getUTCDate()+7*i);return d.toISOString().slice(0,10);});const series:any[]=[];
 for(const [sleeve,market,exchange] of [['us','US','NYSE'],['developedNonUs','JP','TSE'],['emerging','HK','HKEX']])for(let i=0;i<6;i++){const ticker=`${sleeve}${i}`;await state.db.query("INSERT INTO proposed_holdings(proposed_portfolio_version_id,ticker,exchange_code,market,sleeve,style,weight,locked) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[proposalId,ticker,exchange,market,sleeve,i<3?'growth':'value',1/6,i===0]);series.push({symbol:market==='JP'?ticker+'.T':market==='HK'?ticker+'.HK':ticker,sourceName:'EODHD',sourceUrl:'https://example.com/synthetic',currency:'USD',exchange,points:weeks.map((week,j)=>({date:week,week,value:100+j*.2+Math.sin(j)*.8}))});}
 const indexes={'us':'^GSPC','developedNonUs':'^N225','emerging':'^HSI'};for(const symbol of Object.values(indexes))series.push({...series[0],symbol});
 const confirmation=(await state.db.query("INSERT INTO backtest_history_confirmations(organization_id,workflow_case_id,proposed_portfolio_version_id,confirmed_by,coverage_fingerprint,warning_text,history_snapshot) VALUES ($1,$2,$3,$4,$5,'test',$6) RETURNING id",[org,workflowId,proposalId,user,'a'.repeat(64),JSON.stringify({prices:series})])).rows[0].id;
 const metrics={sleeves:targets.equityTargets.map((t:any)=>({sleeve:t.key,hardPass:t.key!=='us',startDate:weeks[0],endDate:weeks.at(-1),observationCount:155,annualizedReturn:.1,beta:1,maximumDrawdown:-.01,returnControl:{hardPass:true,status:'pass'},betaControl:{hardPass:true,status:'pass'},drawdownControl:{hardPass:true,status:'pass'}}))};
 await state.db.query("INSERT INTO backtest_runs(proposed_portfolio_version_id,run_number,start_date,end_date,frequency,benchmark_manifest,data_manifest,metrics,hard_control_pass,review_flags,model_version,run_by,history_mode,short_history_confirmation_id) VALUES ($1,1,$2,$3,'weekly',$4,$5,$6,false,'[]','synthetic-test',$7,'confirmed_short_history',$8)",[proposalId,weeks[0],weeks.at(-1),JSON.stringify({sleeves:Object.fromEntries(Object.entries(indexes).map(([s,symbol])=>[s,[{symbol,weight:1}]]))}),JSON.stringify({shortHistoryConfirmation:{id:confirmation,usedWeeks:weeks}}),JSON.stringify(metrics),user,confirmation]);
 app.get('/api/health',async()=>({status:'ok'}));app.setErrorHandler((error,_request,reply)=>reply.code((error as any).statusCode??500).send({message:(error as Error).message}));await registerOptimizationRoutes(app);await app.ready();
},30000);
afterAll(async()=>{await app.close();await state.db?.close();});
async function waitJob(id:string){for(let i=0;i<1000;i++){const r=await app.inject({method:'GET',url:`/api/workflows/${workflowId}/optimization/jobs/${id}`});const b=r.json();if(!['queued','preparing','running'].includes(b.optimizationJob.status))return b;await new Promise(r=>setTimeout(r,10));}throw new Error('Job did not finish');}
describe('optimization background job and persistence',()=>{
 it('enforces execution permission',async()=>{expect((await app.inject({method:'POST',url:`/api/workflows/${workflowId}/optimization/runs`,headers:{'x-role':'decision_committee'},payload:{}})).statusCode).toBe(403);});
 it('returns 202, deduplicates running work, keeps health responsive and persists independently verified plans',async()=>{
  const response=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/optimization/runs`,payload:{}});expect(response.statusCode,response.body).toBe(202);const id=response.json().optimizationJob.id;
  const duplicate=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/optimization/runs`,payload:{}});expect(duplicate.statusCode).toBe(202);expect(duplicate.json().optimizationJob.id).toBe(id);
  const started=Date.now();expect((await app.inject({method:'GET',url:'/api/health'})).statusCode).toBe(200);expect(Date.now()-started).toBeLessThan(1000);
  const result=await waitJob(id);expect(result.optimizationJob.status,JSON.stringify(result)).toBe('succeeded');resultRun=result.optimizationRun;expect(resultRun.candidates.length).toBeGreaterThan(0);expect(resultRun.candidates.length).toBeLessThanOrEqual(3);expect(resultRun.constraints.globalOptimalityProven).toBe(false);for(const plan of resultRun.candidates)for(const sleeve of plan.sleeveResults)expect(Object.values(sleeve.controls).every((c:any)=>c.hardPass)).toBe(true);
  expect((await app.inject({method:'GET',url:`/api/workflows/${workflowId}/optimization/jobs/${id}`,headers:{'x-org':'22222222-2222-4222-8222-222222222222'}})).statusCode).toBe(404);
 },20000);
 it('reports budget-limited failure without crashing or claiming definite infeasibility',async()=>{
  const changed={equityTargets:targets.equityTargets.map((t:any)=>({...t,targetReturn:10}))};await state.db.query('UPDATE sleeve_target_versions SET targets=$2 WHERE id=$1',[sleeveId,JSON.stringify(changed)]);
  const response=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/optimization/runs`,payload:{}});expect(response.statusCode).toBe(202);const result=await waitJob(response.json().optimizationJob.id);expect(result.optimizationJob.status).toBe('no_candidate');expect(result.optimizationJob.message).toContain('不代表数学上无解');expect(result.optimizationRun).toBeNull();
  const stale=await app.inject({method:'POST',url:`/api/optimization-runs/${resultRun.id}/select`,payload:{candidateKey:resultRun.candidates[0].key}});expect(stale.statusCode).toBe(409);
  await state.db.query('UPDATE sleeve_target_versions SET targets=$2 WHERE id=$1',[sleeveId,JSON.stringify(targets)]);
 },20000);
 it('accepts a verified plan while preserving locks, short-history linkage and untouched sleeves',async()=>{
  const result=await app.inject({method:'POST',url:`/api/optimization-runs/${resultRun.id}/select`,payload:{candidateKey:resultRun.candidates[0].key}});expect(result.statusCode,result.body).toBe(201);const id=result.json().proposedPortfolioVersion.id;
  const holdings=(await state.db.query('SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id=$1',[id])).rows;expect(holdings).toHaveLength(18);expect(holdings.filter((h:any)=>h.locked)).toHaveLength(3);
  const run=(await state.db.query('SELECT * FROM backtest_runs WHERE proposed_portfolio_version_id=$1',[id])).rows[0];expect(run.history_mode).toBe('confirmed_short_history');expect(run.short_history_confirmation_id).toBeTruthy();expect(run.hard_control_pass).toBe(true);expect((await state.db.query('SELECT current_step FROM workflow_cases WHERE id=$1',[workflowId])).rows[0].current_step).toBe('optimization');
  expect((await app.inject({method:'POST',url:`/api/optimization-runs/${resultRun.id}/select`,payload:{candidateKey:resultRun.candidates[0].key}})).statusCode).toBe(409);
 });
 it('recovers an expired worker lease without changing the saved portfolio',async()=>{
  const source=(await state.db.query('SELECT id FROM backtest_runs WHERE proposed_portfolio_version_id=$1 LIMIT 1',[proposalId])).rows[0].id;
  const job=(await state.db.query("INSERT INTO optimization_jobs(organization_id,workflow_case_id,proposed_portfolio_version_id,backtest_run_id,requested_by,lease_expires_at) VALUES ($1,$2,$3,$4,$5,now()-interval '1 minute') RETURNING id",[state.user.organizationId,workflowId,proposalId,source,state.user.id])).rows[0].id;
  const response=await app.inject({method:'GET',url:`/api/workflows/${workflowId}/optimization/jobs/${job}`});
  expect(response.statusCode).toBe(200);expect(response.json().optimizationJob.status).toBe('interrupted');expect(response.json().optimizationJob.error_code).toBe('worker_interrupted');
  expect((await state.db.query('SELECT count(*)::int AS count FROM proposed_portfolio_versions WHERE workflow_case_id=$1',[workflowId])).rows[0].count).toBe(2);
 });
});
