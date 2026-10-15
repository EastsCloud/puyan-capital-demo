import assert from 'node:assert/strict';
import {runOptimizerWorker} from '../dist/optimizer-runner.js';
const weeks=Array.from({length:156},(_,i)=>{const d=new Date('2023-01-02');d.setUTCDate(d.getUTCDate()+i*7);return d.toISOString().slice(0,10);});
let heartbeats=0;const timer=setInterval(()=>heartbeats++,10);const results=[];
try{
 for(const count of [6,12,20]){
  const holdings=Array.from({length:count},(_,i)=>({ticker:`S${i}`,exchangeCode:'NYSE',market:'US',sleeve:'us',style:i<count/2?'growth':'value',weight:1/count,locked:i===0}));
  const series=[...holdings.map(h=>h.ticker),'BENCH'].map(symbol=>({symbol,sourceName:'EODHD',sourceUrl:'https://example.com/synthetic',currency:'USD',exchange:'US',points:weeks.map((week,i)=>({date:week,week,value:100+i*.2+Math.sin(i)*.8}))}));
  const input={holdings,universe:[],series,weeks,benchmarks:[{symbol:'BENCH',weight:1}],target:{targetReturn:.03,targetBeta:1,maximumDrawdownLimit:-.2,capm:{beta:1,betaControlActive:true}},tolerance:{betaRelative:.05,returnShortfall:.05,returnExcessReview:.5,drawdownExcess:.1},maxWeightPct:35,budget:{maxEvaluations:12000,maxMillis:4000,maxCandidateSets:1}};
  const result=await runOptimizerWorker(input,new AbortController().signal);assert.ok(result.solutions.length);assert.ok(result.diagnostics.largestRetained<=9);assert.ok(result.diagnostics.evaluations<=12000);results.push({stocks:count,...result.diagnostics,parentHeapMb:Math.round(process.memoryUsage().heapUsed/1048576)});
 }
 // Exercise an impossible target and a broad replacement pool, not only easy feasible cases.
 const count=12;const holdings=Array.from({length:count},(_,i)=>({ticker:`O${i}`,exchangeCode:'NYSE',market:'US',sleeve:'us',style:i<count/2?'growth':'value',weight:1/count,locked:i===0}));
 const universe=Array.from({length:24},(_,i)=>({...holdings[i%count],ticker:`R${i}`,locked:false}));
 const series=[...holdings,...universe,{ticker:'BENCH'}].map(h=>({symbol:h.ticker,sourceName:'Synthetic memory test',sourceUrl:'https://example.com/synthetic',points:weeks.map((week,i)=>({date:week,week,value:100+i*.2+Math.sin(i)*.8}))}));
 const failure=await runOptimizerWorker({holdings,universe,series,weeks,benchmarks:[{symbol:'BENCH',weight:1}],target:{targetReturn:10,targetBeta:1,maximumDrawdownLimit:-.2,capm:{beta:1,betaControlActive:true}},tolerance:{betaRelative:.05,returnShortfall:.05,returnExcessReview:.5,drawdownExcess:.1},maxWeightPct:35},new AbortController().signal);
 assert.equal(failure.solutions.length,0);assert.ok(failure.diagnostics.evaluations<=40000);assert.ok(failure.diagnostics.candidateSets<=64);assert.equal(failure.outcome,'budget_exhausted');results.push({scenario:'infeasible-target-with-replacements',...failure.diagnostics,parentHeapMb:Math.round(process.memoryUsage().heapUsed/1048576)});
 assert.ok(heartbeats>0,'Parent event loop must remain responsive');console.log(JSON.stringify({passed:true,nodeHeapLimitMb:256,workerOldGenerationLimitMb:64,heartbeats,results}));
}finally{clearInterval(timer);}
