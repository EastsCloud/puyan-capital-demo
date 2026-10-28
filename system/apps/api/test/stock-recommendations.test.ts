import { describe, expect, it } from 'vitest';
import { buildStockRecommendation, type RecommendationSecurity } from '../src/stock-recommendations.js';
import { yahooSymbol, type PriceSeries } from '../src/market-history.js';

const asOf = new Date('2026-10-28T12:00:00Z');
const universe: RecommendationSecurity[] = ['us', 'developedNonUs', 'emerging'].flatMap((sleeve, s) =>
  ['growth', 'value'].flatMap(style => Array.from({ length: 4 }, (_, i) => ({
    id: `${sleeve}-${style}-${i}`, ticker: `${s}${style}${i}`, exchange_code: 'TEST',
    sleeve, style, market: ['US', 'JP', 'HK'][s],
  }))));
const series: PriceSeries[] = universe.map(item => {
  const i = Number(item.ticker.at(-1));
  const mean = [.008, .004, .001, .003][i], amplitude = [.05, .012, .002, .006][i];
  let value = 100;
  return { symbol: yahooSymbol(item.ticker, item.market), currency: 'USD', exchange: '',
    sourceName: 'Yahoo Finance chart', sourceUrl: 'https://example.com/prices',
    points: Array.from({ length: 157 }, (_, index) => {
      value *= 1 + mean + amplitude * Math.sin(index * 1.7);
      const date = new Date(Date.parse('2023-10-27') + index * 7 * 86400000).toISOString().slice(0, 10);
      const week = new Date(Date.parse(date) - 4 * 86400000).toISOString().slice(0, 10);
      return { date, week, value };
    }) };
});
const policy = { maxSingleSecurityWeightPct: 35, styleTickerMin: 2, styleTickerMax: 5, equityMarkets: ['US', 'JP', 'HK', 'CN_A'] };
const run = (scenario: 'bull' | 'bear' | 'balanced', override = {}) => buildStockRecommendation({ universe, series, policy, scenario, asOf, ...override });

