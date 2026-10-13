import Fastify from 'fastify';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({short:true,step:'backtest',requests:[] as any[],writes:[] as string[]}));
vi.mock('../src/auth.js',()=>({requirePasswordChanged:(request:any)=>({id:'test-user',organizationId:'test-org',role:request.headers['x-role']??'execution_team',locale:'zh-CN'})}));
vi.mock('../src/eodhd.js',async()=>({...await import('../src/eodhd-client.js'),getActiveEodhdToken:async()=> 'not-a-real-token'}));
vi.mock('../src/market-history.js',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../src/market-history.js')>();
  return {...actual,collectHistoricalSeries:async(requests:any[])=>{
    state.requests=requests;
    const series=requests.map(request=>{
      const count=state.short&&request.symbol==='CRCL'?72:state.short&&request.symbol==='SNDK'?88:150;
      return {symbol:request.symbol,sourceName:request.market==='JP'?'Yahoo Finance chart':'EODHD',sourceUrl:'https://example.com/prices',currency:'USD',exchange:'US',fallbackReason:request.market==='JP'?'Tokyo fallback':undefined,
        points:Array.from({length:count},(_,index)=>{const date=new Date('2023-01-06T00:00:00Z');date.setUTCDate(date.getUTCDate()+index*7);const raw=date.toISOString().slice(0,10);return {date:raw,week:raw,value:100+index+Math.sin(index)};})};
    });
    return {series,coverage:series.map(item=>({symbol:item.symbol,providerSymbol:item.symbol,provider:item.sourceName,observations:item.points.length,firstDate:item.points[0].date,lastDate:item.points.at(-1)!.date,status:item.points.length<100?'short_history':'ready',reason:null,fallbackReason:item.fallbackReason??null}))};
  }};
});
vi.mock('../src/db.js',()=>{
  const query=async(sql:string)=>{
    if(sql.includes('FROM workflow_cases'))return {rows:[{id:'workflow',status:'active',current_step:state.step}]};
    if(sql.includes('SELECT p.*, s.targets'))return {rows:[{id:'proposal',version:3,targets:{equityTargets:['us','developedNonUs','emerging'].map(key=>({key,targetReturn:0.08,targetBeta:1,betaControlActive:true,maximumDrawdownLimit:-0.5,capm:{beta:1,betaControlActive:true}}))},recommendation:{marketWeights:{chinaA:0,hongKong:1}}}]};
    if(sql.includes('FROM proposed_holdings'))return {rows:[{ticker:'CRCL',market:'US',sleeve:'us',weight:0.5},{ticker:'SNDK',market:'US',sleeve:'us',weight:0.5},{ticker:'8035',market:'JP',sleeve:'developedNonUs',weight:1},{ticker:'0700',market:'HK',sleeve:'emerging',weight:1}]};
    if(sql.includes('FROM parameter_sets'))return {rows:[]};
    if(sql.includes('FROM default_business_parameters'))return {rows:[{parameters:{backtest:{}}}]};
    return {rows:[]};
  };
  return {pool:{query,connect:async()=>({release(){},query:async(sql:string)=>{
    state.writes.push(sql);
    if(sql.includes('AS run_number'))return {rows:[{run_number:1}]};
    if(sql.includes('INSERT INTO backtest_runs'))return {rows:[{id:'run',run_number:1}]};
    return {rows:[],rowCount:1};
  }})}};
});
import { registerBacktestRoutes } from '../src/backtest.js';
const app=Fastify();
beforeAll(async()=>{
  app.setErrorHandler((error,_request,reply)=>reply.code((error as any).statusCode??500).send({error:'Conflict',message:(error as Error).message}));
  await registerBacktestRoutes(app);await app.ready();
});
afterAll(async()=>{await app.close()});
beforeEach(()=>{state.short=true;state.step='backtest';state.writes=[];state.requests=[]});
describe('backtest coverage gates',()=>{
  it('lists both short-history names in a read-only preflight without saving anything',async()=>{
    const result=await app.inject({method:'POST',url:'/api/workflows/workflow/backtest/preflight',payload:{}});
    expect(result.statusCode).toBe(200);const report=result.json().report;
    expect(report.ready).toBe(false);expect(report.minimumWeeklyObservations).toBe(100);
    expect(report.issues.some((item:any)=>item.symbol==='CRCL')).toBe(true);expect(report.issues.some((item:any)=>item.symbol==='SNDK')).toBe(true);
    expect(report.proposedPortfolioVersion).toBe(3);expect(state.writes).toEqual([]);
    expect(state.requests.some(item=>item.symbol==='000001.SS')).toBe(false);
  });
  it('returns useful 422 details and prevents any calculation/save on insufficient data',async()=>{
    const result=await app.inject({method:'POST',url:'/api/workflows/workflow/backtest/runs',payload:{}});
    expect(result.statusCode).toBe(422);expect(result.json().message).toContain('CRCL');expect(result.json().message).toContain('SNDK');expect(state.writes).toEqual([]);
  });
  it('persists completed-week observations only after every data gate passes',async()=>{
    state.short=false;
    const result=await app.inject({method:'POST',url:'/api/workflows/workflow/backtest/runs',payload:{}});
    expect(result.statusCode).toBe(201);expect(state.writes.some(sql=>sql.includes('adjusted_close_weekly_v2'))).toBe(true);expect(state.writes.some(sql=>sql.includes('INSERT INTO backtest_runs'))).toBe(true);
  });
  it('keeps role and workflow gates on preflight',async()=>{
    expect((await app.inject({method:'POST',url:'/api/workflows/workflow/backtest/preflight',headers:{'x-role':'decision_committee'},payload:{}})).statusCode).toBe(403);
    state.step='monitoring';expect((await app.inject({method:'POST',url:'/api/workflows/workflow/backtest/preflight',payload:{}})).statusCode).toBe(409);
  });
});
