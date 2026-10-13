import { describe, expect, it } from 'vitest';
import { commonHistoryWeeks, optimizationHistoryWeeks, shortHistoryOption } from '../src/short-history.js';
import { chooseCachedSeries, historyReport, type PriceSeries } from '../src/market-history.js';

const series = (symbol: string, weeks: string[]): PriceSeries => ({ symbol, sourceName:'EODHD', sourceUrl:'https://example.com', currency:'USD', exchange:'US', points:weeks.map((week,index)=>({date:week,week,value:100+index})) });
describe('explicit short-history window', () => {
  const a=series('A',['2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
  const b=series('B',['2026-09-14','2026-09-21','2026-09-28','2026-10-05']);
  const report=historyReport({series:[a,b],coverage:[a,b].map(item=>({symbol:item.symbol,providerSymbol:item.symbol,provider:'EODHD',observations:4,firstDate:item.points[0].date,lastDate:item.points.at(-1)!.date,status:'short_history',reason:null,fallbackReason:null}))},[{sleeve:'us',symbols:['A','B']}],false);
  it('intersects all real-price and benchmark weeks and never extends or fills a sample', () => {
    expect(commonHistoryWeeks([a,b])).toEqual(['2026-09-14','2026-09-21','2026-09-28']);
    expect(shortHistoryOption(report,[a,b],'proposal',{})).toMatchObject({eligible:true,commonWeeks:3,firstWeek:'2026-09-14',lastWeek:'2026-09-28'});
    expect(shortHistoryOption(report,[a,series('C',['2026-09-21','2026-09-28'])],'proposal',{}).eligible).toBe(false);
  });
  it('binds consent to exact prices, proposal and policy but not fetch ordering', () => {
    const original=shortHistoryOption(report,[a,b],'proposal',{beta:0.05}).coverageFingerprint;
    expect(shortHistoryOption(report,[b,a],'proposal',{beta:0.05}).coverageFingerprint).toBe(original);
    expect(shortHistoryOption(report,[a,b],'other',{beta:0.05}).coverageFingerprint).not.toBe(original);
    expect(shortHistoryOption(report,[a,b],'proposal',{beta:0.1}).coverageFingerprint).not.toBe(original);
    const changed={...a,points:a.points.map(point=>({...point,value:point.value+1}))};
    expect(shortHistoryOption(report,[changed,b],'proposal',{beta:0.05}).coverageFingerprint).not.toBe(original);
  });
  it('keeps the entire accepted window during optimization and rejects a shorter replacement', () => {
    const weeks=commonHistoryWeeks([a,b]);
    expect(optimizationHistoryWeeks([a,b],weeks)).toEqual(weeks);
    expect(optimizationHistoryWeeks([a,series('Replacement',weeks.slice(1))],weeks)).toEqual([]);
    expect(optimizationHistoryWeeks([a,b],null)).toEqual(weeks);
  });
  it('does not enable short cache reuse by default', () => {
    const rows=a.points.map(point=>({observation_date:point.date,value:point.value,source_name:'EODHD'}));
    expect(chooseCachedSeries('A',rows,new Date('2026-10-13'))).toBeNull();
    expect(chooseCachedSeries('A',rows,new Date('2026-10-13'),3)?.points).toHaveLength(4);
  });
});
