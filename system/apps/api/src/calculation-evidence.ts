import {annualizedReturn, calculateBeta, weightedReturns} from './backtest-math.js';
import type {PriceSeries} from './market-history.js';

/** Evidence is frozen with the result, never reconstructed from today's mutable cache. */
export function backtestCalculation(securities:Array<{data:PriceSeries;weight:number}>, benchmarks:Array<{data:PriceSeries;weight:number}>, weeks:string[]) {
  if(weeks.length<3)throw new Error('At least three aligned prices are required');
  const portfolio=weightedReturns(securities,weeks), benchmark=weightedReturns(benchmarks,weeks);
  const n=portfolio.length;
  const portfolioMean=portfolio.reduce((sum,value)=>sum+value,0)/n;
  const benchmarkMean=benchmark.reduce((sum,value)=>sum+value,0)/n;
  const covarianceSum=portfolio.reduce((sum,value,index)=>sum+(value-portfolioMean)*(benchmark[index]-benchmarkMean),0);
  const varianceSum=benchmark.reduce((sum,value)=>sum+(value-benchmarkMean)**2,0);
  const wealth=portfolio.reduce((product,value)=>product*(1+value),1);
  const elapsedWeeks=(Date.parse(weeks.at(-1)!)-Date.parse(weeks[0]))/(7*86400000);
  const inputs=[...securities.map(item=>({...item,kind:'security'})),...benchmarks.map(item=>({...item,kind:'benchmark'}))].map(item=>({
    kind:item.kind,symbol:item.data.symbol,weight:item.weight,provider:item.data.sourceName,sourceUrl:item.data.sourceUrl,
    prices:weeks.map(week=>{const point=item.data.points.find(point=>point.week===week)!;return {week,date:point.date,value:point.value};}),
  }));
  return {version:'return-beta-evidence-v1',returnMethod:'fixed_weights_rebalanced_each_observation_interval',
    annualizationMethod:'52_observation_intervals',betaMethod:'covariance_of_simple_returns_divided_by_benchmark_variance',
    observationCount:n,portfolioMean,benchmarkMean,covarianceSum,varianceSum,
    sampleCovariance:covarianceSum/(n-1),sampleBenchmarkVariance:varianceSum/(n-1),
    beta:calculateBeta(portfolio,benchmark),wealth,cumulativeReturn:wealth-1,
    annualizedReturn:annualizedReturn(portfolio),annualizationExponent:52/n,elapsedWeeks,
    calendarAnnualizedReturn:Math.pow(wealth,52/elapsedWeeks)-1,
    hasCalendarGaps:weeks.some((week,index)=>index>0&&Date.parse(week)-Date.parse(weeks[index-1])!==7*86400000),inputs,
    intervals:portfolio.map((value,index)=>({from:weeks[index],to:weeks[index+1],
      elapsedWeeks:(Date.parse(weeks[index+1])-Date.parse(weeks[index]))/(7*86400000),
      portfolioReturn:value,benchmarkReturn:benchmark[index],
      covarianceTerm:(value-portfolioMean)*(benchmark[index]-benchmarkMean),varianceTerm:(benchmark[index]-benchmarkMean)**2})),
  };
}
