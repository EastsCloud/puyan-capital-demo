import { betaControl, drawdownControl, returnControl, type BacktestTolerance, type CapmTarget } from '@isater/domain';
import { annualizedReturn, calculateBeta, maximumDrawdown } from './backtest-math.js';
import type { PriceSeries } from './market-history.js';

export type SleeveKey = 'us' | 'developedNonUs' | 'emerging';
export interface OptimizerHolding { ticker:string;exchangeCode:string;market:'US'|'JP'|'HK'|'CN_A';sleeve:SleeveKey;style:'growth'|'value';weight:number;locked:boolean }
export interface SolverInput {
  holdings:OptimizerHolding[];universe:OptimizerHolding[];series:PriceSeries[];weeks:string[];
  benchmarks:Array<{symbol:string;weight:number}>;
  target:{targetReturn:number;targetBeta:number;maximumDrawdownLimit:number;capm:CapmTarget};
  tolerance:BacktestTolerance;maxWeightPct:number;
  budget?:Partial<{maxEvaluations:number;maxMillis:number;maxCandidateSets:number;maxReplacements:number}>;
}
export interface SolverSolution {
  sleeve:SleeveKey;phase:'weight_only'|'minimum_ticker_replacement';tickerReplacements:number;
  holdings:OptimizerHolding[];weights:number[];turnover:number;
  metrics:{annualizedReturn:number;beta:number;maximumDrawdown:number};controls:Record<string,any>;
  startDate:string;endDate:string;observationCount:number;
  dataSources:Array<{symbol:string;provider:string;url:string;fallbackReason:string|null}>;
}
export const keyOf=(h:Pick<OptimizerHolding,'ticker'|'exchangeCode'>)=>`${h.ticker}|${h.exchangeCode}`;
export function oneWayTurnover(original:OptimizerHolding[],proposed:OptimizerHolding[],weights:number[]):number {
  const before=new Map(original.map(h=>[keyOf(h),h.weight]));const after=new Map(proposed.map((h,i)=>[keyOf(h),weights[i]]));
  return [...new Set([...before.keys(),...after.keys()])].reduce((sum,key)=>sum+Math.abs((before.get(key)??0)-(after.get(key)??0)),0)/2;
}
// Lazy bounded replacement search, never the Cartesian product of all style subsets.
export function* replacementCandidateSets(original:OptimizerHolding[],universe:OptimizerHolding[],maxSets=64,maxReplacements=2):Generator<{holdings:OptimizerHolding[];replacements:number}> {
  let emitted=0;const seen=new Set<string>();const originalKeys=new Set(original.map(keyOf));
  const alternatives=[...new Map(universe.filter(h=>!originalKeys.has(keyOf(h))).map(h=>[keyOf(h),h])).values()].sort((a,b)=>keyOf(a).localeCompare(keyOf(b)));
  if(maxSets<=0)return;yield {holdings:original.map(h=>({...h})),replacements:0};emitted++;
  for(let count=1;count<=Math.min(2,maxReplacements);count++) {
    for(let i=0;i<original.length;i++) {if(original[i].locked)continue;
      for(let j=count===1?i:i+1;j<original.length;j++) {if(count===2&&original[j].locked)continue;
        for(const a of alternatives) {if(a.style!==original[i].style||a.sleeve!==original[i].sleeve)continue;
          for(const b of count===1?[a]:alternatives) {if(count===2&&(b.style!==original[j].style||b.sleeve!==original[j].sleeve||keyOf(a)===keyOf(b)))continue;
            const holdings=original.map((h,k)=>k===i?{...a,weight:h.weight,locked:false}:count===2&&k===j?{...b,weight:h.weight,locked:false}:{...h});
            const signature=holdings.map(keyOf).sort().join(';');if(seen.has(signature))continue;seen.add(signature);
            if(emitted>=maxSets)return;yield {holdings,replacements:count};emitted++;
          }
        }
      }
    }
  }
}

function project(seed:number[],holdings:OptimizerHolding[],cap:number):number[]|null {
  const epsilon=1e-8;const weights=seed.map((w,i)=>holdings[i].locked?holdings[i].weight:Math.min(cap,Math.max(epsilon,w)));
  if(weights.some((w,i)=>!Number.isFinite(w)||w<epsilon||holdings[i].locked&&w>cap+1e-10))return null;
  for(let pass=0;pass<holdings.length+3;pass++) {
    const difference=1-weights.reduce((s,w)=>s+w,0);if(Math.abs(difference)<1e-10)return weights;
    const free=weights.map((w,i)=>!holdings[i].locked&&(difference>0?w<cap-1e-12:w>epsilon+1e-12)?i:-1).filter(i=>i>=0);
    if(!free.length)return null;for(const i of free)weights[i]=Math.min(cap,Math.max(epsilon,weights[i]+difference/free.length));
  }
  return Math.abs(weights.reduce((s,w)=>s+w,0)-1)<1e-9?weights:null;
}

