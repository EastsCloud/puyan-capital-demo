import { createHash } from 'node:crypto';
import type { HistoryReport, PriceSeries } from './market-history.js';

export const SHORT_HISTORY_TECHNICAL_MINIMUM = 3;
export const SHORT_HISTORY_WARNING = 'Short historical sample: annualized return, beta and drawdown may be unstable and do not establish a full three-year record. Normal risk controls and committee approval still apply.';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export function businessFingerprint(context: { proposal: { rows: any[] }; targets: unknown; policy: unknown; sleeveBenchmarkSymbols: unknown; holdingSymbols: any[] }): string {
  const value = { proposalId: context.proposal.rows[0].id, version: Number(context.proposal.rows[0].version), targets: context.targets, policy: context.policy,
    benchmarks: context.sleeveBenchmarkSymbols, holdings: context.holdingSymbols.map(item=>({ticker:item.ticker,market:item.market,exchange:item.exchange_code,sleeve:item.sleeve,style:item.style,weight:Number(item.weight),locked:Boolean(item.locked)})).sort((a,b)=>`${a.market}:${a.ticker}`.localeCompare(`${b.market}:${b.ticker}`)) };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function commonHistoryWeeks(series: PriceSeries[]): string[] {
  if (!series.length) return [];
  const sets = series.map(item => new Set(item.points.map(point => point.week)));
  return [...sets[0]].filter(week => sets.every(set => set.has(week))).sort();
}
export function optimizationHistoryWeeks(series: PriceSeries[], confirmedWeeks: string[] | null): string[] {
  const common = commonHistoryWeeks(series);
  if (!confirmedWeeks) return common;
  const available = new Set(common);
  return confirmedWeeks.every(week => available.has(week)) ? [...confirmedWeeks] : [];
}
export function shortHistoryOption(report: HistoryReport, series: PriceSeries[], proposalId: string, policy: unknown) {
  const usedWeeks = commonHistoryWeeks(series);
  const unavailable = report.coverage.some(item => item.status === 'unavailable');
  const eligible = !report.ready && !unavailable && report.issues.every(item => ['short_history', 'aligned_history'].includes(item.code)) && usedWeeks.length >= SHORT_HISTORY_TECHNICAL_MINIMUM;
  const coverageFingerprint = createHash('sha256').update(JSON.stringify({ proposalId, policy, methodology: report.methodology, series: [...series].sort((a,b) => a.symbol.localeCompare(b.symbol)).map(item => ({ symbol: item.symbol, provider: item.sourceName, points: item.points })) })).digest('hex');
  return { eligible, proposedPortfolioVersionId: proposalId, coverageFingerprint, snapshotId: null as string | null, expiresAt: null as string | null, commonWeeks: usedWeeks.length, firstWeek: usedWeeks[0] ?? null, lastWeek: usedWeeks.at(-1) ?? null, technicalMinimum: SHORT_HISTORY_TECHNICAL_MINIMUM, warning: SHORT_HISTORY_WARNING, blockedReason: report.ready ? 'Standard history already meets the minimum' : unavailable ? 'One or more instruments have no usable real prices' : usedWeeks.length < SHORT_HISTORY_TECHNICAL_MINIMUM ? 'Fewer than three common weekly price observations; insufficient returns to calculate beta' : null };
}
