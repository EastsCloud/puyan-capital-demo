import {describe,it,expect} from 'vitest';
import {capmTargetBeta} from '@isater/domain';
import {backtestCalculation} from '../src/calculation-evidence.js';
import type {PriceSeries} from '../src/market-history.js';
const weeks=['2026-01-05','2026-01-12','2026-01-19','2026-01-26'];
const series=(symbol:string,values:number[]):PriceSeries=>({symbol,currency:'USD',exchange:'TEST',sourceName:'EODHD',sourceUrl:'https://example.com',points:values.map((value,index)=>({value,date:weeks[index],week:weeks[index]}))});
describe('independently reproducible return and beta evidence',()=>{
 it('matches a hand-calculated two-times-market example and retains exact input prices',()=>{
  const stock=series('TEST',[100,120,96,134.4]),market=series('INDEX',[100,110,99,118.8]);
  const result=backtestCalculation([{data:stock,weight:1}],[{data:market,weight:1}],weeks);
  expect(result.beta).toBeCloseTo(2,12);expect(result.cumulativeReturn).toBeCloseTo(.344,12);
  expect(result.wealth).toBeCloseTo(1.344,12);expect(result.annualizedReturn).toBeCloseTo(Math.pow(1.344,52/3)-1,6);
  expect(result.sampleCovariance/result.sampleBenchmarkVariance).toBeCloseTo(2,12);
  expect(result.intervals.map(item=>item.portfolioReturn)).toEqual(expect.arrayContaining([expect.closeTo(.2),expect.closeTo(-.2),expect.closeTo(.4)]));
  stock.points[0].value=999;expect(result.inputs[0].prices[0].value).toBe(100);
 });
 it('discloses calendar gaps and a separate calendar CAGR without replacing the stored observation model',()=>{
  const dates=[...weeks.slice(0,3),'2026-02-02'];
  const stock=series('TEST',[100,120,96,134.4]),market=series('INDEX',[100,110,99,118.8]);
  for(const data of [stock,market])data.points[3]={...data.points[3],week:dates[3],date:dates[3]};
  const result=backtestCalculation([{data:stock,weight:1}],[{data:market,weight:1}],dates);
  expect(result.hasCalendarGaps).toBe(true);expect(result.elapsedWeeks).toBe(4);
  expect(result.calendarAnnualizedReturn).toBeCloseTo(Math.pow(1.344,13)-1,9);
  expect(result.annualizationExponent).toBeCloseTo(52/3);
 });
 it('shows the two independent reasons for target beta of one and the minimum-premium adjustment',()=>{
  const unchanged=capmTargetBeta(.122,.122,.045);expect(unchanged.beta).toBeCloseTo(1);expect(unchanged.adjustedForLowMarketRiskPremium).toBe(false);
  const adjusted=capmTargetBeta(-.02,-.03,.045);expect(adjusted.beta).toBeCloseTo(1);expect(adjusted.adjustedForNonPositiveExcessReturn).toBe(true);expect(adjusted.adjustedForLowMarketRiskPremium).toBe(true);
  expect(capmTargetBeta(.0479,.0479,.045).beta).toBeCloseTo(.58,12);
 });
});
