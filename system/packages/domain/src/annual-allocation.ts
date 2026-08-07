export type MarketScenario = "bull" | "balanced" | "bear";

export interface MonthlyObservation {
  month: string;
  value: number;
}

export interface AnnualDataSeries {
  usEquity: MonthlyObservation[];
  japanEquity: MonthlyObservation[];
  chinaEquity: MonthlyObservation[];
  hongKongEquity: MonthlyObservation[];
  usCpi: MonthlyObservation[];
  usTenYearYieldPct: MonthlyObservation[];
  usTBillYieldPct: MonthlyObservation[];
  globalCommodity: MonthlyObservation[];
}

interface Bound {
  min: number;
  max: number;
}

export interface AnnualAllocationPolicy {
  calibrationYears: number;
  minimumScenarioMonths: number;
  bullThreshold: number;
  bearThreshold: number;
  allocationStep: number;
  assetBounds: Record<MarketScenario, Record<"equity" | "bond" | "alternative" | "cash", Bound>>;
  marketBounds: Record<"us" | "japan" | "chinaA" | "hongKong", Bound>;
  riskAversion: Record<MarketScenario, number>;
}

export const defaultAnnualAllocationPolicy: AnnualAllocationPolicy = {
  calibrationYears: 20,
  minimumScenarioMonths: 18,
  bullThreshold: 0.05,
  bearThreshold: -0.03,
  allocationStep: 0.05,
  assetBounds: {
    bull: {
      equity: { min: 0.45, max: 0.8 }, bond: { min: 0.1, max: 0.4 },
      alternative: { min: 0.05, max: 0.25 }, cash: { min: 0.05, max: 0.15 },
    },
    balanced: {
      equity: { min: 0.35, max: 0.65 }, bond: { min: 0.2, max: 0.5 },
      alternative: { min: 0.05, max: 0.25 }, cash: { min: 0.05, max: 0.2 },
    },
    bear: {
      equity: { min: 0.2, max: 0.5 }, bond: { min: 0.3, max: 0.6 },
      alternative: { min: 0.05, max: 0.25 }, cash: { min: 0.1, max: 0.3 },
    },
  },
  marketBounds: {
    us: { min: 0.35, max: 0.7 }, japan: { min: 0.1, max: 0.35 },
    chinaA: { min: 0.1, max: 0.35 }, hongKong: { min: 0.05, max: 0.25 },
  },
  riskAversion: { bull: 0.2, balanced: 0.45, bear: 0.8 },
};

export interface ReturnStatistics {
  annualizedReturn: number;
  annualizedVolatility: number;
  maximumDrawdown: number;
}

export interface AnnualAllocationRecommendation {
  modelVersion: string;
  scenario: MarketScenario;
  asOfDate: string;
  historyStartDate: string;
  scenarioSampleMonths: number;
  regimeRules: { bullAtOrAbove: number; bearAtOrBelow: number };
  assetWeights: Record<"equity" | "bond" | "alternative" | "cash", number>;
  sleeveWeights: Record<"us" | "developedNonUs" | "emerging", number>;
  marketWeights: Record<"us" | "japan" | "chinaA" | "hongKong", number>;
  latestIndicators: {
    inflationYearOverYear: number;
    usTenYearYield: number;
    usTBillYield: number;
    globalEquityMomentum12m: number;
  };
  statistics: Record<string, ReturnStatistics>;
  objective: { expectedReturn: number; expectedVolatility: number; riskAversion: number };
  fixedIncomeMethod: {
    bond: "current_yield_carry";
    cash: "current_short_rate_carry";
    durationAdjustmentApplied: false;
    bondExpectedReturn: number;
    cashExpectedReturn: number;
  };
  policySnapshot: AnnualAllocationPolicy;
}

type ReturnRow = { month: string; values: Record<string, number> };

function sortedValid(points: MonthlyObservation[]): MonthlyObservation[] {
  return points
    .filter((point) => /^\d{4}-\d{2}$/.test(point.month) && Number.isFinite(point.value))
    .sort((left, right) => left.month.localeCompare(right.month));
}

function levelReturns(points: MonthlyObservation[]): Map<string, number> {
  const result = new Map<string, number>();
  const valid = sortedValid(points);
  for (let index = 1; index < valid.length; index += 1) {
    if (valid[index - 1].value > 0) result.set(valid[index].month, valid[index].value / valid[index - 1].value - 1);
  }
  return result;
}