describe('scenario-based catalogue stock screening', () => {
  it('changes selection and exposure for bull, bear and balanced using the same 24 candidates', () => {
    const bull = run('bull'), bear = run('bear'), balanced = run('balanced');
    for (const result of [bull, bear, balanced]) {
      expect(result.ready, result.issues.join(';')).toBe(true);
      expect(result.universeCount).toBe(24); expect(result.eligibleCount).toBe(24);
      expect(result.holdings).toHaveLength(12);
      for (const sleeve of ['us', 'developedNonUs', 'emerging']) {
        const holdings = result.holdings.filter(h => h.tickerUniverseId.startsWith(`${sleeve}-`));
        expect(holdings.reduce((sum, h) => sum + h.weight, 0)).toBeCloseTo(1, 10);
        expect(holdings.every(h => h.weight <= .35)).toBe(true);
        const growth = holdings.filter(h => h.tickerUniverseId.includes('growth')).reduce((sum, h) => sum + h.weight, 0);
        expect(growth).toBeCloseTo(result.profile.growthWeight);
      }
    }
    expect(bull.holdings.map(h => h.tickerUniverseId)).not.toEqual(bear.holdings.map(h => h.tickerUniverseId));
    expect(bull.holdings).not.toEqual(balanced.holdings);
    expect(bear.holdings).not.toEqual(balanced.holdings);
  });
  it('is independent of database row ordering and reports actual metrics and data provenance', () => {
    const expected = run('bull');
    expect(run('bull', { universe: [...universe].reverse(), series: [...series].reverse() }).holdings).toEqual(expected.holdings);
    expect(expected.candidates[0]).toMatchObject({ observations: 157, firstDate: '2023-10-27', lastDate: '2026-10-23', sourceName: 'Yahoo Finance chart' });
    expect(expected.candidates.every(item => Number.isFinite(item.score) && item.score >= 0 && item.score <= 1)).toBe(true);
  });
  it('allows overlapping names when the data ranks are tied instead of forcing replacements', () => {
    const tied = series.map(item => ({ ...item, points: series[0].points }));
    const bull = run('bull', { series: tied }), bear = run('bear', { series: tied });
    expect(bull.ready).toBe(true); expect(bear.ready).toBe(true);
    expect(bull.holdings.map(h => h.tickerUniverseId)).toEqual(bear.holdings.map(h => h.tickerUniverseId));
    expect(bull.holdings).not.toEqual(bear.holdings);
  });
  it('uses extra candidates in the other style when an asymmetric universe can meet the cap', () => {
    const asymmetric = universe.filter(item => item.style === 'value' || !item.id.endsWith('-3'));
    const result = run('bull', { universe: asymmetric, policy: { ...policy, maxSingleSecurityWeightPct: 17 } });
    expect(result.ready, result.issues.join(';')).toBe(true);
    expect(result.holdings).toHaveLength(18);
    expect(result.holdings.every(item => item.weight <= .17)).toBe(true);
  });
  it('honors snapshotted counts, rounding, maximum names and tighter single-name caps', () => {
    const capped = run('bull', { policy: { ...policy, maxSingleSecurityWeightPct: 17, styleTickerMin: 3 } });
    expect(capped.ready).toBe(true); expect(capped.holdings).toHaveLength(18);
    for (const sleeve of ['us', 'developedNonUs', 'emerging']) {
      const holdings = capped.holdings.filter(h => h.tickerUniverseId.startsWith(`${sleeve}-`));
      expect(holdings.reduce((sum, h) => sum + h.weight, 0)).toBeCloseTo(1, 10);
      expect(holdings.every(h => h.weight <= .17)).toBe(true);
    }
    const impossible = run('bear', { policy: { ...policy, maxSingleSecurityWeightPct: 10, styleTickerMax: 4 } });
    expect(impossible.ready).toBe(false); expect(impossible.holdings).toEqual([]);
  });
  it('blocks incomplete portfolios instead of returning alphabetical defaults', () => {
    const result = run('bull', { series: series.filter(item => !item.symbol.endsWith('.T')) });
    expect(result.ready).toBe(false); expect(result.holdings).toEqual([]);
    expect(result.excluded.filter(item => item.reason.includes('unavailable'))).toHaveLength(8);
    expect(result.issues.some(issue => issue.startsWith('developedNonUs'))).toBe(true);
  });
  it('excludes restricted markets, stale data and short histories', () => {
    const result = run('bear', { policy: { ...policy, equityMarkets: ['US', 'HK'] }, series: series.map((item, index) =>
      index === 0 ? { ...item, points: item.points.slice(0, 120) } : index === 1 ? { ...item, points: item.points.slice(-80) } : item) });
    expect(result.excluded.some(item => item.reason.includes('Stale'))).toBe(true);
    expect(result.excluded.some(item => item.reason.includes('Insufficient'))).toBe(true);
    expect(result.excluded.filter(item => item.reason.includes('Market outside'))).toHaveLength(8);
    expect(result.holdings).toEqual([]);
  });
  it('never fills missing weeks or includes incomplete current-week or future prices', () => {
    const missing = run('balanced', { series: series.map((item, index) => index === 0 ? { ...item, points: item.points.filter((_, i) => i !== 50) } : item) });
    expect(missing.ready).toBe(true);
    expect(missing.candidates[0].observations).toBe(156);
    expect(missing.candidates[0].annualizedReturn).toBeCloseTo(run('balanced').candidates[0].annualizedReturn, 10);
    const future = run('balanced', { series: series.map(item => ({ ...item, points: [...item.points,
      { date: '2026-10-28', week: '2026-10-26', value: 1e9 }, { date: '2027-01-01', week: '2026-12-28', value: 1e10 }] })) });
    expect(future.holdings).toEqual(run('balanced').holdings);
  });
  it('measures momentum by calendar weeks across long market holidays and discloses the actual interval', () => {
    const closed = run('bull', { series: series.map(item => ({ ...item, points: item.points.filter((_, i) => i !== 130) })) });
    expect(closed.ready).toBe(true);
    expect(closed.candidates.every(item => item.momentumWeeks === 27)).toBe(true);
    expect(closed.candidates[0].momentum).toBeCloseTo(series[0].points[156].value / series[0].points[129].value - 1);
    expect(closed.candidates.every(item => Number.isFinite(item.volatility))).toBe(true);
  });
});
