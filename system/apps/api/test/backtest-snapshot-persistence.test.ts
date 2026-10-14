import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({db:null as any,user:null as any,fetches:0}));
vi.mock('../src/auth.js',()=>({requirePasswordChanged:()=>state.user}));
vi.mock('../src/eodhd.js',async()=>({...await import('../src/eodhd-client.js'),getActiveEodhdToken:async()=> 'local-only-test-token'}));
vi.mock('../src/db.js',()=>{
  const query=async(sql:string,values?:unknown[])=>{
    if(values===undefined) {const result=(await state.db.exec(sql)).at(-1)??{};return {rows:result.rows??[],rowCount:result.affectedRows??result.rows?.length??0};}
    const result=await state.db.query(sql,values);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};
  };
  return {pool:{query,connect:async()=>({query,release(){}})}};
});
vi.mock('../src/market-history.js',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../src/market-history.js')>();
  return {...actual,collectHistoricalSeries:async(requests:any[])=>{
    state.fetches++;
    const series=requests.map(request=>({symbol:request.symbol,sourceName:'EODHD',sourceUrl:'https://example.com/mock-prices',currency:'USD',exchange:'US',points:Array.from({length:request.symbol==='CRCL'?71:150},(_,index)=>{
      const date=new Date('2023-01-06T00:00:00Z');date.setUTCDate(date.getUTCDate()+index*7);return {date:date.toISOString().slice(0,10),week:actual.weekKey(date.getTime()/1000),value:100+index+Math.sin(index)};
    })}));
    return {series,coverage:series.map(item=>({symbol:item.symbol,providerSymbol:item.symbol,provider:item.sourceName,observations:item.points.length,firstDate:item.points[0].date,lastDate:item.points.at(-1)!.date,status:item.points.length<100?'short_history':'ready',reason:null,fallbackReason:null}))};
  }};
});
import { registerBacktestRoutes } from '../src/backtest.js';
const app=Fastify();let workflowId:string;
beforeAll(async()=>{
  state.db=new PGlite({extensions:{pgcrypto}});
  const directory=new URL('../../../db/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(file=>file.endsWith('.sql')).sort()) await state.db.exec(await readFile(new URL(file,directory),'utf8'));
  const org=(await state.db.query("INSERT INTO organizations(name) VALUES ('Snapshot integration test') RETURNING id")).rows[0].id;
  const user=(await state.db.query("INSERT INTO users(organization_id,username,display_name,role,password_hash,must_change_password) VALUES ($1,'executor','Test Executor','execution_team','test-only',false) RETURNING id",[org])).rows[0].id;
  state.user={id:user,organizationId:org,displayName:'Test Executor',role:'execution_team',locale:'zh-CN'};
  const portfolio=(await state.db.query("INSERT INTO portfolios(organization_id,code,name) VALUES ($1,'SNAPSHOT','Snapshot test') RETURNING id",[org])).rows[0].id;
  workflowId=(await state.db.query("INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES ($1,$2,'annual_cycle',2026,'active','backtest',$3) RETURNING id",[org,portfolio,user])).rows[0].id;
  const annual=(await state.db.query("INSERT INTO annual_data_packages(workflow_case_id,version,as_of_date,scenario,model_version,source_manifest,recommendation,created_by) VALUES ($1,1,'2026-01-01','balanced','test','[]',$2,$3) RETURNING id",[workflowId,JSON.stringify({marketWeights:{chinaA:0,hongKong:1}}),user])).rows[0].id;
  const target=(await state.db.query("INSERT INTO target_return_versions(workflow_case_id,version,annual_data_package_id,operating_cost_rate,expected_cpi_rate,scenario_adjustment_rate,target_return_rate,calculation,created_by) VALUES ($1,1,$2,0,0,0,0.08,'{}',$3) RETURNING id",[workflowId,annual,user])).rows[0].id;
  const targets={equityTargets:['us','developedNonUs','emerging'].map(key=>({key,targetReturn:0.01,targetBeta:1,betaControlActive:true,maximumDrawdownLimit:-0.5,capm:{beta:1,betaControlActive:true}}))};
  const sleeve=(await state.db.query("INSERT INTO sleeve_target_versions(workflow_case_id,target_return_version_id,version,targets,reconciliation_difference,created_by) VALUES ($1,$2,1,$3,0,$4) RETURNING id",[workflowId,target,JSON.stringify(targets),user])).rows[0].id;
  const proposal=(await state.db.query("INSERT INTO proposed_portfolio_versions(workflow_case_id,sleeve_target_version_id,version,status,created_by) VALUES ($1,$2,1,'submitted',$3) RETURNING id",[workflowId,sleeve,user])).rows[0].id;
  for(const [ticker,exchange,market,key] of [['CRCL','NYSE','US','us'],['8035','TSE','JP','developedNonUs'],['0700','HKEX','HK','emerging']]) await state.db.query("INSERT INTO proposed_holdings(proposed_portfolio_version_id,ticker,exchange_code,market,sleeve,style,weight) VALUES ($1,$2,$3,$4,$5,'growth',1)",[proposal,ticker,exchange,market,key]);
  app.setErrorHandler((error,_request,reply)=>reply.code((error as any).statusCode??500).send({message:(error as Error).message}));
  await registerBacktestRoutes(app);await app.ready();
},30000);
afterAll(async()=>{await app.close();await state.db?.close();});

describe('price snapshot persistence against PostgreSQL-compatible SQL',()=>{
  it('persists checked prices, runs without refetching, and retains exact evidence after cache deletion',async()=>{
    const preflight=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/backtest/preflight`,payload:{}});expect(preflight.statusCode).toBe(200);
    const option=preflight.json().report.shortHistory;expect(option.snapshotId).toBeTruthy();expect(state.fetches).toBe(1);
    const cache=(await state.db.query('SELECT * FROM backtest_data_snapshots WHERE id=$1',[option.snapshotId])).rows[0];expect(cache.snapshot_payload.allSeries).toHaveLength(6);expect(JSON.stringify(cache.snapshot_payload)).not.toContain('local-only-test-token');
    const result=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/backtest/runs`,payload:{shortHistoryConfirmation:{acknowledged:true,proposedPortfolioVersionId:option.proposedPortfolioVersionId,coverageFingerprint:option.coverageFingerprint,snapshotId:option.snapshotId}}});
    expect(result.statusCode,result.body).toBe(201);expect(state.fetches).toBe(1);
    const run=result.json().backtestRun;expect(run.history_mode).toBe('confirmed_short_history');expect(run.metrics.sleeves.every((item:any)=>item.observationCount===70)).toBe(true);
    const evidence=(await state.db.query('SELECT * FROM backtest_history_confirmations WHERE id=$1',[run.short_history_confirmation_id])).rows[0];expect(evidence.data_snapshot_id).toBe(option.snapshotId);expect(evidence.confirmed_by).toBe(state.user.id);expect(evidence.history_snapshot.prices).toEqual(cache.snapshot_payload.allSeries);
    await state.db.query('DELETE FROM backtest_data_snapshots WHERE id=$1',[option.snapshotId]);expect((await state.db.query('SELECT id FROM backtest_history_confirmations WHERE id=$1',[evidence.id])).rows).toHaveLength(1);
    expect((await state.db.query("SELECT action FROM audit_events WHERE action IN ('backtest.short_history.confirm','backtest.run')")).rows).toHaveLength(2);
  });
  it('enforces server-side snapshot expiry without refetching or recording another consent',async()=>{
    const option=(await app.inject({method:'POST',url:`/api/workflows/${workflowId}/backtest/preflight`,payload:{}})).json().report.shortHistory;const fetches=state.fetches;
    await state.db.query("UPDATE backtest_data_snapshots SET expires_at=now()-interval '1 second' WHERE id=$1",[option.snapshotId]);
    const result=await app.inject({method:'POST',url:`/api/workflows/${workflowId}/backtest/runs`,payload:{shortHistoryConfirmation:{acknowledged:true,proposedPortfolioVersionId:option.proposedPortfolioVersionId,coverageFingerprint:option.coverageFingerprint,snapshotId:option.snapshotId}}});
    expect(result.statusCode).toBe(422);expect(result.json().error).toBe('backtest_snapshot_expired');expect(state.fetches).toBe(fetches);expect((await state.db.query('SELECT id FROM backtest_history_confirmations')).rows).toHaveLength(1);
  });
});