function levelMap(points: MonthlyObservation[]): Map<string, number> {
  return new Map(sortedValid(points).map((point) => [point.month, point.value]));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleCovariance(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  return left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / (left.length - 1);
}

function statistics(values: number[]): ReturnStatistics {
  const annualizedReturn = mean(values) * 12;
  const annualizedVolatility = Math.sqrt(Math.max(0, sampleCovariance(values, values))) * Math.sqrt(12);
  let wealth = 1;
  let peak = 1;
  let maximumDrawdown = 0;
  values.forEach((value) => {
    wealth *= 1 + value;
    peak = Math.max(peak, wealth);
    maximumDrawdown = Math.min(maximumDrawdown, wealth / peak - 1);
  });
  return { annualizedReturn, annualizedVolatility, maximumDrawdown };
}

function enumerateWeights(names: string[], bounds: Record<string, Bound>, step: number): Array<Record<string, number>> {
  const units = Math.round(1 / step);
  const results: Array<Record<string, number>> = [];
  const visit = (index: number, remaining: number, current: Record<string, number>) => {
    const name = names[index];
    const minimum = Math.ceil(bounds[name].min / step - 1e-8);
    const maximum = Math.floor(bounds[name].max / step + 1e-8);
    if (index === names.length - 1) {
      if (remaining >= minimum && remaining <= maximum) results.push({ ...current, [name]: remaining * step });
      return;
    }
    for (let value = minimum; value <= maximum && value <= remaining; value += 1) {
      visit(index + 1, remaining - value, { ...current, [name]: value * step });
    }
  };
  visit(0, units, {});
  return results;
}

function optimize(
  rows: ReturnRow[],
  names: string[],
  bounds: Record<string, Bound>,
  step: number,
  riskAversion: number,
  expectedReturnOverrides: Partial<Record<string, number>> = {},
): { weights: Record<string, number>; expectedReturn: number; expectedVolatility: number } {
  if (rows.length < 2) throw new Error("Insufficient observations for allocation optimization");
  const columns = Object.fromEntries(names.map((name) => [name, rows.map((row) => row.values[name])])) as Record<string, number[]>;
  const candidates = enumerateWeights(names, bounds, step);
  if (!candidates.length) throw new Error("Allocation bounds do not permit weights summing to one");
  let best: { weights: Record<string, number>; expectedReturn: number; expectedVolatility: number; utility: number } | null = null;
  candidates.forEach((weights) => {
    const expectedReturn = names.reduce((sum, name) => {
      const annualized = expectedReturnOverrides[name] ?? mean(columns[name]) * 12;
      return sum + weights[name] * annualized;
    }, 0);
    let variance = 0;
    names.forEach((left) => names.forEach((right) => {
      variance += weights[left] * weights[right] * sampleCovariance(columns[left], columns[right]) * 12;
    }));
    const expectedVolatility = Math.sqrt(Math.max(0, variance));
    const concentration = names.reduce((sum, name) => sum + weights[name] ** 2, 0);
    const utility = expectedReturn - riskAversion * expectedVolatility - 0.01 * concentration;
    if (!best || utility > best.utility + 1e-12) best = { weights, expectedReturn, expectedVolatility, utility };
  });
  if (!best) throw new Error("Allocation optimization did not produce a candidate");
  return best;
}

function trailingReturn(values: number[]): number {
  return values.reduce((wealth, value) => wealth * (1 + value), 1) - 1;
}

function latestYearOverYear(points: MonthlyObservation[]): number {
  const valid = sortedValid(points);
  if (valid.length < 13) throw new Error("CPI history requires at least thirteen monthly observations");
  return valid.at(-1)!.value / valid.at(-13)!.value - 1;
}

function latestValue(points: MonthlyObservation[]): number {
  const valid = sortedValid(points);
  if (!valid.length) throw new Error("A required series contains no observations");
  return valid.at(-1)!.value;
}

export function buildAnnualAllocationRecommendation(
  scenario: MarketScenario,
  series: AnnualDataSeries,
  policy: AnnualAllocationPolicy = defaultAnnualAllocationPolicy,
): AnnualAllocationRecommendation {
  const returns = {
    us: levelReturns(series.usEquity),
    japan: levelReturns(series.japanEquity),
    chinaA: levelReturns(series.chinaEquity),
    hongKong: levelReturns(series.hongKongEquity),
    alternative: levelReturns(series.globalCommodity),
  };
  const tenYear = levelMap(series.usTenYearYieldPct);
  const tBill = levelMap(series.usTBillYieldPct);
  const commonMonths = [...returns.us.keys()].filter((month) =>
    returns.japan.has(month) && returns.chinaA.has(month) && returns.hongKong.has(month)
    && returns.alternative.has(month) && tenYear.has(month) && tBill.has(month),
  ).sort();
  if (!commonMonths.length) throw new Error("Required public series do not share a common monthly history");
  const latestMonth = commonMonths.at(-1)!;
  const earliestAllowedYear = Number(latestMonth.slice(0, 4)) - policy.calibrationYears;
  const months = commonMonths.filter((month) => Number(month.slice(0, 4)) >= earliestAllowedYear);
  const globalEquityReturns = months.map((month) =>
    returns.us.get(month)! * 0.55 + returns.japan.get(month)! * 0.15
    + returns.chinaA.get(month)! * 0.15 + returns.hongKong.get(month)! * 0.15,
  );
  const rows: ReturnRow[] = [];
  for (let index = 12; index < months.length; index += 1) {
    const signal = trailingReturn(globalEquityReturns.slice(index - 12, index));
    const regime: MarketScenario = signal >= policy.bullThreshold ? "bull" : signal <= policy.bearThreshold ? "bear" : "balanced";
    if (regime !== scenario) continue;
    const month = months[index];
    const priorMonth = months[index - 1];
    const priorYield = tenYear.get(priorMonth)! / 100;
    const priorCashYield = tBill.get(priorMonth)! / 100;
    rows.push({
      month,
      values: {
        us: returns.us.get(month)!, japan: returns.japan.get(month)!,
        chinaA: returns.chinaA.get(month)!, hongKong: returns.hongKong.get(month)!,
        equity: globalEquityReturns[index], bond: priorYield / 12,
        alternative: returns.alternative.get(month)!, cash: priorCashYield / 12,
      },
    });
  }
  if (rows.length < policy.minimumScenarioMonths) {
    throw new Error(`Only ${rows.length} historical months match the selected scenario; ${policy.minimumScenarioMonths} are required`);
  }
  const assetNames = ["equity", "bond", "alternative", "cash"];
  const marketNames = ["us", "japan", "chinaA", "hongKong"];
  const bondExpectedReturn = latestValue(series.usTenYearYieldPct) / 100;
  const cashExpectedReturn = latestValue(series.usTBillYieldPct) / 100;
  const assets = optimize(
    rows,
    assetNames,
    policy.assetBounds[scenario],
    policy.allocationStep,
    policy.riskAversion[scenario],
    { bond: bondExpectedReturn, cash: cashExpectedReturn },
  );
  const markets = optimize(rows, marketNames, policy.marketBounds, policy.allocationStep, policy.riskAversion[scenario]);
  const statisticNames = [...assetNames, ...marketNames];
  const resultStatistics = Object.fromEntries(statisticNames.map((name) => [name, statistics(rows.map((row) => row.values[name]))]));
  resultStatistics.bond.annualizedReturn = bondExpectedReturn;
  resultStatistics.cash.annualizedReturn = cashExpectedReturn;
  return {
    modelVersion: "annual-regime-allocation-v1.1.0",
    scenario,
    asOfDate: `${latestMonth}-01`,
    historyStartDate: `${months[0]}-01`,
    scenarioSampleMonths: rows.length,
    regimeRules: { bullAtOrAbove: policy.bullThreshold, bearAtOrBelow: policy.bearThreshold },
    assetWeights: assets.weights as AnnualAllocationRecommendation["assetWeights"],
    sleeveWeights: {
      us: markets.weights.us,
      developedNonUs: markets.weights.japan,
      emerging: markets.weights.chinaA + markets.weights.hongKong,
    },
    marketWeights: markets.weights as AnnualAllocationRecommendation["marketWeights"],
    latestIndicators: {
      inflationYearOverYear: latestYearOverYear(series.usCpi),
      usTenYearYield: latestValue(series.usTenYearYieldPct) / 100,
      usTBillYield: latestValue(series.usTBillYieldPct) / 100,
      globalEquityMomentum12m: trailingReturn(globalEquityReturns.slice(-12)),
    },
    statistics: resultStatistics,
    objective: {
      expectedReturn: assets.expectedReturn,
      expectedVolatility: assets.expectedVolatility,
      riskAversion: policy.riskAversion[scenario],
    },
    fixedIncomeMethod: {
      bond: "current_yield_carry",
      cash: "current_short_rate_carry",
      durationAdjustmentApplied: false,
      bondExpectedReturn,
      cashExpectedReturn,
    },
    policySnapshot: structuredClone(policy),
  };
}
