import { describe,expect,it } from 'vitest';
import { solveBounded,replacementCandidateSets,type SolverInput,type OptimizerHolding } from '../src/optimizer-search.js';
import { runOptimizerWorker } from '../src/optimizer-runner.js';

export function fixture(count=6):SolverInput {
  const weeks=Array.from({length:156},(_,i)=>{const d=new Date('2023-01-02');d.setUTCDate(d.getUTCDate()+7*i);return d.toISOString().slice(0,10);});
  const holdings:OptimizerHolding[]=Array.from({length:count},(_,i)=>({ticker:`S${i}`,exchangeCode:'NYSE',market:'US',sleeve:'us',style:i<count/2?'growth':'value',weight:1/count,locked:i===0}));
  const series=[...holdings.map(h=>h.ticker),'BENCH'].map(symbol=>({symbol,sourceName:'EODHD' as const,sourceUrl:'https://example.com/test',currency:'USD',exchange:'US',points:weeks.map((week,i)=>({date:week,week,value:100+i*.2+Math.sin(i)*.8}))}));
  return {holdings,universe:[],series,weeks,benchmarks:[{symbol:'BENCH',weight:1}],target:{targetReturn:.03,targetBeta:1,maximumDrawdownLimit:-.2,capm:{beta:1,betaControlActive:true,effectiveTargetReturn:.03,effectiveMarketReturn:.03,riskFreeRate:0,adjustedForLowMarketRiskPremium:false,adjustedForNonPositiveExcessReturn:false}},tolerance:{betaRelative:.05,returnShortfall:.05,returnExcessReview:.5,drawdownExcess:.1},maxWeightPct:35,budget:{maxEvaluations:2000,maxMillis:2000,maxCandidateSets:8}};
}
describe('bounded optimizer',()=>{
  it.each([6,12,20])('finds valid weights for %i stocks while retaining no more than nine candidates',count=>{
    const input=fixture(count);const result=solveBounded(input);expect(result.solutions.length).toBeGreaterThan(0);expect(result.solutions.length).toBeLessThanOrEqual(3);expect(result.diagnostics.largestRetained).toBeLessThanOrEqual(9);expect(result.diagnostics.evaluations).toBeLessThanOrEqual(2000);
    for(const solution of result.solutions){expect(solution.weights.reduce((s,w)=>s+w,0)).toBeCloseTo(1,9);expect(solution.weights.every(w=>w>0&&w<=.35+1e-10)).toBe(true);expect(solution.weights[0]).toBe(input.holdings[0].weight);expect(Object.values(solution.controls).every(c=>c.hardPass)).toBe(true);}
  });
  it('caps lazy replacement sets and never removes locked names or changes style counts',()=>{
    const input=fixture();const universe=Array.from({length:200},(_,i)=>({...input.holdings[i%6],ticker:`ALT${i}`,locked:false,weight:0}));const sets=[...replacementCandidateSets(input.holdings,universe,10,2)];expect(sets).toHaveLength(10);expect(sets.every(s=>s.holdings.some(h=>h.ticker==='S0'&&h.locked))).toBe(true);expect(sets.every(s=>s.holdings.filter(h=>h.style==='growth').length===3)).toBe(true);
  });
  it('does not claim mathematical infeasibility or produce a passing plan when the budget finds none',()=>{
    const input=fixture();input.target.targetReturn=10;input.budget={maxEvaluations:20,maxMillis:1000,maxCandidateSets:1};const result=solveBounded(input);expect(result.solutions).toEqual([]);expect(result.diagnostics.evaluations).toBeLessThanOrEqual(20);expect(result.diagnostics.globalOptimalityProven).toBe(false);
  });
  it('can find a bounded one-stock replacement without relaxing risk controls',()=>{
    const input=fixture(4);input.holdings.forEach(h=>h.locked=false);input.target.targetReturn=.04;
    for(const s of input.series.filter(s=>s.symbol!=='BENCH'))s.points=s.points.map(p=>({...p,value:100}));
    const alt={...input.holdings[0],ticker:'ALT',weight:0};input.universe=[alt];input.series.push({...input.series.at(-1)!,symbol:'ALT',points:input.weeks.map((week,i)=>({date:week,week,value:100*Math.pow(1.006,i)}))});
    input.budget={maxEvaluations:6000,maxMillis:2000,maxCandidateSets:4};const result=solveBounded(input);expect(result.solutions.length).toBeGreaterThan(0);expect(result.solutions.every(s=>s.tickerReplacements===1&&s.holdings.some(h=>h.ticker==='ALT'))).toBe(true);
  });
  it('runs the actual CPU worker without loading application database code',async()=>{
    const input=fixture();input.budget={maxEvaluations:1000,maxMillis:1000,maxCandidateSets:1};const result=await runOptimizerWorker(input,new AbortController().signal);expect(result.solutions.length).toBeGreaterThan(0);
  },15000);
  it('terminates a cancelled worker',async()=>{const controller=new AbortController();controller.abort();await expect(runOptimizerWorker(fixture(),controller.signal)).rejects.toThrow('cancelled');});
});
