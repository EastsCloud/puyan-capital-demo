import { maximumDrawdown } from './backtest-math.js';
import { MIN_BACKTEST_WEEKS, weeklyCloses, yahooSymbol, type PriceSeries } from './market-history.js';

export interface RecommendationSecurity {
  id: string; ticker: string; exchange_code: string; market: string; sleeve: string; style: string;
}
export interface RecommendationPolicy {
  maxSingleSecurityWeightPct: number; styleTickerMin: number; styleTickerMax: number; equityMarkets: string[];
}
export type RecommendationScenario = 'bull' | 'balanced' | 'bear';
const sleeves = ['us', 'developedNonUs', 'emerging'] as const;
// Versioned, transparent screening heuristic. Portfolio controls still require a backtest.
export const screeningProfiles = {
  bull: { growthWeight: .6, return: .45, momentum: .3, volatility: .15, drawdown: .1 },
  balanced: { growthWeight: .5, return: .3, momentum: .1, volatility: .3, drawdown: .3 },
  bear: { growthWeight: .4, return: .1, momentum: 0, volatility: .45, drawdown: .45 },
} as const;

export function buildStockRecommendation(input: {
  universe: RecommendationSecurity[]; policy: RecommendationPolicy; scenario: RecommendationScenario;
  series: PriceSeries[]; asOf?: Date;
}) {
  const asOf = input.asOf ?? new Date();
  const profile = screeningProfiles[input.scenario];
  // Match the database's eight decimal places, including the single-name ceiling.
  const cap = Math.floor(input.policy.maxSingleSecurityWeightPct * 1_000_000) / 100_000_000;
  const minimum = input.policy.styleTickerMin, maximum = input.policy.styleTickerMax;
  const issues: string[] = [];
  const excluded: Array<{ tickerUniverseId: string; ticker: string; reason: string }> = [];
  const candidates: Array<RecommendationSecurity & {
    annualizedReturn: number; momentum: number; momentumWeeks: number; volatility: number; maximumDrawdown: number;
    score: number; observations: number; firstDate: string; lastDate: string;
    sourceName: string; sourceUrl: string; fallbackReason: string | null;
  }> = [];
  const holdings: Array<{ tickerUniverseId: string; weight: number }> = [];
  const bySymbol = new Map(input.series.map(item => [item.symbol, item]));
  const validPolicy = Number.isFinite(cap) && cap > 0 && cap <= 1 && Number.isInteger(minimum)
    && Number.isInteger(maximum) && minimum >= 1 && maximum >= minimum;
  if (!validPolicy) issues.push('Invalid portfolio construction policy / 组合构建参数无效');

  for (const sleeve of sleeves) {
    const usable: Array<{ security: RecommendationSecurity; data: PriceSeries }> = [];
    for (const security of input.universe.filter(item => item.sleeve === sleeve)) {
      let reason: string | null = null;
      const data = bySymbol.get(yahooSymbol(security.ticker, security.market));
      const points = data ? weeklyCloses(data.points, asOf).slice(-157) : [];
      if (!input.policy.equityMarkets.includes(security.market)) reason = 'Market outside policy / 市场未获准';
      else if (!['growth', 'value'].includes(security.style)) reason = 'Unsupported style / 风格无效';
      else if (!data || !points.length) reason = 'Price data unavailable / 无可用行情';
      else if (points.length < MIN_BACKTEST_WEEKS) reason = `Insufficient history / 历史不足 ${MIN_BACKTEST_WEEKS} 周 (${points.length})`;
      else if (asOf.getTime() - Date.parse(points.at(-1)!.date) > 21 * 86400000) reason = 'Stale prices (>21 days) / 行情超过21天未更新';
      if (reason) excluded.push({ tickerUniverseId: security.id, ticker: security.ticker, reason });
      else usable.push({ security, data: { ...data!, points } });
    }
    // Rank on the same dates within each sleeve; missing weeks are never forward-filled.
    const common = usable.length ? usable[0].data.points.map(point => point.week).filter(week =>
      usable.every(item => item.data.points.some(point => point.week === week))) : [];
    if (common.length < MIN_BACKTEST_WEEKS) {
      issues.push(`${sleeve}: insufficient common history / 共同周历史不足 (${common.length})`);
      continue;
    }
    const group = usable.map(({ security, data }) => {
      const points = new Map(data.points.map(point => [point.week, point]));
      const prices = common.map(week => points.get(week)!.value);
      const returns = prices.slice(1).map((price, index) => price / prices[index] - 1);
      const elapsed = common.slice(1).map((week, index) => (Date.parse(week) - Date.parse(common[index])) / (7 * 86400000));
      const totalWeeks = elapsed.reduce((sum, weeks) => sum + weeks, 0);
      const logReturns = returns.map(value => Math.log1p(value));
      const drift = logReturns.reduce((sum, value) => sum + value, 0) / totalWeeks;
      // Closed-market weeks stay absent. Use elapsed time so a holiday interval is
      // never treated as a one-week return, or silently filled with synthetic prices.
      const variance = logReturns.reduce((sum, value, index) => sum + (value - drift * elapsed[index]) ** 2 / elapsed[index], 0) / (returns.length - 1);
      const lastWeek = Date.parse(common.at(-1)!);
      let momentumIndex = 0;
      common.forEach((week, index) => { if (Date.parse(week) <= lastWeek - 26 * 7 * 86400000) momentumIndex = index; });
      return { ...security, annualizedReturn: Math.expm1(drift * 52), momentum: prices.at(-1)! / prices[momentumIndex] - 1,
        momentumWeeks: (lastWeek - Date.parse(common[momentumIndex])) / (7 * 86400000),
        volatility: Math.sqrt(variance * 52),
        maximumDrawdown: maximumDrawdown(returns), score: 0, observations: common.length,
        firstDate: points.get(common[0])!.date, lastDate: points.get(common.at(-1)!)!.date,
        sourceName: data.sourceName, sourceUrl: data.sourceUrl, fallbackReason: data.fallbackReason ?? null };
    });
    // Percentile ranks make all four metrics comparable. Ties receive equal scores.
    const rank = (value: number, values: number[], higher: boolean) => values.length <= 1 ? .5 :
      values.reduce((sum, other) => sum + (value === other ? .5 : (higher ? value > other : value < other) ? 1 : 0), -.5) / (values.length - 1);
    for (const style of ['growth', 'value']) {
      const peers = group.filter(item => item.style === style);
      for (const candidate of peers) candidate.score =
        profile.return * rank(candidate.annualizedReturn, peers.map(item => item.annualizedReturn), true) +
        profile.momentum * rank(candidate.momentum, peers.map(item => item.momentum), true) +
        profile.volatility * rank(candidate.volatility, peers.map(item => item.volatility), false) +
        profile.drawdown * rank(candidate.maximumDrawdown, peers.map(item => item.maximumDrawdown), true);
    }
    candidates.push(...group);
    if (!validPolicy) continue;
    // Increase the name count if the single-security cap requires more names.
    const ranked = ['growth', 'value'].map(style => group.filter(item => item.style === style)
      .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id)));
    const counts = [minimum, minimum];
    while ((counts[0] + counts[1]) * cap < 1 - 1e-12) {
      const available = [0, 1].filter(index => counts[index] < Math.min(maximum, ranked[index].length));
      if (!available.length) break;
      available.sort((a, b) => ((b === 0 ? profile.growthWeight : 1 - profile.growthWeight) - counts[b] * cap)
        - ((a === 0 ? profile.growthWeight : 1 - profile.growthWeight) - counts[a] * cap));
      counts[available[0]]++;
    }
    const selected = ranked.map((items, index) => items.slice(0, counts[index]));
    if (selected.some((items, index) => items.length < counts[index] || counts[index] > maximum)
      || (counts[0] + counts[1]) * cap < 1 - 1e-12) {
      issues.push(`${sleeve}: insufficient candidates for style/count/weight limits / 候选不足以满足风格数量与单股上限 (growth=${ranked[0].length}, value=${ranked[1].length})`);
      continue;
    }
    const growthWeight = Math.max(1 - counts[1] * cap, Math.min(counts[0] * cap, profile.growthWeight));
    selected.forEach((items, index) => {
      const budget = index === 0 ? growthWeight : 1 - growthWeight;
      const units = Math.round(budget * 100_000_000);
      const base = Math.floor(units / items.length);
      items.forEach((item, position) => holdings.push({ tickerUniverseId: item.id,
        weight: (base + (position < units % items.length ? 1 : 0)) / 100_000_000 }));
    });
  }
  const ready = issues.length === 0;
  return { modelVersion: 'scenario-stock-screen-v1', scenario: input.scenario, generatedAt: asOf.toISOString(),
    profile, policy: input.policy, universeCount: input.universe.length, eligibleCount: candidates.length,
    ready, holdings: ready ? holdings : [], issues, excluded, candidates,
    scope: 'organization_catalog', requiresBacktest: true };
}
