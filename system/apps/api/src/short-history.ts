import { createHash } from 'node:crypto';
import type { HistoryReport, PriceSeries } from './market-history.js';

export const SHORT_HISTORY_TECHNICAL_MINIMUM = 3;
export const SHORT_HISTORY_WARNING = 'Short historical sample: annualized return, beta and drawdown may be unstable and do not establish a full three-year record. Normal risk controls and committee approval still apply.';
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
  return { eligible, proposedPortfolioVersionId: proposalId, coverageFingerprint, commonWeeks: usedWeeks.length, firstWeek: usedWeeks[0] ?? null, lastWeek: usedWeeks.at(-1) ?? null, technicalMinimum: SHORT_HISTORY_TECHNICAL_MINIMUM, warning: SHORT_HISTORY_WARNING, blockedReason: report.ready ? 'Standard history already meets the minimum' : unavailable ? 'One or more instruments have no usable real prices' : usedWeeks.length < SHORT_HISTORY_TECHNICAL_MINIMUM ? 'Fewer than three common weekly price observations; insufficient returns to calculate beta' : null };
}
