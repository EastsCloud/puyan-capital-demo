import type { PriceSeries } from './market-history.js';
export function weightedReturns(series: Array<{ data: PriceSeries; weight: number }>, commonWeeks: string[]): number[] {
  const maps = series.map((item) => ({ weight: item.weight, prices: new Map(item.data.points.map((point) => [point.week, point.value])) }));
  const returns: number[] = [];
  for (let index = 1; index < commonWeeks.length; index += 1) {
    const previous = commonWeeks[index - 1];
    const current = commonWeeks[index];
    returns.push(maps.reduce((sum, item) => sum + item.weight * (item.prices.get(current)! / item.prices.get(previous)! - 1), 0));
  }
  return returns;
}

export function annualizedReturn(returns: number[]): number {
  const wealth = returns.reduce((value, item) => value * (1 + item), 1);
  return Math.pow(wealth, 52 / returns.length) - 1;
}

export function maximumDrawdown(returns: number[]): number {
  let wealth = 1;
  let peak = 1;
  let worst = 0;
  for (const item of returns) {
    wealth *= 1 + item;
    peak = Math.max(peak, wealth);
    worst = Math.min(worst, wealth / peak - 1);
  }
  return worst;
}

export function calculateBeta(portfolio: number[], benchmark: number[]): number {
  const pMean = portfolio.reduce((sum, value) => sum + value, 0) / portfolio.length;
  const bMean = benchmark.reduce((sum, value) => sum + value, 0) / benchmark.length;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < portfolio.length; index += 1) {
    covariance += (portfolio[index] - pMean) * (benchmark[index] - bMean);
    variance += Math.pow(benchmark[index] - bMean, 2);
  }
  if (variance <= 1e-16) throw Object.assign(new Error("Benchmark variance is too small to calculate beta"), { statusCode: 409 });
  return covariance / variance;
}
