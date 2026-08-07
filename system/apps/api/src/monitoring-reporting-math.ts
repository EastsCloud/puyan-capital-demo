export interface GroupResult {
  key: string;
  sleeve: string;
  style: string;
  targetWeight: number;
  currentWeight: number;
  lowerWeight: number;
  upperWeight: number;
  status: "within" | "below" | "above";
  minimumTradeValue: number;
  tradeSide: "BUY" | "SELL" | null;
}

export function isoBusinessDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function valuationDateMatchesLatestEquitySnapshot(
  valuationDate: string | Date,
  latestEquityBusinessDate: string | Date,
): boolean {
  return isoBusinessDate(valuationDate) === isoBusinessDate(latestEquityBusinessDate);
}

export function addTradingDays(dateText: string | Date, tradingDays: number): string {
  const isoDate = isoBusinessDate(dateText);
  const date = new Date(`${isoDate}T12:00:00Z`);
  let added = 0;
  while (added < tradingDays) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

export function calculateGroups(
  approved: { targets: any; holdings: Array<any> },
  lines: Array<any>,
  lowerRelative: number,
  upperRelative: number,
): GroupResult[] {
  const total = lines.reduce((sum, line) => sum + Number(line.market_value), 0);
  if (total <= 0) throw new Error("Equity market value must be positive");
  const equityTargets = approved.targets.equityTargets as Array<{ key: string; weight: number }>;
  const equityTargetTotal = equityTargets.reduce((sum, target) => sum + Number(target.weight), 0);
  if (equityTargetTotal <= 0) throw new Error("Approved equity targets must have a positive total weight");
  const results: GroupResult[] = [];
  for (const sleeveTarget of equityTargets) {
    for (const style of ["growth", "value"] as const) {
      const approvedInGroup = approved.holdings.filter((holding) => holding.sleeve === sleeveTarget.key && holding.style === style);
      const withinSleeveWeight = approvedInGroup.reduce((sum, holding) => sum + Number(holding.weight), 0);
      const targetWeight = (Number(sleeveTarget.weight) / equityTargetTotal) * withinSleeveWeight;
      const groupValue = lines.filter((line) => line.classification.sleeve === sleeveTarget.key && line.classification.style === style)
        .reduce((sum, line) => sum + Number(line.market_value), 0);
      const currentWeight = groupValue / total;
      const lowerWeight = targetWeight * (1 + lowerRelative);
      const upperWeight = targetWeight * (1 + upperRelative);
      let status: GroupResult["status"] = "within";
      let minimumTradeValue = 0;
      let tradeSide: GroupResult["tradeSide"] = null;
      if (currentWeight < lowerWeight) {
        status = "below";
        tradeSide = "BUY";
        minimumTradeValue = (lowerWeight * total - groupValue) / (1 - lowerWeight);
      } else if (currentWeight > upperWeight) {
        status = "above";
        tradeSide = "SELL";
        minimumTradeValue = (groupValue - upperWeight * total) / (1 - upperWeight);
      }
      results.push({ key: `${sleeveTarget.key}:${style}`, sleeve: sleeveTarget.key, style, targetWeight, currentWeight, lowerWeight, upperWeight, status, minimumTradeValue: Math.max(0, minimumTradeValue), tradeSide });
    }
  }
  return results;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1));
}

export function performance(values: Array<{ date: string; value: number }>) {
  if (values.length < 2 || values[0].value <= 0) return { observationCount: values.length, periodReturn: null, annualizedReturn: null, sharpe: null, sortino: null, maximumDrawdown: null };
  const returns = values.slice(1).map((item, index) => item.value / values[index].value - 1);
  const periodReturn = values.at(-1)!.value / values[0].value - 1;
  const days = Math.max(1, (new Date(values.at(-1)!.date).getTime() - new Date(values[0].date).getTime()) / 86_400_000);
  const annualizedReturn = Math.pow(1 + periodReturn, 365 / days) - 1;
  const volatility = standardDeviation(returns);
  const downside = Math.sqrt(average(returns.filter((value) => value < 0).map((value) => value * value)));
  const riskMetricsAvailable = values.length >= 20;
  let peak = values[0].value; let maximumDrawdown = 0;
  for (const item of values) { peak = Math.max(peak, item.value); maximumDrawdown = Math.min(maximumDrawdown, item.value / peak - 1); }
  return {
    observationCount: values.length, periodReturn, annualizedReturn,
    sharpe: riskMetricsAvailable && volatility > 0 ? average(returns) / volatility * Math.sqrt(252) : null,
    sortino: riskMetricsAvailable && downside > 0 ? average(returns) / downside * Math.sqrt(252) : null,
    maximumDrawdown,
  };
}

export function modifiedDietzReturn(
  openingValue: number,
  endingValue: number,
  startDate: string,
  endDate: string,
  flows: Array<{ date: string; amount: number }>,
) {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);
  const netFlow = flows.reduce((sum, flow) => sum + flow.amount, 0);
  const weightedFlow = flows.reduce((sum, flow) => {
    const elapsed = Math.max(0, Math.min(totalDays, (Date.parse(`${flow.date}T00:00:00Z`) - startMs) / 86_400_000));
    return sum + flow.amount * ((totalDays - elapsed) / totalDays);
  }, 0);
  const denominator = openingValue + weightedFlow;
  if (!(denominator > 0)) throw new Error("Modified Dietz denominator must be positive");
  return { returnRate: (endingValue - openingValue - netFlow) / denominator, netFlow, weightedFlow };
}

export interface AttributionSleeve {
  key: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export function brinsonFachlerAttribution(sleeves: AttributionSleeve[]) {
  const portfolioWeightTotal = sleeves.reduce((sum, item) => sum + item.portfolioWeight, 0);
  const benchmarkWeightTotal = sleeves.reduce((sum, item) => sum + item.benchmarkWeight, 0);
  if (Math.abs(portfolioWeightTotal - 1) > 1e-6 || Math.abs(benchmarkWeightTotal - 1) > 1e-6) {
    throw new Error("Portfolio and benchmark sleeve weights must each sum to 100%");
  }
  const portfolioReturn = sleeves.reduce((sum, item) => sum + item.portfolioWeight * item.portfolioReturn, 0);
  const benchmarkReturn = sleeves.reduce((sum, item) => sum + item.benchmarkWeight * item.benchmarkReturn, 0);
  const allocationEffect = sleeves.reduce(
    (sum, item) => sum + (item.portfolioWeight - item.benchmarkWeight) * (item.benchmarkReturn - benchmarkReturn),
    0,
  );
  const selectionEffect = sleeves.reduce(
    (sum, item) => sum + item.benchmarkWeight * (item.portfolioReturn - item.benchmarkReturn),
    0,
  );
  const interactionEffect = sleeves.reduce(
    (sum, item) => sum + (item.portfolioWeight - item.benchmarkWeight) * (item.portfolioReturn - item.benchmarkReturn),
    0,
  );
  return {
    portfolioReturn,
    benchmarkReturn,
    allocationEffect,
    selectionEffect,
    interactionEffect,
    excessReturn: portfolioReturn - benchmarkReturn,
  };
}
