import { describe, expect, it, vi } from 'vitest';
import { chooseCachedSeries, collectHistoricalSeries, exchangeLocalDate, fetchYahooSeries, historyReport, safeHistoryReason, weeklyCloses, type PriceSeries } from '../src/market-history.js';
import { listingExchangeMatches, normalizeSecurityIdentity } from '../src/security-identity.js';

const asOf = new Date('2026-10-13T12:00:00Z');
function series(symbol: string, count: number, provider: PriceSeries['sourceName'] = 'EODHD'): PriceSeries {
  const points = Array.from({length:count}, (_, index) => { const date = new Date('2023-01-06T00:00:00Z'); date.setUTCDate(date.getUTCDate()+index*7); const raw=date.toISOString().slice(0,10); return {date:raw,week:raw,value:100+index}; });
  return {symbol,points,sourceName:provider,sourceUrl:'https://example.com/history',currency:'USD',exchange:'NMS'};
}
describe('complete-week history and provider diagnostics', () => {
  it('deduplicates cached weeks and chooses one complete provider instead of splicing histories', () => {
    const primary=series('A',72).points.map(point=>({observation_date:point.date,value:point.value,source_name:'EODHD'}));
    const fallback=series('A',150).points.map(point=>({observation_date:point.date,value:point.value,source_name:'Yahoo Finance chart'}));
    const result=chooseCachedSeries('A',[...primary,...fallback],asOf);
    expect(result?.sourceName).toBe('Yahoo Finance chart');expect(result?.points).toHaveLength(150);
    expect(chooseCachedSeries('A',[...primary,...primary],asOf)).toBeNull();
  });
  it('converts Japanese Sunday UTC timestamps to the correct local Monday', () => {
    const timestamp=Date.parse('2026-10-11T15:00:00Z')/1000;
    expect(exchangeLocalDate(timestamp,'Asia/Tokyo')).toBe('2026-10-12');
    expect(exchangeLocalDate(timestamp,'America/New_York')).toBe('2026-10-11');
  });
  it('takes the last actual daily close in each completed week and excludes the current partial week', () => {
    const result=weeklyCloses([{date:'2026-10-05',value:10},{date:'2026-10-09',value:15},{date:'2026-10-12',value:30},{date:'2026-10-08',value:12}],asOf);
    expect(result).toEqual([{date:'2026-10-09',week:'2026-10-05',value:15}]);
  });
  it('fetches Yahoo daily adjusted prices and uses exchange-local dates', async () => {
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Tokyo',exchangeName:'JPX'},timestamp:[Date.parse('2026-10-04T15:00:00Z')/1000,Date.parse('2026-10-08T15:00:00Z')/1000],indicators:{adjclose:[{adjclose:[20,25]}]}}]}})));
    const result=await fetchYahooSeries('8035.T',{fetcher,asOf,allowShort:true});
    expect(String(fetcher.mock.calls[0][0])).toContain('interval=1d');
    expect(result.points).toEqual([{date:'2026-10-09',week:'2026-10-05',value:25}]);
    await expect(fetchYahooSeries('8035.T',{fetcher,asOf})).rejects.toThrow('at least 100');
  });
  it('collects all short-history names without wasting a fallback on valid short data', async () => {
    const eodhd=vi.fn(async(_token:string,_provider:string,symbol:string)=>series(symbol,symbol==='CRCL'?72:88));
    const yahoo=vi.fn(async(symbol:string)=>series(symbol,150,'Yahoo Finance chart'));
    const result=await collectHistoricalSeries([{symbol:'CRCL',eodhdSymbol:'CRCL.US'},{symbol:'SNDK',eodhdSymbol:'SNDK.US'}],'secret',{eodhd,yahoo});
    expect(result.coverage.map(item=>item.status)).toEqual(['short_history','short_history']);
    expect(yahoo).not.toHaveBeenCalled();
    const report=historyReport(result,[],true);
    expect(report.ready).toBe(false);expect(report.issues.map(item=>item.symbol)).toEqual(['CRCL','SNDK']);
  });
  it('uses and labels the Yahoo path for Japan without requesting a nonexistent EODHD listing', async () => {
    const eodhd=vi.fn(async()=>series('8035.T',150));const yahoo=vi.fn(async()=>series('8035.T',150,'Yahoo Finance chart'));
    const result=await collectHistoricalSeries([{symbol:'8035.T',eodhdSymbol:'8035.TSE',market:'JP'}],'secret',{eodhd,yahoo});
    expect(eodhd).not.toHaveBeenCalled();expect(result.coverage[0]).toMatchObject({provider:'Yahoo Finance chart',status:'ready'});expect(result.coverage[0].fallbackReason).toContain('Tokyo');
  });
  it('keeps both provider failures and never includes credentials in diagnostics', async () => {
    const eodhd=vi.fn(async()=>{throw new Error('api_token=secret EODHD unavailable')});const yahoo=vi.fn(async()=>{throw new Error('Yahoo HTTP 429')});
    const result=await collectHistoricalSeries([{symbol:'BAD',eodhdSymbol:'BAD.US'}],'secret',{eodhd,yahoo});
    expect(result.coverage[0].reason).toContain('Yahoo HTTP 429');expect(result.coverage[0].reason).not.toContain('secret');
    expect(safeHistoryReason(new Error('api_token=other-token'))).not.toContain('other-token');
  });
  it('requires aligned history even when each individual series has 100 weeks', () => {
    const a=series('A',150);const b=series('B',150);b.points=b.points.map(point=>({...point,week:'other-'+point.week}));
    const report=historyReport({series:[a,b],coverage:[]},[{sleeve:'us',symbols:['A','B']}],false);
    expect(report.ready).toBe(false);expect(report.sleeves[0].commonWeeks).toBe(0);
  });
  it('normalizes market identities and detects definite listing venue mismatches', () => {
    expect(normalizeSecurityIdentity('5','HKEX')).toMatchObject({ticker:'0005',market:'HK'});
    expect(()=>normalizeSecurityIdentity('AAPL.US','NASDAQ')).toThrow('suffix');
    expect(listingExchangeMatches('NASDAQ','NYQ')).toBe(false);expect(listingExchangeMatches('NYSE','NYQ')).toBe(true);expect(listingExchangeMatches('NASDAQ','US')).toBeNull();
  });
});
