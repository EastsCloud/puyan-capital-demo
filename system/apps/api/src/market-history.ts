import { fetchEodhdPrices } from './eodhd-client.js';

export const MIN_BACKTEST_WEEKS = 100;
export interface PricePoint { date: string; week: string; value: number }
export interface PriceSeries {
  symbol: string; currency: string; exchange: string; points: PricePoint[];
  sourceUrl: string; sourceName: 'EODHD' | 'Yahoo Finance chart'; fallbackReason?: string;
}
export interface HistoryRequest { symbol: string; eodhdSymbol: string; market?: string }
export interface HistoryCoverage {
  symbol: string; providerSymbol: string; provider: string; observations: number;
  firstDate: string | null; lastDate: string | null; status: 'ready' | 'short_history' | 'unavailable';
  reason: string | null; fallbackReason: string | null;
}
export interface HistoryReport {
  ready: boolean; minimumWeeklyObservations: number; checkedAt: string;
  methodology: string; coverage: HistoryCoverage[];
  sleeves: Array<{ sleeve: string; commonWeeks: number }>;
  issues: Array<{ symbol: string; code: string; message: string }>;
}
type HistoryOptions = { allowShort?: boolean; asOf?: Date; fetcher?: typeof fetch };
export function weekKey(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function yahooSymbol(ticker: string, market: string): string {
  return market === 'JP' ? `${ticker}.T` : market === 'HK' ? `${ticker}.HK`
    : market === 'CN_A' ? `${ticker}.${ticker.startsWith('6') ? 'SS' : 'SZ'}` : ticker;
}
function dateWeek(date: string) { return weekKey(Date.parse(`${date}T00:00:00Z`) / 1000); }
export function weeklyCloses(points: Array<{ date: string; value: number }>, asOf = new Date()): PricePoint[] {
  // Both providers use actual exchange-local DAILY dates. Never treat Yahoo's
  // Sunday UTC weekly timestamp as the previous trading week, or mix partial weeks.
  const currentWeek = dateWeek(asOf.toISOString().slice(0, 10));
  const weeks = new Map<string, PricePoint>();
  for (const point of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(Date.parse(point.date)) || !Number.isFinite(point.value) || point.value <= 0) continue;
    const week = dateWeek(point.date);
    if (week >= currentWeek) continue;
    weeks.set(week, { ...point, week });
  }
  return [...weeks.values()];
}
function windowDates(asOf: Date) {
  const from = new Date(asOf); from.setUTCFullYear(from.getUTCFullYear() - 3); from.setUTCDate(from.getUTCDate() - 14);
  return { from: from.toISOString().slice(0, 10), to: asOf.toISOString().slice(0, 10) };
}
function enforceLength(series: PriceSeries, allowShort?: boolean) {
  if (!allowShort && series.points.length < MIN_BACKTEST_WEEKS) throw Object.assign(new Error(`${series.symbol}: ${series.points.length} complete weekly observations; at least ${MIN_BACKTEST_WEEKS} required`), { statusCode: 422 });
  return series;
}
export function exchangeLocalDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp * 1000));
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export async function fetchYahooSeries(symbol: string, options: HistoryOptions = {}): Promise<PriceSeries> {
  const asOf = options.asOf ?? new Date(); const dates = windowDates(asOf);
  const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(Date.parse(`${dates.from}T00:00:00Z`) / 1000));
  url.searchParams.set('period2', String(Date.parse(`${dates.to}T00:00:00Z`) / 1000 + 86400));
  url.searchParams.set('interval', '1d'); url.searchParams.set('events', 'history'); url.searchParams.set('includeAdjustedClose', 'true');
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await (options.fetcher ?? fetch)(url, { headers: { 'User-Agent': 'Mozilla/5.0 Isater/0.1' }, signal: AbortSignal.timeout(25000) });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 2) throw new Error(`Yahoo ${symbol}: HTTP ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
  }
  const body = await response!.json() as any; const item = body.chart?.result?.[0];
  if (!item?.timestamp?.length) throw new Error(`Yahoo ${symbol}: ${body.chart?.error?.description ?? 'empty history'}`);
  const timeZone = item.meta?.exchangeTimezoneName ?? (symbol.endsWith('.T') || symbol === '^N225' ? 'Asia/Tokyo' : symbol.endsWith('.HK') || symbol === '^HSI' ? 'Asia/Hong_Kong' : /\.(SS|SZ)$/.test(symbol) ? 'Asia/Shanghai' : 'America/New_York');
  const prices = item.indicators?.adjclose?.[0]?.adjclose ?? item.indicators?.quote?.[0]?.close ?? [];
  const daily = item.timestamp.flatMap((timestamp: number, index: number) => {
    const value = prices[index];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? [{ date: exchangeLocalDate(timestamp, timeZone), value }] : [];
  });
  const points = weeklyCloses(daily, asOf);
  if (!daily.length) throw new Error(`Yahoo ${symbol}: no usable prices`);
  return enforceLength({ symbol, currency: item.meta?.currency ?? '', exchange: item.meta?.exchangeName ?? '', points, sourceUrl: url.toString(), sourceName: 'Yahoo Finance chart' }, options.allowShort);
}
export async function fetchEodhdWeeklySeries(token: string, providerSymbol: string, canonicalSymbol: string, options: HistoryOptions = {}): Promise<PriceSeries> {
  if (canonicalSymbol.endsWith('.T')) throw new Error('Tokyo listings are not currently available from EODHD; Yahoo is the configured fallback');
  const asOf = options.asOf ?? new Date();
  const result = await fetchEodhdPrices(token, providerSymbol, { ...windowDates(asOf), period: 'd' }, options.fetcher);
  const points = weeklyCloses(result.points, asOf);
  return enforceLength({ symbol: canonicalSymbol, currency: '', exchange: providerSymbol.split('.').at(-1) ?? '', points, sourceUrl: result.sourceUrl, sourceName: 'EODHD' }, options.allowShort);
}
export function safeHistoryReason(error: unknown, token?: string | null): string {
  let text = error instanceof Error ? error.message : String(error);
  if (token) text = text.split(token).join('[redacted]');
  return text.replace(/api_token=[^&\s]+/gi, 'api_token=[redacted]').slice(0, 1000);
}
export function chooseCachedSeries(symbol: string, rows: Array<{ observation_date: string | Date; value: number | string; source_name: string; source_url?: string; currency?: string }>, asOf = new Date()): PriceSeries | null {
  // A cache may contain overlapping providers. Never count two prices in one
  // week twice, or splice providers into an apparently complete series.
  for (const provider of ['EODHD', 'Yahoo Finance chart'] as const) {
    const selected = rows.filter(row => row.source_name === provider);
    const points = weeklyCloses(selected.map(row => ({ date: row.observation_date instanceof Date ? row.observation_date.toISOString().slice(0, 10) : String(row.observation_date).slice(0, 10), value: Number(row.value) })), asOf);
    if (points.length >= MIN_BACKTEST_WEEKS) return { symbol, points, sourceName: provider, sourceUrl: selected[0].source_url ?? '', currency: selected[0].currency ?? '', exchange: '' };
  }
  return null;
}
export async function collectHistoricalSeries(requests: HistoryRequest[], token: string | null, fetchers = { eodhd: fetchEodhdWeeklySeries, yahoo: fetchYahooSeries }) {
  const series: PriceSeries[] = []; const coverage: HistoryCoverage[] = new Array(requests.length);
  let next = 0;
  const asOf = new Date();
  const worker = async () => { while (next < requests.length) {
    const index = next++; const request = requests[index]; let data: PriceSeries | undefined;
    let fallbackReason: string | null = request.market === 'JP' || request.symbol.endsWith('.T') ? 'Tokyo listings are not covered by the current EODHD connection; using Yahoo daily adjusted prices' : !token ? 'EODHD connection is not enabled; using Yahoo' : null;
    try {
      if (!fallbackReason && token) {
        try { data = await fetchers.eodhd(token, request.eodhdSymbol, request.symbol, { allowShort: true, asOf }); }
        catch (error) { fallbackReason = safeHistoryReason(error, token); }
      }
      if (!data) {
        data = await fetchers.yahoo(request.symbol, { allowShort: true, asOf });
        data.fallbackReason = fallbackReason ?? undefined;
      }
      series.push(data);
      coverage[index] = { symbol: request.symbol, providerSymbol: data.sourceName === 'EODHD' ? request.eodhdSymbol : request.symbol, provider: data.sourceName, observations: data.points.length, firstDate: data.points[0]?.date ?? null, lastDate: data.points.at(-1)?.date ?? null, status: data.points.length >= MIN_BACKTEST_WEEKS ? 'ready' : 'short_history', reason: null, fallbackReason };
    } catch (error) {
      coverage[index] = { symbol: request.symbol, providerSymbol: request.eodhdSymbol, provider: 'unavailable', observations: 0, firstDate: null, lastDate: null, status: 'unavailable', reason: [fallbackReason, safeHistoryReason(error, token)].filter(Boolean).join('; '), fallbackReason };
    }
  } };
  await Promise.all(Array.from({ length: Math.min(3, requests.length) }, worker));
  return { series, coverage };
}
export function historyReport(collected: Awaited<ReturnType<typeof collectHistoricalSeries>>, groups: Array<{ sleeve: string; symbols: string[] }>, zh: boolean): HistoryReport {
  const issues: HistoryReport['issues'] = collected.coverage.filter(item => item.status !== 'ready').map(item => ({ symbol: item.symbol, code: item.status, message: item.status === 'short_history'
    ? (zh ? `${item.symbol}：仅${item.observations}个完整周，至少需要${MIN_BACKTEST_WEEKS}个。` : `${item.symbol}: only ${item.observations} complete weeks; ${MIN_BACKTEST_WEEKS} required.`)
    : `${item.symbol}: ${item.reason}` }));
  const bySymbol = new Map(collected.series.map(item => [item.symbol, item]));
  const sleeves = groups.map(group => {
    const values = group.symbols.map(symbol => bySymbol.get(symbol));
    const commonWeeks = values.length && values.every(Boolean) ? values[0]!.points.filter(point => values.every(item => item!.points.some(other => other.week === point.week))).length : 0;
    if (commonWeeks < MIN_BACKTEST_WEEKS) issues.push({ symbol: group.sleeve, code: 'aligned_history', message: zh ? `${group.sleeve}：共同有效周数${commonWeeks}，至少需要${MIN_BACKTEST_WEEKS}。` : `${group.sleeve}: ${commonWeeks} aligned weeks; ${MIN_BACKTEST_WEEKS} required.` });
    return { sleeve: group.sleeve, commonWeeks };
  });
  return { ready: issues.length === 0, minimumWeeklyObservations: MIN_BACKTEST_WEEKS, checkedAt: new Date().toISOString(), methodology: 'exchange-local daily adjusted closes, last trading close per completed Monday-Sunday week; current partial week excluded', coverage: collected.coverage, sleeves, issues };
}