export function solveBounded(input:SolverInput,onProgress?:(value:Record<string,unknown>)=>void) {
  const limits={maxEvaluations:40000,maxMillis:6000,maxCandidateSets:64,maxReplacements:2,...input.budget};
  // Caller-supplied budgets can only reduce the service safety ceilings.
  limits.maxEvaluations=Math.max(1,Math.min(40000,limits.maxEvaluations));limits.maxMillis=Math.max(1,Math.min(6000,limits.maxMillis));limits.maxCandidateSets=Math.max(1,Math.min(64,limits.maxCandidateSets));limits.maxReplacements=Math.max(0,Math.min(2,limits.maxReplacements));
  const started=Date.now(),cap=input.maxWeightPct/100;let evaluations=0,sets=0,largestRetained=0,budgetExhausted=false;
  if(!input.holdings.length||input.holdings.length>100||input.weeks.length<3||input.weeks.length>520||input.series.length>240||!Number.isFinite(cap)||cap<=0||cap>1)throw new Error('Unsupported optimization input size or weight bounds');
  const prices=new Map(input.series.map(s=>[s.symbol,s]));
  const symbol=(h:OptimizerHolding)=>h.market==='JP'?`${h.ticker}.T`:h.market==='HK'?`${h.ticker}.HK`:h.market==='CN_A'?`${h.ticker}.${h.ticker.startsWith('6')?'SS':'SZ'}`:h.ticker;
  const returns=new Map<string,number[]>();
  for(const [name,series] of prices) {const map=new Map(series.points.map(p=>[p.week,p.value]));if(!input.weeks.every(w=>Number.isFinite(map.get(w))&&map.get(w)!>0))continue;returns.set(name,input.weeks.slice(1).map((w,i)=>map.get(w)!/map.get(input.weeks[i])!-1));}
  const count=input.weeks.length-1;const benchmark=Array(count).fill(0);
  for(const b of input.benchmarks){const r=returns.get(b.symbol);if(!r)throw new Error(`Benchmark ${b.symbol} does not cover the accepted window`);for(let t=0;t<count;t++)benchmark[t]+=r[t]*b.weight;}
  const benchmarkDrawdown=maximumDrawdown(benchmark);calculateBeta(benchmark,benchmark);
  const best:SolverSolution[][]=[[],[],[]];const rank=(s:SolverSolution,k:number)=>k===0?s.turnover:k===1?Math.abs(s.metrics.beta-input.target.targetBeta):-s.metrics.maximumDrawdown;
  const budget=()=>{const stop=evaluations>=limits.maxEvaluations||Date.now()-started>=limits.maxMillis;if(stop)budgetExhausted=true;return stop;};
  let originalFound=false;const missing=new Set<string>();
  for(const candidate of replacementCandidateSets(input.holdings,input.universe,limits.maxCandidateSets+1,limits.maxReplacements)) {
    if(originalFound&&candidate.replacements>0)break;
    if(best[0].length&&candidate.replacements>best[0][0].tickerReplacements)break;
    if(sets>=limits.maxCandidateSets){budgetExhausted=true;break;}if(budget())break;sets++;
    const arrays=candidate.holdings.map(h=>returns.get(symbol(h)));if(arrays.some((r,i)=>{if(!r)missing.add(symbol(candidate.holdings[i]));return !r;}))continue;
    let localEvaluations=0;const perSet=candidate.replacements===0?Math.min(12000,limits.maxEvaluations):800;
    const evaluate=(weights:number[]):{penalty:number;secondary:number[]}|null=>{
      if(budget()||localEvaluations>=perSet)return null;evaluations++;localEvaluations++;
      const portfolio=Array(count).fill(0);for(let i=0;i<arrays.length;i++)for(let t=0;t<count;t++)portfolio[t]+=arrays[i]![t]*weights[i];
      const actualReturn=annualizedReturn(portfolio),beta=calculateBeta(portfolio,benchmark),dd=maximumDrawdown(portfolio);
      if(![actualReturn,beta,dd].every(Number.isFinite))return {penalty:1e10,secondary:[1,1,1]};
      const r=returnControl(actualReturn,input.target.targetReturn,input.tolerance),d=drawdownControl(dd,input.target.maximumDrawdownLimit,benchmarkDrawdown,input.tolerance),b=betaControl(beta,input.target.capm,r.hardPass,d.hardPass,input.tolerance);
      const turnover=oneWayTurnover(input.holdings,candidate.holdings,weights);
      const penalty=Math.max(0,(r.floor??0)-actualReturn)/Math.max(.01,Math.abs(input.target.targetReturn))+Math.max(0,Math.abs(dd)-(d.effectiveLimit??0))/.1+(b.hardPass?0:Math.max(1e-6,beta-input.target.capm.beta-Math.abs(input.target.capm.beta)*input.tolerance.betaRelative));
      const secondary=[turnover,Math.abs(beta-input.target.targetBeta),-dd];
      if(r.hardPass&&d.hardPass&&b.hardPass) {
        if(candidate.replacements===0)originalFound=true;
        const solution:SolverSolution={sleeve:candidate.holdings[0].sleeve,phase:candidate.replacements?'minimum_ticker_replacement':'weight_only',tickerReplacements:candidate.replacements,holdings:candidate.holdings,weights:[...weights],turnover,metrics:{annualizedReturn:actualReturn,beta,maximumDrawdown:dd},controls:{return:r,beta:b,drawdown:d},startDate:input.weeks[0],endDate:input.weeks.at(-1)!,observationCount:count,dataSources:candidate.holdings.map(h=>{const s=prices.get(symbol(h))!;return {symbol:s.symbol,provider:s.sourceName,url:s.sourceUrl,fallbackReason:s.fallbackReason??null};})};
        const signature=solution.holdings.map(keyOf).join(';')+weights.map(w=>w.toFixed(9)).join(';');
        for(let k=0;k<3;k++){if(best[k].some(s=>s.holdings.map(keyOf).join(';')+s.weights.map(w=>w.toFixed(9)).join(';')===signature))continue;best[k].push(solution);best[k].sort((a,b)=>a.tickerReplacements-b.tickerReplacements||rank(a,k)-rank(b,k)||a.turnover-b.turnover);best[k].splice(3);}
        largestRetained=Math.max(largestRetained,best.reduce((s,a)=>s+a.length,0));
      }
      return {penalty,secondary};
    };
    let random=0x9e3779b9+sets;const nextRandom=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)/4294967296;};
    for(let start=0;start<8&&!budget()&&localEvaluations<perSet;start++) {
      const initial=project(start===0?candidate.holdings.map(h=>h.weight):start===1?candidate.holdings.map(()=>1/candidate.holdings.length):candidate.holdings.map(()=>nextRandom()),candidate.holdings,cap);if(!initial)continue;let weights:number[]=initial;
      const strategy=start%3;let current=evaluate(weights);if(!current)break;
      for(const step of [.1,.05,.02,.01,.005,.001]) {
        let improving=true,passes=0;
        while(improving&&passes++<3&&!budget()&&localEvaluations<perSet){improving=false;
          for(let i=0;i<weights.length;i++){if(candidate.holdings[i].locked)continue;
            for(let j=0;j<weights.length;j++){if(i===j||candidate.holdings[j].locked||weights[i]-step<1e-8||weights[j]+step>cap+1e-10)continue;
              const trial:number[]=[...weights];trial[i]-=step;trial[j]+=step;const result=evaluate(trial);if(!result)break;
              if(result.penalty<current.penalty-1e-12||(Math.abs(result.penalty-current.penalty)<1e-12&&result.secondary[strategy]<current.secondary[strategy]-1e-12)){weights=trial;current=result;improving=true;}
            }
          }
        }
      }
    }
    onProgress?.({evaluations,candidateSets:sets,elapsedMs:Date.now()-started,feasible:best[0].length>0});
    if(localEvaluations>=perSet)budgetExhausted=true;
  }
  const solutions:SolverSolution[]=[];const used=new Set<string>();for(let k=0;k<3;k++){const selected=best[k].find(s=>{const key=s.holdings.map(keyOf).join(';')+s.weights.map(w=>w.toFixed(9)).join(';');if(used.has(key))return false;used.add(key);return true;});if(selected)solutions.push(selected);}
  return {solutions,diagnostics:{evaluations,candidateSets:sets,elapsedMs:Date.now()-started,budgetExhausted,largestRetained,limits,missingSymbols:[...missing],globalOptimalityProven:false as const},outcome:solutions.length?'found' as const:budgetExhausted?'budget_exhausted' as const:'no_candidate_found' as const};
}
